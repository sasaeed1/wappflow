'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · CONTRACTS  — a self-contained, full e-signature module
 * ─────────────────────────────────────────────────────────────────────────────
 *  Additive: owns the `contracts*` tables only; touches no existing table/route.
 *  Compliance (ESIGN / UETA): explicit intent-to-sign consent, a full audit
 *  trail (IP, user-agent, timestamps for sent/viewed/signed), and a SHA-256
 *  tamper-evidence hash baked into a Certificate of Completion in the signed PDF.
 *  Delivery rides the existing WhatsApp + SMTP rails. Signing is a public,
 *  tokenized page (the token IS the capability — no account needed to sign).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
let PDFDocument = null; try { PDFDocument = require('pdfkit'); } catch {}

module.exports = function mountContracts(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    logAudit = () => {},
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    path = require('path'),
    fs = require('fs'),
    uploadsDir = path.join(__dirname, 'uploads'),
    clientBaseUrl = process.env.FRONTEND_URL || '',
    sendClientMessage = async () => ({ skipped: true }),   // WhatsApp ({ lead, userId, text })
    sendEmail = async () => ({ skipped: true }),            // SMTP ({ workspaceOwnerId, to, subject, html, text })
  } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      lead_id TEXT,
      title TEXT NOT NULL,
      body TEXT,                          -- contract text (supports {{merge}} fields)
      status TEXT DEFAULT 'draft',        -- draft|sent|viewed|signed|completed|declined|voided
      token TEXT UNIQUE,
      signer_name TEXT, signer_email TEXT, signer_phone TEXT,
      amount REAL,
      signed_typed_name TEXT,
      signature_data TEXT,                -- base64 PNG of the drawn signature
      consent INTEGER DEFAULT 0,
      doc_hash TEXT,                      -- SHA-256 tamper-evidence
      signed_pdf_key TEXT,
      sent_at TIMESTAMP, viewed_at TIMESTAMP, signed_at TIMESTAMP, completed_at TIMESTAMP,
      declined_at TIMESTAMP, voided_at TIMESTAMP, expires_at TIMESTAMP,
      decline_reason TEXT,
      settings TEXT DEFAULT '{}',
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contract_events (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      workspace_id TEXT,
      type TEXT NOT NULL,                 -- created|sent|viewed|signed|declined|voided|reminded
      actor TEXT, ip TEXT, user_agent TEXT,
      meta TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contract_templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_ws ON contracts(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_token ON contracts(token);
    CREATE INDEX IF NOT EXISTS idx_contract_events_c ON contract_events(contract_id);
  `);

  const contractsDir = path.join(uploadsDir, 'contracts');
  try { fs.mkdirSync(contractsDir, { recursive: true }); } catch {}

  const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const signUrl = (c) => `${clientBaseUrl}/sign/${c.token}`;
  const safeJson = (s, d = {}) => { try { return JSON.parse(s || '') || d; } catch { return d; } };

  function recordEvent(contract, type, { actor, ip, ua, meta } = {}) {
    db.prepare(`INSERT INTO contract_events (id, contract_id, workspace_id, type, actor, ip, user_agent, meta) VALUES (?,?,?,?,?,?,?,?)`)
      .run(generateId(), contract.id, contract.workspace_id, type, actor || null, ip || null, ua || null, JSON.stringify(meta || {}));
  }

  function mergeBody(body, c) {
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return String(body || '')
      .replace(/\{\{\s*client_name\s*\}\}/gi, c.signer_name || '')
      .replace(/\{\{\s*date\s*\}\}/gi, date)
      .replace(/\{\{\s*amount\s*\}\}/gi, c.amount != null ? String(c.amount) : '');
  }

  function shape(c, { withBody = true } = {}) {
    return {
      id: c.id, lead_id: c.lead_id, title: c.title, status: c.status,
      signer_name: c.signer_name, signer_email: c.signer_email, signer_phone: c.signer_phone,
      amount: c.amount, token: c.token, sign_url: c.token ? signUrl(c) : null,
      sent_at: c.sent_at, viewed_at: c.viewed_at, signed_at: c.signed_at, declined_at: c.declined_at,
      voided_at: c.voided_at, expires_at: c.expires_at, decline_reason: c.decline_reason,
      doc_hash: c.doc_hash, has_signed_pdf: !!c.signed_pdf_key,
      created_at: c.created_at, ...(withBody ? { body: c.body } : {}),
    };
  }

  function getContract(workspaceId, id) {
    return db.prepare('SELECT * FROM contracts WHERE id = ? AND workspace_id = ?').get(id, workspaceId);
  }
  function eventsFor(id) {
    return db.prepare('SELECT type, actor, ip, user_agent, meta, created_at FROM contract_events WHERE contract_id = ? ORDER BY created_at').all(id)
      .map(e => ({ ...e, meta: safeJson(e.meta) }));
  }

  // ── Signed PDF + Certificate of Completion ─────────────────────────────────
  function buildSignedPdf(absPath, c, events) {
    return new Promise((resolve, reject) => {
      if (!PDFDocument) return reject(new Error('pdfkit unavailable'));
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const stream = fs.createWriteStream(absPath);
      doc.pipe(stream);

      doc.fontSize(22).fillColor('#111').text(c.title, { align: 'left' });
      doc.moveDown(0.6);
      doc.fontSize(10.5).fillColor('#444').text(mergeBody(c.body, c), { align: 'left', lineGap: 3 });
      doc.moveDown(1.4);

      doc.strokeColor('#ddd').moveTo(56, doc.y).lineTo(539, doc.y).stroke();
      doc.moveDown(0.8);
      doc.fontSize(12).fillColor('#111').text('Signature', { underline: false });
      doc.moveDown(0.4);
      if (c.signature_data) {
        try {
          const b64 = String(c.signature_data).split(',').pop();
          doc.image(Buffer.from(b64, 'base64'), { fit: [220, 90] });
        } catch { /* skip image */ }
      }
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#222').text(`${c.signed_typed_name || c.signer_name || ''}`);
      doc.fontSize(9).fillColor('#666').text(`Signed ${c.signed_at || ''} (UTC)`);

      // Certificate of Completion — the audit trail.
      doc.addPage();
      doc.fontSize(18).fillColor('#111').text('Certificate of Completion');
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text('This certificate documents the electronic signature of this document under the ESIGN Act / UETA.');
      doc.moveDown(0.8);
      doc.fontSize(10).fillColor('#222');
      doc.text(`Document: ${c.title}`);
      doc.text(`Contract ID: ${c.id}`);
      doc.text(`Signer: ${c.signed_typed_name || c.signer_name || ''}${c.signer_email ? ` · ${c.signer_email}` : ''}`);
      doc.text(`Intent to sign consent: ${c.consent ? 'Accepted' : 'Not recorded'}`);
      doc.text(`Tamper-evidence (SHA-256): ${c.doc_hash || ''}`, { width: 460 });
      doc.moveDown(0.8);
      doc.fontSize(12).fillColor('#111').text('Audit trail');
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#333');
      (events || []).forEach(e => {
        const when = e.created_at || '';
        doc.text(`• ${e.type.toUpperCase()} — ${when} UTC${e.ip ? ` · IP ${e.ip}` : ''}${e.user_agent ? ` · ${String(e.user_agent).slice(0, 70)}` : ''}`, { lineGap: 2 });
      });

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  // ── Authed endpoints ───────────────────────────────────────────────────────
  app.get('/api/contracts', auth, (req, res) => {
    try {
      const params = [req.workspaceId]; let where = 'workspace_id = ?';
      if (req.query.lead_id) { where += ' AND lead_id = ?'; params.push(req.query.lead_id); }
      if (req.query.status) { where += ' AND status = ?'; params.push(req.query.status); }
      const rows = db.prepare(`SELECT * FROM contracts WHERE ${where} ORDER BY created_at DESC`).all(...params);
      res.json({ contracts: rows.map(c => shape(c, { withBody: false })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/contracts', auth, (req, res) => {
    try {
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' });
      let body = b.body || '';
      if (b.template_id) { const t = db.prepare('SELECT body FROM contract_templates WHERE id = ? AND workspace_id = ?').get(b.template_id, req.workspaceId); if (t) body = t.body; }
      // auto-fill signer from a linked lead
      let lead = null;
      if (b.lead_id) lead = db.prepare('SELECT customer_name, customer_phone, email FROM leads WHERE id = ? AND workspace_id = ?').get(b.lead_id, req.workspaceId);
      const id = generateId();
      db.prepare(`INSERT INTO contracts (id, workspace_id, lead_id, title, body, signer_name, signer_email, signer_phone, amount, expires_at, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, req.workspaceId, b.lead_id || null, String(b.title).slice(0, 200), body,
        b.signer_name || lead?.customer_name || null, b.signer_email || lead?.email || null, b.signer_phone || lead?.customer_phone || null,
        b.amount != null ? Number(b.amount) : null, b.expires_at || null, req.userId);
      const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
      recordEvent(c, 'created', { actor: req.userId });
      logAudit(req.workspaceId, req.userId, 'contract_create', 'contract', id, { title: c.title });
      res.json(shape(c));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/contracts/:id', auth, (req, res) => {
    try {
      const c = getContract(req.workspaceId, req.params.id);
      if (!c) return res.status(404).json({ error: 'Contract not found' });
      res.json({ ...shape(c), events: eventsFor(c.id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/contracts/:id', auth, (req, res) => {
    try {
      const c = getContract(req.workspaceId, req.params.id);
      if (!c) return res.status(404).json({ error: 'Contract not found' });
      if (!['draft', 'sent', 'viewed'].includes(c.status)) return res.status(400).json({ error: 'Signed or closed contracts can’t be edited' });
      const b = req.body || {}; const set = {}; const allow = ['title', 'body', 'signer_name', 'signer_email', 'signer_phone', 'amount', 'expires_at'];
      allow.forEach(k => { if (b[k] !== undefined) set[k] = (k === 'amount' && b[k] != null) ? Number(b[k]) : b[k]; });
      const keys = Object.keys(set);
      if (keys.length) db.prepare(`UPDATE contracts SET ${keys.map(k => `${k}=@${k}`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({ ...set, id: c.id });
      res.json(shape(db.prepare('SELECT * FROM contracts WHERE id = ?').get(c.id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/contracts/:id', auth, (req, res) => {
    try {
      const c = getContract(req.workspaceId, req.params.id);
      if (!c) return res.status(404).json({ error: 'Contract not found' });
      db.prepare('DELETE FROM contracts WHERE id = ?').run(c.id);
      db.prepare('DELETE FROM contract_events WHERE contract_id = ?').run(c.id);
      if (c.signed_pdf_key) { try { fs.unlinkSync(path.join(uploadsDir, c.signed_pdf_key)); } catch {} }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // SEND — generate the link and deliver over WhatsApp and/or Email.
  app.post('/api/contracts/:id/send', auth, async (req, res) => {
    try {
      const c = getContract(req.workspaceId, req.params.id);
      if (!c) return res.status(404).json({ error: 'Contract not found' });
      if (['signed', 'completed', 'voided'].includes(c.status)) return res.status(400).json({ error: 'Contract is already closed' });
      const channels = Array.isArray(req.body.channels) && req.body.channels.length ? req.body.channels : ['whatsapp'];
      const token = c.token || crypto.randomBytes(18).toString('hex');
      db.prepare("UPDATE contracts SET token = ?, status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(token, c.id);
      const fresh = db.prepare('SELECT * FROM contracts WHERE id = ?').get(c.id);
      const link = signUrl(fresh);
      const delivery = {};

      if (channels.includes('whatsapp')) {
        const lead = c.lead_id ? db.prepare('SELECT * FROM leads WHERE id = ?').get(c.lead_id) : null;
        const phone = lead?.customer_phone || c.signer_phone;
        if (phone) {
          try { await sendClientMessage({ lead: lead || { customer_phone: phone, id: c.lead_id }, userId: req.userId, text: `📄 Please review & sign "${c.title}":\n${link}` }); delivery.whatsapp = 'sent'; }
          catch (e) { delivery.whatsapp = 'failed'; }
        } else delivery.whatsapp = 'no_phone';
      }
      if (channels.includes('email')) {
        if (c.signer_email) {
          const html = `<p>Hello ${c.signer_name || ''},</p><p>Please review and sign <strong>${c.title}</strong>.</p><p><a href="${link}" style="display:inline-block;padding:11px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Review &amp; sign</a></p><p>Or open: ${link}</p>`;
          try { const r = await sendEmail({ workspaceOwnerId: req.workspaceOwnerId, to: c.signer_email, subject: `Please sign: ${c.title}`, html, text: `Review & sign "${c.title}": ${link}` }); delivery.email = r?.skipped ? 'not_configured' : 'sent'; }
          catch (e) { delivery.email = 'failed'; }
        } else delivery.email = 'no_email';
      }

      recordEvent(fresh, 'sent', { actor: req.userId, meta: { channels, delivery } });
      if (c.lead_id) addContactHistory(c.lead_id, req.userId, 'contract', `Contract "${c.title}" sent for signature`);
      broadcastToWorkspace(req.workspaceId, 'contract_updated', { id: c.id });
      logAudit(req.workspaceId, req.userId, 'contract_send', 'contract', c.id, { channels, delivery });
      res.json({ ...shape(fresh), delivery });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/contracts/:id/void', auth, (req, res) => {
    try {
      const c = getContract(req.workspaceId, req.params.id);
      if (!c) return res.status(404).json({ error: 'Contract not found' });
      db.prepare("UPDATE contracts SET status = 'voided', voided_at = CURRENT_TIMESTAMP WHERE id = ?").run(c.id);
      recordEvent(c, 'voided', { actor: req.userId });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/contracts/:id/pdf', auth, (req, res) => {
    try {
      const c = getContract(req.workspaceId, req.params.id);
      if (!c || !c.signed_pdf_key) return res.status(404).json({ error: 'No signed PDF' });
      const abs = path.join(uploadsDir, c.signed_pdf_key);
      if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });
      res.download(abs, `${c.title.replace(/[^\w]+/g, '_')}-signed.pdf`);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Templates ──────────────────────────────────────────────────────────────
  app.get('/api/contract-templates', auth, (req, res) => {
    try { res.json({ templates: db.prepare('SELECT * FROM contract_templates WHERE workspace_id = ? ORDER BY created_at DESC').all(req.workspaceId) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/contract-templates', auth, (req, res) => {
    try {
      if (!req.body.title) return res.status(400).json({ error: 'Title required' });
      const id = generateId();
      db.prepare('INSERT INTO contract_templates (id, workspace_id, title, body, created_by) VALUES (?,?,?,?,?)').run(id, req.workspaceId, String(req.body.title).slice(0, 200), req.body.body || '', req.userId);
      res.json(db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/contract-templates/:id', auth, (req, res) => {
    try { db.prepare('DELETE FROM contract_templates WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── PUBLIC signing (no auth — the token is the capability) ──────────────────
  function loadByToken(token) { return db.prepare('SELECT * FROM contracts WHERE token = ?').get(token); }

  app.get('/api/contracts/sign/:token', (req, res) => {
    try {
      const c = loadByToken(req.params.token);
      if (!c || c.status === 'voided') return res.status(404).json({ error: 'Contract not available' });
      if (c.expires_at && new Date(c.expires_at) < new Date() && c.status !== 'signed' && c.status !== 'completed') return res.status(410).json({ error: 'This signing link has expired' });
      if (['sent'].includes(c.status)) {
        db.prepare("UPDATE contracts SET status = 'viewed', viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP) WHERE id = ?").run(c.id);
        recordEvent(c, 'viewed', { actor: 'signer', ip: clientIp(req), ua: req.headers['user-agent'] });
        broadcastToWorkspace(c.workspace_id, 'contract_updated', { id: c.id });
      }
      const fresh = db.prepare('SELECT * FROM contracts WHERE id = ?').get(c.id);
      res.json({
        title: fresh.title, body: mergeBody(fresh.body, fresh), signer_name: fresh.signer_name,
        amount: fresh.amount, status: fresh.status, signed_at: fresh.signed_at,
        signed_typed_name: fresh.signed_typed_name, doc_hash: fresh.doc_hash,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/contracts/sign/:token', async (req, res) => {
    try {
      const c = loadByToken(req.params.token);
      if (!c || c.status === 'voided') return res.status(404).json({ error: 'Contract not available' });
      if (c.status === 'signed' || c.status === 'completed') return res.status(400).json({ error: 'Already signed' });
      const { typed_name, signature_data, consent } = req.body || {};
      if (!consent) return res.status(400).json({ error: 'You must agree to sign electronically.' });
      if (!typed_name || !String(typed_name).trim()) return res.status(400).json({ error: 'Please type your full name.' });
      if (!signature_data) return res.status(400).json({ error: 'Please draw your signature.' });

      const ip = clientIp(req); const ua = req.headers['user-agent'] || '';
      const signedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const hash = crypto.createHash('sha256').update(`${c.id}::${c.title}::${c.body}::${typed_name}::${signature_data}::${signedAt}`).digest('hex');

      db.prepare(`UPDATE contracts SET status='signed', signed_at=?, signed_typed_name=?, signature_data=?, consent=1, doc_hash=? WHERE id=?`)
        .run(signedAt, String(typed_name).slice(0, 120), signature_data, hash, c.id);
      recordEvent(c, 'signed', { actor: 'signer', ip, ua, meta: { typed_name, consent: true } });

      const signed = db.prepare('SELECT * FROM contracts WHERE id = ?').get(c.id);
      // Generate the signed PDF + certificate (best-effort; signature is valid regardless).
      let pdfKey = null;
      if (PDFDocument) {
        try {
          const fname = `${c.id}-signed.pdf`;
          await buildSignedPdf(path.join(contractsDir, fname), signed, eventsFor(c.id));
          pdfKey = `contracts/${fname}`;
          db.prepare('UPDATE contracts SET signed_pdf_key = ?, status = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?').run(pdfKey, 'completed', signedAt, c.id);
        } catch { db.prepare("UPDATE contracts SET status = 'completed' WHERE id = ?").run(c.id); }
      } else {
        db.prepare("UPDATE contracts SET status = 'completed' WHERE id = ?").run(c.id);
      }

      if (c.lead_id) addContactHistory(c.lead_id, c.created_by, 'contract', `Contract "${c.title}" signed by ${typed_name}`);
      broadcastToWorkspace(c.workspace_id, 'contract_signed', { id: c.id });
      // Notify the sender on WhatsApp that it's signed (best-effort).
      try {
        const lead = c.lead_id ? db.prepare('SELECT * FROM leads WHERE id = ?').get(c.lead_id) : null;
        if (lead?.customer_phone) await sendClientMessage({ lead, userId: c.created_by, text: `✅ "${c.title}" has been signed. Thank you!` });
      } catch {}
      res.json({ ok: true, doc_hash: hash });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/contracts/sign/:token/decline', (req, res) => {
    try {
      const c = loadByToken(req.params.token);
      if (!c) return res.status(404).json({ error: 'Not found' });
      if (['signed', 'completed'].includes(c.status)) return res.status(400).json({ error: 'Already signed' });
      db.prepare("UPDATE contracts SET status='declined', declined_at=CURRENT_TIMESTAMP, decline_reason=? WHERE id=?").run(String(req.body.reason || '').slice(0, 500), c.id);
      recordEvent(c, 'declined', { actor: 'signer', ip: clientIp(req), ua: req.headers['user-agent'], meta: { reason: req.body.reason || '' } });
      broadcastToWorkspace(c.workspace_id, 'contract_updated', { id: c.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Public signed-PDF download (only once signed).
  app.get('/api/contracts/sign/:token/pdf', (req, res) => {
    try {
      const c = loadByToken(req.params.token);
      if (!c || !c.signed_pdf_key) return res.status(404).json({ error: 'No signed PDF' });
      const abs = path.join(uploadsDir, c.signed_pdf_key);
      if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });
      res.download(abs, `${c.title.replace(/[^\w]+/g, '_')}-signed.pdf`);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
