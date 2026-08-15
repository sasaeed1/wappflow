'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · CONTRACTS STUDIO  — client-centric proposals, contracts & e-sign.
 *  A first-class module (see CONTRACTS-STUDIO-DESIGN.md). Block-based documents,
 *  interactive proposals, multi-party signing, deep CRM integration.
 *  Owns the `cs_*` tables only — touches no existing table/route.
 *  Phase 1: schema + document CRUD + templates + dashboard overview.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
const pagination = require('./pagination');
let ai = null; try { ai = require('./ai-engine'); } catch { /* AI optional */ }
let cron = null; try { cron = require('node-cron'); } catch { /* scheduler optional */ }
let pricing = null; try { pricing = require('./pricing'); } catch { /* pricing optional */ }

// Allowed block types the AI may emit when drafting a document.
const AI_BLOCK_TYPES = ['heading', 'text', 'callout', 'divider', 'pricing_table', 'package', 'addons', 'timeline', 'checklist', 'faq', 'testimonial', 'signature'];

// ── Industry packs — curated starting points so the studio is never a blank page.
const PACKS = [
  {
    id: 'wedding-proposal', type: 'proposal', industry: 'Photography', title: 'Wedding Photography Proposal',
    description: 'Interactive packages, timeline & add-ons for couples.', emoji: '💍',
    blocks: [
      { type: 'heading', data: { text: 'Your Wedding, Beautifully Told', level: 1 } },
      { type: 'text', data: { text: 'Thank you for considering us for your big day. Below is everything we’ll capture together — choose the collection that feels right, and add anything that makes it yours.' } },
      { type: 'package', data: { currency: '$', selectable: true, packages: [
        { name: 'Essential', price: '2400', features: ['6 hours coverage', '1 photographer', '400+ edited images', 'Online gallery'], featured: false },
        { name: 'Signature', price: '3800', features: ['10 hours coverage', '2 photographers', '700+ edited images', 'Engagement session', 'Heirloom album'], featured: true },
        { name: 'Luxe', price: '5600', features: ['Full-day coverage', '2 photographers + assistant', 'Unlimited images', 'Engagement + bridal sessions', 'Premium album + parent copies'], featured: false },
      ] } },
      { type: 'addons', data: { currency: '$', items: [
        { label: 'Second shooter (extra)', price: '600', on: false },
        { label: 'Drone aerial coverage', price: '450', on: false },
        { label: 'Same-day highlight reel', price: '800', on: false },
        { label: 'Extra hour of coverage', price: '350', on: false },
      ] } },
      { type: 'timeline', data: { items: [
        { title: 'Booking & retainer', desc: 'Secure your date with a signed agreement + deposit' },
        { title: 'Engagement session', desc: '6–8 weeks before' },
        { title: 'Wedding day', desc: 'We capture every moment' },
        { title: 'Gallery delivery', desc: '4–6 weeks after, with your album proof' },
      ] } },
      { type: 'faq', data: { items: [
        { q: 'How many images will we receive?', a: 'Every keeper, fully edited — counts above are minimums.' },
        { q: 'Do you travel?', a: 'Yes. Travel within 50mi is included; beyond that is quoted at cost.' },
      ] } },
      { type: 'signature', data: { label: 'Accept & sign to reserve your date' } },
    ],
  },
  {
    id: 'portrait-agreement', type: 'contract', industry: 'Photography', title: 'Portrait Session Agreement',
    description: 'Clean session contract with usage & cancellation terms.', emoji: '📸',
    blocks: [
      { type: 'heading', data: { text: 'Portrait Session Agreement', level: 1 } },
      { type: 'text', data: { text: 'This agreement sets out the terms for your portrait session. Please review and sign below.' } },
      { type: 'pricing_table', data: { currency: '$', rows: [{ name: 'Portrait session (1hr)', desc: 'Studio or location', price: '450' }, { name: '15 edited images', desc: 'High-resolution digital delivery', price: '0' }] } },
      { type: 'checklist', data: { items: [{ text: 'Session fee due at booking to reserve the date' }, { text: 'Rescheduling allowed up to 48h before' }, { text: 'Images delivered within 2 weeks' }, { text: 'Personal-use license included; commercial use quoted separately' }] } },
      { type: 'callout', data: { emoji: '📅', text: 'Cancellations within 48 hours of the session forfeit the booking fee.' } },
      { type: 'signature', data: { label: 'Sign to confirm your booking' } },
    ],
  },
  {
    id: 'commercial-sow', type: 'sow', industry: 'Commercial', title: 'Commercial Shoot — Statement of Work',
    description: 'Scope, deliverables, usage rights & milestones.', emoji: '🎬',
    blocks: [
      { type: 'heading', data: { text: 'Statement of Work', level: 1 } },
      { type: 'text', data: { text: 'This SOW defines the scope, deliverables, and commercial terms for the engagement.' } },
      { type: 'heading', data: { text: 'Deliverables', level: 2 } },
      { type: 'checklist', data: { items: [{ text: 'Pre-production: shot list, scheduling, location scouting' }, { text: 'Production: 1 shoot day, crew of 3' }, { text: 'Post: color grade + 3 edited deliverables' }, { text: 'Two rounds of revisions' }] } },
      { type: 'pricing_table', data: { currency: '$', rows: [{ name: 'Pre-production', desc: '', price: '1500' }, { name: 'Production day', desc: 'Crew + equipment', price: '4500' }, { name: 'Post-production', desc: 'Edit + grade', price: '2500' }] } },
      { type: 'callout', data: { emoji: '©️', text: 'Usage rights transfer to the client upon final payment. Raw footage retained by the studio unless purchased.' } },
      { type: 'signature', data: { label: 'Authorize this Statement of Work' } },
    ],
  },
  {
    id: 'nda', type: 'nda', industry: 'General', title: 'Mutual Non-Disclosure Agreement',
    description: 'Simple, balanced mutual NDA.', emoji: '🔒',
    blocks: [
      { type: 'heading', data: { text: 'Mutual Non-Disclosure Agreement', level: 1 } },
      { type: 'text', data: { text: 'Both parties agree to protect confidential information shared during their discussions, as set out below.' } },
      { type: 'checklist', data: { items: [{ text: 'Confidential information is used only for the stated purpose' }, { text: 'Information is not disclosed to third parties without consent' }, { text: 'Obligations survive for 2 years after disclosure' }, { text: 'Excludes information that is public or independently developed' }] } },
      { type: 'signature', data: { label: 'Sign to agree to these terms' } },
    ],
  },
];

module.exports = function mountContractsStudio(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    logAudit = () => {},
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    notify = () => {},
    clientBaseUrl = process.env.FRONTEND_URL || '',
    sendClientMessage = async () => ({ skipped: true }),
    sendEmail = async () => ({ skipped: true }),
    path = require('path'),
    fs = require('fs'),
    uploadsDir = path.join(__dirname, 'uploads'),
    multer = require('multer'),
  } = deps;
  const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

  // Upload sink for contract files + letterheads (served statically at /uploads).
  const csDir = path.join(uploadsDir, 'cs');
  try { fs.mkdirSync(csDir, { recursive: true }); } catch { /* exists */ }
  const csUpload = multer({
    storage: multer.diskStorage({
      destination: csDir,
      filename: (req, file, cb) => { const safe = (file.originalname || 'file').normalize('NFKD').replace(/[^\w.\-]/g, '_').slice(0, 100); cb(null, `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${safe}`); },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  });
  const csFileUrl = (filename) => `/uploads/cs/${filename}`;

  db.exec(`
    CREATE TABLE IF NOT EXISTS cs_documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      lead_id TEXT,
      type TEXT DEFAULT 'contract',     -- contract|proposal|quote|nda|sow|retainer|agreement|hybrid
      title TEXT NOT NULL,
      status TEXT DEFAULT 'draft',       -- draft|pending_approval|sent|viewed|signed|completed|declined|expired
      blocks TEXT DEFAULT '[]',          -- JSON array of editor blocks
      theme TEXT DEFAULT 'monochrome',   -- monochrome|editorial|executive
      settings TEXT DEFAULT '{}',        -- JSON: accent, payment, signing mode, etc.
      totals TEXT DEFAULT '{}',          -- JSON: { currency, subtotal, total, selected: {...} }
      token TEXT UNIQUE,                 -- public viewer/sign capability
      version INTEGER DEFAULT 1,
      doc_hash TEXT,
      created_by TEXT,
      sent_at TIMESTAMP, viewed_at TIMESTAMP, completed_at TIMESTAMP, expires_at TIMESTAMP,
      is_deleted INTEGER DEFAULT 0,      -- Phase 3 recycle bin; older DBs get these via soft-delete.js
      deleted_at TIMESTAMP,
      deleted_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_signers (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      workspace_id TEXT,
      role TEXT DEFAULT 'client',        -- client|company|witness|cosigner
      name TEXT, email TEXT, phone TEXT,
      sign_order INTEGER DEFAULT 0,
      mode TEXT DEFAULT 'sequential',    -- sequential|parallel
      status TEXT DEFAULT 'pending',     -- pending|viewed|signed|declined
      token TEXT,
      typed_name TEXT, signature_data TEXT, consent INTEGER DEFAULT 0,
      ip TEXT, user_agent TEXT, signed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_events (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      workspace_id TEXT,
      type TEXT NOT NULL,                -- created|sent|viewed|block_viewed|signed|approved|declined|reminded|...
      actor TEXT, ip TEXT, user_agent TEXT,
      meta TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_approvals (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      workspace_id TEXT,
      approver_user_id TEXT, role TEXT,
      sign_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',     -- pending|approved|rejected
      note TEXT, decided_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      type TEXT DEFAULT 'contract',
      industry TEXT,
      title TEXT NOT NULL,
      blocks TEXT DEFAULT '[]',
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      workspace_id TEXT,
      version INTEGER,
      title TEXT, blocks TEXT, theme TEXT, settings TEXT,
      label TEXT, created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cs_versions_doc ON cs_versions(document_id);
    CREATE TABLE IF NOT EXISTS cs_clauses (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT, body TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_settings (
      workspace_id TEXT PRIMARY KEY,
      letterhead_url TEXT,               -- workspace letterhead image (optional)
      settings TEXT DEFAULT '{}',        -- JSON: default theme/expiry/sender/letterhead_on
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cs_docs_ws ON cs_documents(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_cs_docs_token ON cs_documents(token);
    -- Phase 4: the list is always workspace + bin filtered, and the guard counts
    -- live contracts per lead on every lead permanent-delete.
    CREATE INDEX IF NOT EXISTS idx_cs_docs_ws_deleted ON cs_documents(workspace_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_cs_docs_lead ON cs_documents(lead_id);
    CREATE INDEX IF NOT EXISTS idx_cs_signers_doc ON cs_signers(document_id);
    CREATE INDEX IF NOT EXISTS idx_cs_events_doc ON cs_events(document_id);
  `);

  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const shareUrl = (d) => (d.token ? `${clientBaseUrl}/d/${d.token}` : null);

  function recordEvent(doc, type, { actor, ip, ua, meta } = {}) {
    db.prepare(`INSERT INTO cs_events (id, document_id, workspace_id, type, actor, ip, user_agent, meta) VALUES (?,?,?,?,?,?,?,?)`)
      .run(generateId(), doc.id, doc.workspace_id, type, actor || null, ip || null, ua || null, JSON.stringify(meta || {}));
  }

  function shapeDoc(d, { withBlocks = false } = {}) {
    return {
      id: d.id, lead_id: d.lead_id, type: d.type, title: d.title, status: d.status,
      theme: d.theme, settings: J(d.settings, {}), totals: J(d.totals, {}),
      token: d.token, share_url: shareUrl(d), version: d.version,
      sent_at: d.sent_at, viewed_at: d.viewed_at, completed_at: d.completed_at, expires_at: d.expires_at,
      created_at: d.created_at, updated_at: d.updated_at,
      ...(withBlocks ? { blocks: J(d.blocks, []) } : {}),
    };
  }
  const getDoc = (ws, id) => db.prepare('SELECT * FROM cs_documents WHERE id = ? AND workspace_id = ?').get(id, ws);

  // ── Phase 5: automations + payments ─────────────────────────────────────────
  // The signed contract isn't a dead PDF — it acts on the relationship.
  const workspaceOwner = (wsId, fallback) => {
    const r = db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1").get(wsId);
    return r?.user_id || fallback;
  };

  // Turn the client's actual selection into invoice line items + a total.
  function selectionToInvoice(blocks, sel) {
    let currency = '$'; const items = [];
    const pkgs = (sel && sel.packages) || {}, adds = (sel && sel.addons) || {};
    (blocks || []).forEach((b, idx) => {
      const d = b.data || {};
      if (b.type === 'pricing_table') { currency = d.currency || currency; (d.rows || []).forEach(r => { const rate = Number(r.price) || 0; items.push({ description: r.name || 'Item', qty: 1, rate, amount: rate }); }); }
      if (b.type === 'package') {
        currency = d.currency || currency;
        let ci = pkgs[idx]; if (ci == null) ci = (d.packages || []).findIndex(x => x.featured); if (ci == null || ci < 0) ci = 0;
        const p = (d.packages || [])[ci]; if (p) { const rate = Number(p.price) || 0; items.push({ description: p.name || 'Package', qty: 1, rate, amount: rate }); }
      }
      if (b.type === 'addons') {
        currency = d.currency || currency;
        const set = adds[idx] != null ? new Set(adds[idx]) : null;
        (d.items || []).forEach((it, i) => { const on = set ? set.has(i) : !!it.on; if (on) { const rate = Number(it.price) || 0; items.push({ description: it.label || 'Add-on', qty: 1, rate, amount: rate }); } });
      }
    });
    return { currency, total: items.reduce((s, it) => s + (Number(it.amount) || 0), 0), items };
  }

  // Run on full completion. Each action is isolated so one failure never aborts signing.
  function runAutomations(doc, { selection, signerName } = {}) {
    const s = J(doc.settings, {}); const a = s.automations || {}; const pay = s.payment || {};
    const ran = []; const ownerId = workspaceOwner(doc.workspace_id, doc.created_by);
    const cs = db.prepare('SELECT invoice_prefix, invoice_counter, currency, currency_symbol FROM company_settings WHERE user_id = ?').get(ownerId) || {};
    const { currency, total, items } = selectionToInvoice(J(doc.blocks, []), selection);
    const sym = cs.currency_symbol || currency || '$';

    if (a.move_pipeline && doc.lead_id) {
      try {
        const stage = a.pipeline_stage || 'Closed - Won';
        if (stage === 'Closed - Won') db.prepare('UPDATE leads SET status = ?, actual_sale = COALESCE(actual_sale, ?) WHERE id = ?').run(stage, total, doc.lead_id);
        else db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(stage, doc.lead_id);
        addContactHistory(doc.lead_id, doc.created_by, 'pipeline', `Moved to "${stage}" — ${doc.type} signed`);
        ran.push('pipeline');
      } catch (e) { recordEvent(doc, 'automation_error', { actor: 'system', meta: { step: 'pipeline', error: e.message } }); }
    }

    let invoiceId = null;
    if (a.create_invoice && items.length) {
      try {
        const lead = doc.lead_id ? db.prepare('SELECT customer_name, customer_phone, email FROM leads WHERE id = ?').get(doc.lead_id) : null;
        const prefix = cs.invoice_prefix || 'INV'; const counter = (cs.invoice_counter || 1000) + 1;
        db.prepare('UPDATE company_settings SET invoice_counter = ? WHERE user_id = ?').run(counter, ownerId);
        const num = `${prefix}-${counter}`; invoiceId = generateId();
        let invItems = items, invTotal = total, note = `Auto-created from signed ${doc.type}: ${doc.title}`;
        if (pay.enabled && pay.type === 'deposit') {
          const dep = pay.deposit_type === 'fixed' ? (Number(pay.deposit_value) || 0) : Math.round(total * ((Number(pay.deposit_value) || 0) / 100));
          invItems = [{ description: `Deposit — ${doc.title}`, qty: 1, rate: dep, amount: dep }];
          invTotal = dep; note = `Deposit (${pay.deposit_type === 'fixed' ? sym + dep : (pay.deposit_value || 0) + '%'}) for "${doc.title}". Balance due: ${sym}${total - dep}.`;
        }
        db.prepare(`INSERT INTO invoices (id, user_id, lead_id, invoice_number, customer_name, customer_email, customer_phone, items, subtotal, tax_rate, tax_amount, discount, total, currency, currency_symbol, status, notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(invoiceId, ownerId, doc.lead_id, num, lead?.customer_name || signerName || null, lead?.email || null, lead?.customer_phone || null,
            JSON.stringify(invItems), invTotal, 0, 0, 0, invTotal, cs.currency || 'USD', sym, 'sent', note);
        if (doc.lead_id) addContactHistory(doc.lead_id, doc.created_by, 'invoice', `Invoice ${num} auto-created from signed ${doc.type} — ${sym}${invTotal}`);
        ran.push('invoice');
      } catch (e) { recordEvent(doc, 'automation_error', { actor: 'system', meta: { step: 'invoice', error: e.message } }); }
    }

    if (a.create_project) {
      try {
        const pid = generateId();
        db.prepare('INSERT INTO ms_projects (id, workspace_id, lead_id, title, project_type, status, created_by) VALUES (?,?,?,?,?,?,?)')
          .run(pid, doc.workspace_id, doc.lead_id || null, doc.title, a.project_type || 'general', 'planning', doc.created_by);
        ran.push('project');
      } catch (e) { recordEvent(doc, 'automation_error', { actor: 'system', meta: { step: 'project', error: e.message } }); }
    }

    if (ran.length) { recordEvent(doc, 'automation', { actor: 'system', meta: { ran, invoiceId, total } }); logAudit(doc.workspace_id, doc.created_by, 'cs_automation', 'cs_document', doc.id, { ran }); }
    return ran;
  }

  // Flatten blocks into readable text — AI context + client Q&A grounding.
  const blocksToText = (blocks) => (blocks || []).map(b => {
    const d = b.data || {};
    switch (b.type) {
      case 'heading': return `# ${d.text || ''}`;
      case 'custom_section': return `# ${d.title || ''}\n${d.text || ''}`;
      case 'text': case 'callout': return d.text || '';
      case 'pricing_table': return (d.rows || []).map(r => `- ${r.name}: ${d.currency || '$'}${r.price}`).join('\n');
      case 'package': return 'Packages: ' + (d.packages || []).map(p => `${p.name} (${d.currency || '$'}${p.price})`).join(', ');
      case 'addons': return 'Optional add-ons: ' + (d.items || []).map(i => `${i.label} (+${d.currency || '$'}${i.price})`).join(', ');
      case 'timeline': return (d.items || []).map(i => `- ${i.title}: ${i.desc || ''}`).join('\n');
      case 'checklist': return (d.items || []).map(i => `- ${i.text}`).join('\n');
      case 'faq': return (d.items || []).map(i => `Q: ${i.q}\nA: ${i.a}`).join('\n');
      case 'testimonial': return `"${d.quote}" — ${d.author}`;
      default: return '';
    }
  }).filter(Boolean).join('\n\n');

  // ── Signed PDF + Certificate of Completion (pdfkit) ─────────────────────────
  function renderBlocksToPdf(d, blocks) {
    (blocks || []).forEach(b => {
      const x = b.data || {};
      switch (b.type) {
        case 'heading': d.moveDown(0.4).fontSize(x.level === 2 ? 13 : 16).fillColor('#111').text(x.text || ''); break;
        case 'custom_section': d.moveDown(0.4).fontSize(14).fillColor('#111').text(x.title || ''); if (x.text) d.fontSize(10.5).fillColor('#333').text(x.text); break;
        case 'text': d.fontSize(10.5).fillColor('#333').text(x.text || ''); break;
        case 'callout': d.fontSize(10.5).fillColor('#333').text(`${x.emoji || '•'} ${x.text || ''}`); break;
        case 'pricing_table': (x.rows || []).forEach(r => d.fontSize(10.5).fillColor('#333').text(`${r.name}    ${x.currency || '$'}${r.price}`)); break;
        case 'package': (x.packages || []).forEach(p => d.fontSize(10.5).fillColor('#333').text(`${p.name}: ${x.currency || '$'}${p.price}`)); break;
        case 'addons': (x.items || []).forEach(it => d.fontSize(10.5).fillColor('#333').text(`+ ${it.label}: ${x.currency || '$'}${it.price}`)); break;
        case 'timeline': (x.items || []).forEach(it => d.fontSize(10.5).fillColor('#333').text(`• ${it.title} — ${it.desc || ''}`)); break;
        case 'checklist': (x.items || []).forEach(it => d.fontSize(10.5).fillColor('#333').text(`☐ ${it.text}`)); break;
        case 'faq': (x.items || []).forEach(it => { d.fontSize(10.5).fillColor('#111').text(`Q: ${it.q}`); d.fontSize(10).fillColor('#444').text(`A: ${it.a}`); }); break;
        case 'testimonial': d.fontSize(11).fillColor('#444').text(`"${x.quote}" — ${x.author}`); break;
        case 'divider': d.moveDown(0.3); break;
        default: break;
      }
      d.moveDown(0.2);
    });
  }
  function generateSignedPdf(doc, signers) {
    return new Promise((resolve, reject) => {
      let PDFDocument; try { PDFDocument = require('pdfkit'); } catch (e) { return reject(e); }
      try {
        const pdf = new PDFDocument({ size: 'A4', margin: 50 });
        const outName = `signed-${doc.id}.pdf`;
        const stream = fs.createWriteStream(path.join(csDir, outName));
        pdf.pipe(stream);
        // letterhead
        try {
          const ws = db.prepare('SELECT letterhead_url FROM cs_settings WHERE workspace_id = ?').get(doc.workspace_id);
          if (ws && ws.letterhead_url) { const lp = path.join(uploadsDir, ws.letterhead_url.replace(/^\/?uploads\//, '')); if (fs.existsSync(lp)) { pdf.image(lp, { fit: [495, 110], align: 'center' }); pdf.moveDown(); } }
        } catch { /* letterhead optional */ }
        pdf.fontSize(20).fillColor('#111').text(doc.title || 'Document');
        pdf.fontSize(10).fillColor('#666').text(`${(doc.type || 'document').toUpperCase()} · Completed ${new Date().toLocaleString()}`);
        pdf.moveDown();
        const settings = J(doc.settings, {});
        if (settings.upload) pdf.fontSize(11).fillColor('#333').text(`Attached document: ${settings.upload.filename}`).moveDown();
        renderBlocksToPdf(pdf, J(doc.blocks, []));
        // signatures
        pdf.addPage().fontSize(16).fillColor('#111').text('Signatures').moveDown(0.5);
        (signers || []).filter(s => s.status === 'signed').forEach(s => {
          pdf.fontSize(11).fillColor('#111').text(`${s.typed_name || s.name || '—'}  ·  ${s.role}`);
          pdf.fontSize(9).fillColor('#666').text(`Signed ${s.signed_at || ''}${s.ip ? `  ·  IP ${s.ip}` : ''}`);
          if (s.signature_data && String(s.signature_data).startsWith('data:image')) { try { pdf.image(Buffer.from(s.signature_data.split(',')[1], 'base64'), { fit: [200, 70] }); } catch { /* bad sig */ } }
          pdf.moveDown();
        });
        // certificate of completion
        pdf.addPage().fontSize(16).fillColor('#111').text('Certificate of Completion').moveDown(0.5);
        pdf.fontSize(9).fillColor('#444');
        pdf.text(`Document ID: ${doc.id}`);
        pdf.text(`Version: ${doc.version || 1}`);
        pdf.text(`Integrity hash (SHA-256): ${doc.doc_hash || ''}`);
        pdf.moveDown(0.5).fontSize(11).fillColor('#111').text('Audit trail').moveDown(0.3).fontSize(8.5).fillColor('#555');
        db.prepare('SELECT type, actor, ip, created_at FROM cs_events WHERE document_id = ? ORDER BY created_at').all(doc.id)
          .forEach(e => pdf.text(`${e.created_at}   ·   ${e.type}${e.actor ? `   ·   ${e.actor}` : ''}${e.ip ? `   ·   ${e.ip}` : ''}`));
        pdf.end();
        stream.on('finish', () => resolve(csFileUrl(outName)));
        stream.on('error', reject);
      } catch (e) { reject(e); }
    });
  }

  // Deliver the signing link to whoever hasn't signed — shared by manual + auto reminders.
  async function sendReminder(d, channels) {
    const link = `${clientBaseUrl}/d/${d.token}`;
    const pending = db.prepare("SELECT * FROM cs_signers WHERE document_id = ? AND status = 'pending' ORDER BY sign_order").all(d.id);
    const targets = pending.length ? pending : db.prepare('SELECT * FROM cs_signers WHERE document_id = ? ORDER BY sign_order LIMIT 1').all(d.id);
    const ownerId = workspaceOwner(d.workspace_id, d.created_by);
    const delivery = {};
    for (const s of targets) {
      if (channels.includes('whatsapp') && s.phone) { try { await sendClientMessage({ lead: d.lead_id ? { id: d.lead_id, customer_phone: s.phone } : { customer_phone: s.phone }, userId: d.created_by, text: `⏰ Reminder — please review & sign "${d.title}":\n${link}` }); delivery.whatsapp = 'sent'; } catch { delivery.whatsapp = 'failed'; } }
      if (channels.includes('email') && s.email) { try { await sendEmail({ workspaceOwnerId: ownerId, to: s.email, subject: `Reminder: please sign "${d.title}"`, html: `<p>Hello ${s.name || ''},</p><p>Just a gentle reminder to review and sign <strong>${d.title}</strong>.</p><p><a href="${link}" style="display:inline-block;padding:11px 20px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open the document</a></p><p>${link}</p>`, text: `Reminder — sign "${d.title}": ${link}` }); delivery.email = 'sent'; } catch { delivery.email = 'failed'; } }
    }
    return delivery;
  }

  // Daily auto-reminder cadence — opt-in per document (settings.auto_remind).
  async function autoReminderSweep() {
    const rows = db.prepare("SELECT * FROM cs_documents WHERE token IS NOT NULL AND status IN ('sent','viewed') AND (is_deleted = 0 OR is_deleted IS NULL)").all();
    for (const d of rows) {
      try {
        const ar = J(d.settings, {}).auto_remind;
        if (!ar || !ar.enabled) continue;
        const every = Math.max(1, Number(ar.every_days) || 3);
        const max = Math.max(1, Number(ar.max) || 2);
        const sentCount = db.prepare("SELECT COUNT(*) c FROM cs_events WHERE document_id = ? AND type = 'reminded' AND meta LIKE '%\"auto\":true%'").get(d.id).c;
        if (sentCount >= max) continue;
        const lastRem = db.prepare("SELECT MAX(created_at) m FROM cs_events WHERE document_id = ? AND type = 'reminded'").get(d.id).m;
        const since = lastRem || d.sent_at;
        if (!since) continue;
        const days = (Date.now() - new Date(String(since).replace(' ', 'T') + 'Z').getTime()) / 86400000;
        if (days < every) continue;
        const channels = Array.isArray(ar.channels) && ar.channels.length ? ar.channels : ['whatsapp', 'email'];
        const delivery = await sendReminder(d, channels);
        recordEvent(d, 'reminded', { actor: 'system', meta: { auto: true, channels, delivery } });
        if (d.lead_id) addContactHistory(d.lead_id, d.created_by, 'contract', `Auto-reminder sent for "${d.title}"`);
        broadcastToWorkspace(d.workspace_id, 'cs_updated', { id: d.id });
      } catch { /* skip this doc */ }
    }
  }

  // ── Dashboard overview (the living workspace) ───────────────────────────────
  app.get('/api/cs/overview', auth, (req, res) => {
    try {
      const ws = req.workspaceId;
      const byStatus = {};
      db.prepare('SELECT status, COUNT(*) c FROM cs_documents WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) GROUP BY status').all(ws).forEach(r => { byStatus[r.status] = r.c; });
      const total = db.prepare('SELECT COUNT(*) c FROM cs_documents WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)').get(ws).c;
      const recent = db.prepare(`SELECT d.*, l.customer_name AS client_name FROM cs_documents d LEFT JOIN leads l ON l.id = d.lead_id WHERE d.workspace_id = ? AND (d.is_deleted = 0 OR d.is_deleted IS NULL) ORDER BY d.updated_at DESC LIMIT 8`).all(ws)
        .map(d => ({ ...shapeDoc(d), client_name: d.client_name }));
      const activity = db.prepare(`SELECT e.type, e.created_at, e.actor, d.title FROM cs_events e JOIN cs_documents d ON d.id = e.document_id WHERE e.workspace_id = ? ORDER BY e.created_at DESC LIMIT 12`).all(ws);
      // revenue impact = sum of signed/completed document totals
      let revenue = 0;
      db.prepare("SELECT totals FROM cs_documents WHERE workspace_id = ? AND status IN ('signed','completed') AND (is_deleted = 0 OR is_deleted IS NULL)").all(ws).forEach(r => { const t = J(r.totals, {}); revenue += Number(t.total || 0); });
      res.json({ total, byStatus, recent, activity, revenue });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Documents ───────────────────────────────────────────────────────────────
  app.get('/api/cs/documents', auth, (req, res) => {
    try {
      // Phase 3: the bin is excluded by default; ?bin=1 lists it so a binned contract
      // is reachable for restore rather than merely invisible.
      const params = [req.workspaceId];
      let where = req.query.bin === '1'
        ? 'd.workspace_id = ? AND d.is_deleted = 1'
        : 'd.workspace_id = ? AND (d.is_deleted = 0 OR d.is_deleted IS NULL)';
      if (req.query.status) { where += ' AND d.status = ?'; params.push(req.query.status); }
      if (req.query.type) { where += ' AND d.type = ?'; params.push(req.query.type); }
      if (req.query.lead_id) { where += ' AND d.lead_id = ?'; params.push(req.query.lead_id); }
      const sql = `SELECT d.*, l.customer_name AS client_name FROM cs_documents d LEFT JOIN leads l ON l.id = d.lead_id WHERE ${where} ORDER BY d.updated_at DESC`;
      // Phase 4: opt-in paging — omitting ?limit keeps the previous unbounded response.
      const page = pagination.pageParams(req);
      if (!page) {
        const rows = db.prepare(sql).all(...params);
        return res.json({ documents: rows.map(d => ({ ...shapeDoc(d), client_name: d.client_name })) });
      }
      const p = pagination.paginate(db, { sql, countSql: pagination.toCountSql(sql), params, page });
      res.json({
        documents: p.items.map(d => ({ ...shapeDoc(d), client_name: d.client_name })),
        total: p.total, limit: p.limit, offset: p.offset, hasMore: p.hasMore,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cs/documents', auth, (req, res) => {
    try {
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' });
      let blocks = Array.isArray(b.blocks) ? b.blocks : [];
      let packType = null;
      if (b.template_id) { const t = db.prepare('SELECT blocks, type FROM cs_templates WHERE id = ? AND workspace_id = ?').get(b.template_id, req.workspaceId); if (t) blocks = J(t.blocks, []); }
      if (b.pack_id) { const pk = PACKS.find(p => p.id === b.pack_id); if (pk) { blocks = pk.blocks; packType = pk.type; } }
      const id = generateId();
      db.prepare(`INSERT INTO cs_documents (id, workspace_id, lead_id, type, title, blocks, theme, settings, created_by)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        id, req.workspaceId, b.lead_id || null, b.type || packType || 'contract', String(b.title).slice(0, 200),
        JSON.stringify(blocks), ['monochrome', 'editorial', 'executive'].includes(b.theme) ? b.theme : 'monochrome',
        JSON.stringify(b.settings || {}), req.userId);
      // seed a client signer from the linked lead
      if (b.lead_id) {
        const lead = db.prepare('SELECT customer_name, customer_phone, email FROM leads WHERE id = ? AND workspace_id = ?').get(b.lead_id, req.workspaceId);
        if (lead) db.prepare(`INSERT INTO cs_signers (id, document_id, workspace_id, role, name, email, phone, sign_order) VALUES (?,?,?,'client',?,?,?,0)`)
          .run(generateId(), id, req.workspaceId, lead.customer_name || null, lead.email || null, lead.customer_phone || null);
      }
      const d = db.prepare('SELECT * FROM cs_documents WHERE id = ?').get(id);
      recordEvent(d, 'created', { actor: req.userId });
      logAudit(req.workspaceId, req.userId, 'cs_create', 'cs_document', id, { title: d.title, type: d.type });
      res.json(shapeDoc(d, { withBlocks: true }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cs/documents/:id', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const signers = db.prepare('SELECT id, role, name, email, phone, sign_order, status, signed_at FROM cs_signers WHERE document_id = ? ORDER BY sign_order').all(d.id);
      const events = db.prepare('SELECT type, actor, ip, created_at, meta FROM cs_events WHERE document_id = ? ORDER BY created_at').all(d.id).map(e => ({ ...e, meta: J(e.meta, {}) }));
      const approvals = db.prepare(`SELECT a.id, a.status, a.note, a.decided_at, a.created_at, a.approver_user_id, m.full_name AS approver_name
        FROM cs_approvals a LEFT JOIN workspace_members m ON m.user_id = a.approver_user_id AND m.workspace_id = ? WHERE a.document_id = ? ORDER BY a.created_at`).all(req.workspaceId, d.id);
      res.json({ ...shapeDoc(d, { withBlocks: true }), signers, events, approvals });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/cs/documents/:id', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const b = req.body || {}; const set = {};
      if (b.title !== undefined) set.title = String(b.title).slice(0, 200);
      if (b.type !== undefined) set.type = b.type;
      if (b.blocks !== undefined) set.blocks = JSON.stringify(b.blocks);
      if (b.theme !== undefined && ['monochrome', 'editorial', 'executive'].includes(b.theme)) set.theme = b.theme;
      if (b.settings !== undefined) set.settings = JSON.stringify(b.settings);
      if (b.totals !== undefined) set.totals = JSON.stringify(b.totals);
      if (b.expires_at !== undefined) set.expires_at = b.expires_at;
      const keys = Object.keys(set);
      if (keys.length) db.prepare(`UPDATE cs_documents SET ${keys.map(k => `${k}=@${k}`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...set, id: d.id });
      res.json(shapeDoc(db.prepare('SELECT * FROM cs_documents WHERE id = ?').get(d.id), { withBlocks: true }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Restore a binned contract. Signers/events/approvals were never removed, so the
  // document comes back complete and signable.
  app.post('/api/cs/documents/:id/restore', auth, (req, res) => {
    try {
      const r = db.prepare('UPDATE cs_documents SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL WHERE id = ? AND workspace_id = ?')
        .run(req.params.id, req.workspaceId);
      if (!r.changes) return res.status(404).json({ error: 'Document not found' });
      logAudit(req.workspaceId, req.userId, 'restore', 'cs_documents', req.params.id, {});
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/cs/documents/:id', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      // Phase 3: bin the document instead of destroying it. Signers/events/approvals
      // are deliberately left intact so a restore brings back a complete, signable
      // record rather than a hollow shell.
      db.prepare('UPDATE cs_documents SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?').run(req.userId, d.id);
      logAudit(req.workspaceId, req.userId, 'soft_delete', 'cs_documents', d.id, { title: d.title });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Approvals (internal sign-off before a document can be sent) ──────────────
  app.post('/api/cs/documents/:id/request-approval', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const aid = generateId();
      db.prepare("INSERT INTO cs_approvals (id, document_id, workspace_id, approver_user_id, status, note) VALUES (?,?,?,?,'pending',?)")
        .run(aid, d.id, req.workspaceId, req.body.approver_user_id || null, req.body.note || null);
      db.prepare("UPDATE cs_documents SET status = 'pending_approval', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(d.id);
      recordEvent(d, 'approval_requested', { actor: req.userId, meta: { note: req.body.note || '' } });
      broadcastToWorkspace(req.workspaceId, 'cs_updated', { id: d.id });
      res.json({ ok: true, id: aid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cs/documents/:id/decide-approval', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const decision = req.body.decision === 'approved' ? 'approved' : 'rejected';
      const at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      // resolve the latest pending approval, or create one already-decided (covers solo approve)
      const pending = db.prepare("SELECT id FROM cs_approvals WHERE document_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(d.id);
      if (pending) db.prepare('UPDATE cs_approvals SET status = ?, note = ?, approver_user_id = COALESCE(approver_user_id, ?), decided_at = ? WHERE id = ?').run(decision, req.body.note || null, req.userId, at, pending.id);
      else db.prepare('INSERT INTO cs_approvals (id, document_id, workspace_id, approver_user_id, status, note, decided_at) VALUES (?,?,?,?,?,?,?)').run(generateId(), d.id, req.workspaceId, req.userId, decision, req.body.note || null, at);
      db.prepare("UPDATE cs_documents SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(d.id);
      recordEvent(d, decision === 'approved' ? 'approved' : 'rejected', { actor: req.userId, meta: { note: req.body.note || '' } });
      logAudit(req.workspaceId, req.userId, 'cs_' + decision, 'cs_document', d.id, {});
      broadcastToWorkspace(req.workspaceId, 'cs_updated', { id: d.id });
      res.json({ ok: true, status: decision });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Phase 4: multi-party signers (client / company / witness / co-signer) ────
  const signerInWs = (sid, ws) => db.prepare('SELECT s.* FROM cs_signers s JOIN cs_documents d ON d.id = s.document_id WHERE s.id = ? AND d.workspace_id = ?').get(sid, ws);

  app.post('/api/cs/documents/:id/signers', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const b = req.body || {};
      const order = b.sign_order != null ? b.sign_order : db.prepare('SELECT COALESCE(MAX(sign_order), -1) + 1 n FROM cs_signers WHERE document_id = ?').get(d.id).n;
      const id = generateId();
      db.prepare("INSERT INTO cs_signers (id, document_id, workspace_id, role, name, email, phone, sign_order, mode) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id, d.id, req.workspaceId, b.role || 'cosigner', b.name || null, b.email || null, b.phone || null, order, b.mode || 'sequential');
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/cs/signers/:id', auth, (req, res) => {
    try {
      const s = signerInWs(req.params.id, req.workspaceId);
      if (!s) return res.status(404).json({ error: 'Signer not found' });
      const b = req.body || {}; const set = {};
      ['role', 'name', 'email', 'phone', 'mode'].forEach(k => { if (b[k] !== undefined) set[k] = b[k]; });
      if (b.sign_order !== undefined) set.sign_order = b.sign_order;
      const keys = Object.keys(set);
      if (keys.length) db.prepare(`UPDATE cs_signers SET ${keys.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...set, id: s.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/cs/signers/:id', auth, (req, res) => {
    try {
      const s = signerInWs(req.params.id, req.workspaceId);
      if (!s) return res.status(404).json({ error: 'Signer not found' });
      db.prepare('DELETE FROM cs_signers WHERE id = ?').run(s.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Manual reminder — re-deliver the signing link to whoever hasn't signed ──
  app.post('/api/cs/documents/:id/remind', auth, async (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      if (!d.token) return res.status(400).json({ error: 'Send the document first.' });
      if (['signed', 'completed', 'declined', 'expired'].includes(d.status)) return res.status(400).json({ error: `Nothing to remind — this document is ${d.status}.` });
      const channels = Array.isArray(req.body.channels) && req.body.channels.length ? req.body.channels : ['whatsapp'];
      const delivery = await sendReminder(d, channels);
      recordEvent(d, 'reminded', { actor: req.userId, meta: { channels, delivery } });
      if (d.lead_id) addContactHistory(d.lead_id, req.userId, 'contract', `Reminder sent for "${d.title}"`);
      logAudit(req.workspaceId, req.userId, 'cs_remind', 'cs_document', d.id, { channels });
      broadcastToWorkspace(req.workspaceId, 'cs_updated', { id: d.id });
      res.json({ ok: true, delivery });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Templates ───────────────────────────────────────────────────────────────
  app.get('/api/cs/templates', auth, (req, res) => {
    try { res.json({ templates: db.prepare('SELECT id, type, industry, title, created_at FROM cs_templates WHERE workspace_id = ? ORDER BY created_at DESC').all(req.workspaceId) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/cs/templates/:id', auth, (req, res) => {
    try { const t = db.prepare('SELECT * FROM cs_templates WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId); if (!t) return res.status(404).json({ error: 'Not found' }); res.json({ ...t, blocks: J(t.blocks, []) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/cs/templates', auth, (req, res) => {
    try {
      if (!req.body.title) return res.status(400).json({ error: 'Title required' });
      const id = generateId();
      db.prepare('INSERT INTO cs_templates (id, workspace_id, type, industry, title, blocks, created_by) VALUES (?,?,?,?,?,?,?)')
        .run(id, req.workspaceId, req.body.type || 'contract', req.body.industry || null, String(req.body.title).slice(0, 200), JSON.stringify(req.body.blocks || []), req.userId);
      res.json(db.prepare('SELECT id, type, industry, title, created_at FROM cs_templates WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/cs/templates/:id', auth, (req, res) => {
    try { db.prepare('DELETE FROM cs_templates WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Version history ──────────────────────────────────────────────────────────
  app.get('/api/cs/documents/:id/versions', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const versions = db.prepare(`SELECT v.id, v.version, v.label, v.created_at, m.full_name AS author
        FROM cs_versions v LEFT JOIN workspace_members m ON m.user_id = v.created_by AND m.workspace_id = ? WHERE v.document_id = ? ORDER BY v.created_at DESC`).all(req.workspaceId, d.id);
      res.json({ versions, current: d.version || 1 });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/cs/documents/:id/versions/:vid', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const v = db.prepare('SELECT * FROM cs_versions WHERE id = ? AND document_id = ?').get(req.params.vid, d.id);
      if (!v) return res.status(404).json({ error: 'Version not found' });
      res.json({ version: { id: v.id, version: v.version, label: v.label, text: blocksToText(J(v.blocks, [])) }, current_text: blocksToText(J(d.blocks, [])) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/cs/documents/:id/versions/:vid/restore', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const v = db.prepare('SELECT * FROM cs_versions WHERE id = ? AND document_id = ?').get(req.params.vid, d.id);
      if (!v) return res.status(404).json({ error: 'Version not found' });
      db.prepare('UPDATE cs_documents SET blocks = ?, title = ?, theme = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(v.blocks, v.title, v.theme, d.id);
      recordEvent(d, 'version_restored', { actor: req.userId, meta: { version: v.version } });
      broadcastToWorkspace(req.workspaceId, 'cs_updated', { id: d.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Clause library ──────────────────────────────────────────────────────────
  app.get('/api/cs/clauses', auth, (req, res) => {
    try { res.json({ clauses: db.prepare('SELECT id, title, body, created_at FROM cs_clauses WHERE workspace_id = ? ORDER BY title').all(req.workspaceId) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/cs/clauses', auth, (req, res) => {
    try { const id = generateId(); db.prepare('INSERT INTO cs_clauses (id, workspace_id, title, body) VALUES (?,?,?,?)').run(id, req.workspaceId, String(req.body.title || 'Clause').slice(0, 160), req.body.body || ''); res.json({ ok: true, id }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/cs/clauses/:id', auth, (req, res) => {
    try { const c = db.prepare('SELECT id FROM cs_clauses WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId); if (!c) return res.status(404).json({ error: 'Not found' });
      const set = {}; if (req.body.title !== undefined) set.title = req.body.title; if (req.body.body !== undefined) set.body = req.body.body;
      const keys = Object.keys(set); if (keys.length) db.prepare(`UPDATE cs_clauses SET ${keys.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...set, id: c.id }); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/cs/clauses/:id', auth, (req, res) => {
    try { db.prepare('DELETE FROM cs_clauses WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Bulk send — one template/pack to many leads, created + delivered ─────────
  app.post('/api/cs/bulk-send', auth, async (req, res) => {
    try {
      const b = req.body || {};
      const leadIds = Array.isArray(b.lead_ids) ? b.lead_ids : [];
      if (!leadIds.length) return res.status(400).json({ error: 'Pick at least one client' });
      let blocks = [], type = b.type || 'contract', baseTitle = b.title || 'Document';
      if (b.template_id) { const t = db.prepare('SELECT blocks, type, title FROM cs_templates WHERE id = ? AND workspace_id = ?').get(b.template_id, req.workspaceId); if (t) { blocks = J(t.blocks, []); type = t.type || type; baseTitle = b.title || t.title; } }
      else if (b.pack_id) { const pk = PACKS.find(p => p.id === b.pack_id); if (pk) { blocks = pk.blocks; type = pk.type; baseTitle = b.title || pk.title; } }
      const channels = Array.isArray(b.channels) && b.channels.length ? b.channels : ['whatsapp', 'email'];
      const ownerId = workspaceOwner(req.workspaceId, req.userId);
      let sent = 0; const results = [];
      for (const leadId of leadIds) {
        const lead = db.prepare('SELECT customer_name, customer_phone, email FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
        if (!lead) continue;
        const id = generateId(); const token = crypto.randomBytes(18).toString('hex');
        db.prepare("INSERT INTO cs_documents (id, workspace_id, lead_id, type, title, blocks, status, token, sent_at, created_by) VALUES (?,?,?,?,?,?, 'sent', ?, CURRENT_TIMESTAMP, ?)")
          .run(id, req.workspaceId, leadId, type, baseTitle, JSON.stringify(blocks), token, req.userId);
        db.prepare("INSERT INTO cs_signers (id, document_id, workspace_id, role, name, email, phone, sign_order) VALUES (?,?,?,'client',?,?,?,0)")
          .run(generateId(), id, req.workspaceId, lead.customer_name || null, lead.email || null, lead.customer_phone || null);
        const doc = db.prepare('SELECT * FROM cs_documents WHERE id = ?').get(id);
        recordEvent(doc, 'sent', { actor: req.userId, meta: { bulk: true, channels } });
        const link = `${clientBaseUrl}/d/${token}`;
        try {
          if (channels.includes('whatsapp') && lead.customer_phone) await sendClientMessage({ lead: { id: leadId, customer_phone: lead.customer_phone }, userId: req.userId, text: `📄 ${baseTitle} — please review & sign:\n${link}` });
          if (channels.includes('email') && lead.email) await sendEmail({ workspaceOwnerId: ownerId, to: lead.email, subject: `Please review & sign: ${baseTitle}`, html: `<p>Hello ${lead.customer_name || ''},</p><p>Please review and sign <strong>${baseTitle}</strong>.</p><p><a href="${link}">Open the document</a></p>`, text: `Review & sign "${baseTitle}": ${link}` });
        } catch {}
        if (leadId) addContactHistory(leadId, req.userId, 'contract', `${type} "${baseTitle}" sent (bulk)`);
        results.push({ lead_id: leadId, id }); sent++;
      }
      broadcastToWorkspace(req.workspaceId, 'cs_updated', {});
      res.json({ ok: true, sent, results });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Industry packs — curated starting points ────────────────────────────────
  app.get('/api/cs/packs', auth, (req, res) => {
    res.json({ packs: PACKS.map(({ id, type, industry, title, description, emoji }) => ({ id, type, industry, title, description, emoji })) });
  });

  // ── Workspace settings (letterhead + defaults) ──────────────────────────────
  const getSettings = (ws) => db.prepare('SELECT * FROM cs_settings WHERE workspace_id = ?').get(ws) || { workspace_id: ws, letterhead_url: null, settings: '{}' };

  app.get('/api/cs/settings', auth, (req, res) => {
    try { const s = getSettings(req.workspaceId); res.json({ letterhead_url: s.letterhead_url, settings: J(s.settings, {}) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/cs/settings', auth, (req, res) => {
    try {
      const cur = getSettings(req.workspaceId);
      const merged = { ...J(cur.settings, {}), ...(req.body.settings || {}) };
      db.prepare(`INSERT INTO cs_settings (workspace_id, letterhead_url, settings, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id) DO UPDATE SET settings = excluded.settings, updated_at = CURRENT_TIMESTAMP`)
        .run(req.workspaceId, cur.letterhead_url || null, JSON.stringify(merged));
      res.json({ ok: true, settings: merged });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cs/settings/letterhead', auth, csUpload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const url = csFileUrl(req.file.filename); const cur = getSettings(req.workspaceId);
      db.prepare(`INSERT INTO cs_settings (workspace_id, letterhead_url, settings, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id) DO UPDATE SET letterhead_url = excluded.letterhead_url, updated_at = CURRENT_TIMESTAMP`)
        .run(req.workspaceId, url, cur.settings || '{}');
      res.json({ ok: true, letterhead_url: url });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/cs/settings/letterhead', auth, (req, res) => {
    try { db.prepare('UPDATE cs_settings SET letterhead_url = NULL WHERE workspace_id = ?').run(req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Upload a file onto a document (PDF/image) to send for signing ────────────
  app.post('/api/cs/documents/:id/upload', auth, csUpload.single('file'), (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const s = J(d.settings, {});
      s.upload = { url: csFileUrl(req.file.filename), filename: req.file.originalname || req.file.filename, mime: req.file.mimetype };
      db.prepare('UPDATE cs_documents SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(s), d.id);
      recordEvent(d, 'file_uploaded', { actor: req.userId, meta: { filename: s.upload.filename } });
      res.json({ ok: true, upload: s.upload });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/cs/documents/:id/upload', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const s = J(d.settings, {}); delete s.upload;
      db.prepare('UPDATE cs_documents SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(s), d.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Phase 6: AI assistant — draft / improve / explain / summarize / risks ────
  app.post('/api/cs/ai/assist', auth, async (req, res) => {
    if (!ai || !ai.callLLM) return res.status(503).json({ error: 'AI is not configured on this server.' });
    try {
      const { action, doc_id, text, instruction, type } = req.body || {};
      const doc = doc_id ? getDoc(req.workspaceId, doc_id) : null;
      const docText = doc ? blocksToText(J(doc.blocks, [])) : '';
      const sys = 'You are an expert proposal & contract assistant for a creative-studio CRM. Be precise, warm and plain-spoken. You are not a lawyer; add a brief caveat only when flagging legal risk. Never invent legal guarantees.';

      if (action === 'draft') {
        const prompt = `Create a ${type || 'contract'} as a JSON array of content blocks. Allowed "type" values: ${AI_BLOCK_TYPES.join(', ')}.
Data shapes — heading:{"text","level":1|2}; text/callout:{"text"}(callout also "emoji"); pricing_table:{"currency":"$","rows":[{"name","desc","price"}]}; package:{"currency":"$","selectable":true,"packages":[{"name","price","features":[],"featured":false}]}; addons:{"currency":"$","items":[{"label","price","on":false}]}; timeline/checklist:{"items":[...]}; faq:{"items":[{"q","a"}]}; testimonial:{"quote","author"}; signature:{"label"}.
Return ONLY a JSON array: [{"type":"heading","data":{...}}, ...]. 8–14 blocks, ending with a signature block.

Brief: ${instruction || 'A professional agreement for a creative studio.'}`;
        const raw = await ai.callLLM(prompt, { system: sys, temperature: 0.5, maxTokens: 2400 });
        let blocks = ai.extractJSON(raw, 'array') || [];
        blocks = (Array.isArray(blocks) ? blocks : []).filter(b => b && AI_BLOCK_TYPES.includes(b.type) && b.data && typeof b.data === 'object');
        if (doc) recordEvent(doc, 'ai_assist', { actor: req.userId, meta: { action } });
        return res.json({ blocks });
      }

      const map = {
        improve: `Improve the writing below — clearer, warmer, more professional. Keep the meaning and a similar length. Return only the improved text, no preamble.\n\n${text || ''}`,
        explain: `Explain the following clause in plain, friendly language a non-lawyer client would understand, in 2–4 sentences.\n\n${text || docText}`,
        summarize: `Summarize this document for the studio owner in 3–5 short bullet points: what it covers, the price, and the key terms.\n\n${docText}`,
        risks: `Review this document and flag missing or risky clauses (payment terms, cancellation, liability, usage/IP rights, deliverables). Give a short bullet list, then one final line exactly: "Not legal advice."\n\n${docText}`,
      };
      if (!map[action]) return res.status(400).json({ error: 'Unknown action' });
      const out = await ai.callLLM(map[action], { system: sys, temperature: action === 'improve' ? 0.5 : 0.3, maxTokens: 900 });
      if (doc) recordEvent(doc, 'ai_assist', { actor: req.userId, meta: { action } });
      res.json({ result: (out || '').trim() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Phase 7: Analytics (workspace-wide) ─────────────────────────────────────
  app.get('/api/cs/analytics', auth, (req, res) => {
    try {
      const ws = req.workspaceId;
      const docs = db.prepare('SELECT id, status, totals, sent_at, viewed_at, completed_at FROM cs_documents WHERE workspace_id = ?').all(ws);
      const byStatus = {}; let revenue = 0, sent = 0, viewed = 0, completed = 0, signSecondsSum = 0, signCount = 0;
      docs.forEach(d => {
        byStatus[d.status] = (byStatus[d.status] || 0) + 1;
        if (d.sent_at) sent++; if (d.viewed_at) viewed++;
        if (['signed', 'completed'].includes(d.status)) { completed++; revenue += Number(J(d.totals, {}).total || 0); }
        if (d.sent_at && d.completed_at) { signSecondsSum += (new Date(d.completed_at) - new Date(d.sent_at)) / 1000; signCount++; }
      });
      const viewEvents = db.prepare("SELECT meta FROM cs_events WHERE workspace_id = ? AND type = 'time_on_page'").all(ws).map(r => J(r.meta, {}));
      const avgViewSeconds = viewEvents.length ? Math.round(viewEvents.reduce((s, m) => s + (Number(m.seconds) || 0), 0) / viewEvents.length) : 0;
      const totalViews = db.prepare("SELECT COUNT(*) c FROM cs_events WHERE workspace_id = ? AND type = 'viewed'").get(ws).c;
      const topViewed = db.prepare(`SELECT d.title, COUNT(*) views FROM cs_events e JOIN cs_documents d ON d.id = e.document_id WHERE e.workspace_id = ? AND e.type = 'viewed' GROUP BY e.document_id ORDER BY views DESC LIMIT 5`).all(ws);
      res.json({
        totalDocs: docs.length, funnel: { sent, viewed, completed },
        acceptanceRate: sent ? Math.round((completed / sent) * 100) : 0,
        revenue, totalViews, avgViewSeconds,
        avgSignHours: signCount ? Math.round(signSecondsSum / signCount / 360) / 10 : 0,
        byStatus, topViewed,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Phase 7: Client Vault — every client's documents, filed together ────────
  app.get('/api/cs/vault', auth, (req, res) => {
    try {
      const rows = db.prepare(`SELECT d.*, l.customer_name AS client_name, l.customer_phone, l.email FROM cs_documents d LEFT JOIN leads l ON l.id = d.lead_id WHERE d.workspace_id = ? ORDER BY d.updated_at DESC`).all(req.workspaceId);
      const groups = {};
      rows.forEach(d => {
        const key = d.lead_id || '_none';
        if (!groups[key]) groups[key] = { lead_id: d.lead_id, client_name: d.client_name || (d.lead_id ? 'Client' : 'No client linked'), phone: d.customer_phone, email: d.email, documents: [], total_value: 0, signed_count: 0 };
        groups[key].documents.push(shapeDoc(d));
        if (['signed', 'completed'].includes(d.status)) { groups[key].signed_count++; groups[key].total_value += Number(J(d.totals, {}).total || 0); }
      });
      res.json({ clients: Object.values(groups).sort((a, b) => b.documents.length - a.documents.length) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── SEND (authed) — generate the public link + deliver over WhatsApp/email ──
  app.post('/api/cs/documents/:id/send', auth, async (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      // Plan limit — count only NEW sends (re-sending an already-sent doc doesn't recount).
      if (!d.sent_at && pricing) {
        const sendGate = pricing.canCreate(db, req.workspaceId, 'contract_sends');
        if (!sendGate.allowed) {
          return res.status(402).json({ error: 'Monthly contract/proposal send limit reached. Upgrade your plan to send more.', metric: 'contract_sends', limit: sendGate.limit, used: sendGate.used, upgrade: true });
        }
      }
      const sset = J(d.settings, {});
      if (sset.require_approval) {
        const ap = db.prepare('SELECT status FROM cs_approvals WHERE document_id = ? ORDER BY created_at DESC LIMIT 1').get(d.id);
        if (!ap || ap.status !== 'approved') return res.status(409).json({ error: 'This document needs internal approval before it can be sent.' });
      }
      const token = d.token || crypto.randomBytes(18).toString('hex');
      db.prepare("UPDATE cs_documents SET token = ?, status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(token, d.id);
      const expDays = Number(req.body.expire_days) || 0;
      if (expDays > 0) db.prepare('UPDATE cs_documents SET expires_at = ? WHERE id = ?').run(new Date(Date.now() + expDays * 86400000).toISOString().slice(0, 19).replace('T', ' '), d.id);
      else if (req.body.expire_days === 0) db.prepare('UPDATE cs_documents SET expires_at = NULL WHERE id = ?').run(d.id);
      // snapshot the sent state into version history, then advance the working version
      try {
        const ver = d.version || 1;
        db.prepare('INSERT INTO cs_versions (id, document_id, workspace_id, version, title, blocks, theme, settings, label, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(generateId(), d.id, req.workspaceId, ver, d.title, d.blocks, d.theme, d.settings, `Sent · v${ver}`, req.userId);
        db.prepare('UPDATE cs_documents SET version = version + 1 WHERE id = ?').run(d.id);
      } catch { /* versioning is best-effort */ }
      // ensure a client signer exists (from the linked lead if any)
      let signers = db.prepare('SELECT * FROM cs_signers WHERE document_id = ? ORDER BY sign_order').all(d.id);
      if (signers.length === 0) {
        const lead = d.lead_id ? db.prepare('SELECT customer_name, customer_phone, email FROM leads WHERE id = ?').get(d.lead_id) : null;
        const s = J(d.settings, {});
        db.prepare("INSERT INTO cs_signers (id, document_id, workspace_id, role, name, email, phone, sign_order) VALUES (?,?,?,'client',?,?,?,0)")
          .run(generateId(), d.id, req.workspaceId, lead?.customer_name || s.signer_name || null, lead?.email || s.signer_email || null, lead?.customer_phone || s.signer_phone || null);
        signers = db.prepare('SELECT * FROM cs_signers WHERE document_id = ? ORDER BY sign_order').all(d.id);
      }
      const fresh = db.prepare('SELECT * FROM cs_documents WHERE id = ?').get(d.id);
      const link = `${clientBaseUrl}/d/${token}`;
      const channels = Array.isArray(req.body.channels) && req.body.channels.length ? req.body.channels : ['whatsapp'];
      const signer = signers[0]; const delivery = {};
      if (channels.includes('whatsapp')) {
        if (signer?.phone) { try { await sendClientMessage({ lead: d.lead_id ? { id: d.lead_id, customer_phone: signer.phone } : { customer_phone: signer.phone }, userId: req.userId, text: `📄 ${d.title} — please review & sign:\n${link}` }); delivery.whatsapp = 'sent'; } catch { delivery.whatsapp = 'failed'; } } else delivery.whatsapp = 'no_phone';
      }
      if (channels.includes('email')) {
        if (signer?.email) { try { await sendEmail({ workspaceOwnerId: req.workspaceOwnerId, to: signer.email, subject: `Please review & sign: ${d.title}`, html: `<p>Hello ${signer.name || ''},</p><p>Please review and sign <strong>${d.title}</strong>.</p><p><a href="${link}" style="display:inline-block;padding:11px 20px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open the document</a></p><p>${link}</p>`, text: `Review & sign "${d.title}": ${link}` }); delivery.email = 'sent'; } catch { delivery.email = 'failed'; } } else delivery.email = 'no_email';
      }
      recordEvent(fresh, 'sent', { actor: req.userId, meta: { channels, delivery } });
      if (d.lead_id) addContactHistory(d.lead_id, req.userId, 'contract', `${d.type} "${d.title}" sent for signature`);
      broadcastToWorkspace(req.workspaceId, 'cs_updated', { id: d.id });
      logAudit(req.workspaceId, req.userId, 'cs_send', 'cs_document', d.id, { channels, delivery });
      res.json({ ...shapeDoc(fresh), share_url: link, delivery });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── PUBLIC portal (no auth — token is the capability) ───────────────────────
  const loadByToken = (token) => db.prepare('SELECT * FROM cs_documents WHERE token = ?').get(token);

  app.get('/api/cs/public/:token', (req, res) => {
    try {
      const d = loadByToken(req.params.token);
      if (!d || d.status === 'voided') return res.status(404).json({ error: 'Document not available' });
      if (d.expires_at && new Date(d.expires_at) < new Date() && !['signed', 'completed'].includes(d.status)) return res.status(410).json({ error: 'This link has expired' });
      if (d.status === 'sent') {
        db.prepare("UPDATE cs_documents SET status = 'viewed', viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP) WHERE id = ?").run(d.id);
        recordEvent(d, 'viewed', { actor: 'client', ip: clientIp(req), ua: req.headers['user-agent'] });
        broadcastToWorkspace(d.workspace_id, 'cs_updated', { id: d.id });
      }
      const fresh = db.prepare('SELECT * FROM cs_documents WHERE id = ?').get(d.id);
      const signers = db.prepare('SELECT role, name, status, sign_order FROM cs_signers WHERE document_id = ? ORDER BY sign_order').all(d.id);
      const fSettings = J(fresh.settings, {});
      const wsSettings = getSettings(fresh.workspace_id);
      const letterhead = (fSettings.letterhead !== false && wsSettings.letterhead_url) ? wsSettings.letterhead_url : null;
      res.json({ title: fresh.title, type: fresh.type, theme: fresh.theme, blocks: J(fresh.blocks, []), settings: fSettings, totals: J(fresh.totals, {}), status: fresh.status, signers, letterhead });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cs/public/:token/sign', async (req, res) => {
    try {
      const d = loadByToken(req.params.token);
      if (!d || d.status === 'voided') return res.status(404).json({ error: 'Not available' });
      if (['signed', 'completed'].includes(d.status)) return res.status(400).json({ error: 'Already signed' });
      const { typed_name, signature_data, consent, selection } = req.body || {};
      if (!consent) return res.status(400).json({ error: 'Please agree to sign electronically.' });
      if (!typed_name || !String(typed_name).trim()) return res.status(400).json({ error: 'Please type your full name.' });
      if (!signature_data) return res.status(400).json({ error: 'Please draw your signature.' });
      const ip = clientIp(req); const ua = req.headers['user-agent'] || ''; const at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const next = db.prepare("SELECT * FROM cs_signers WHERE document_id = ? AND status = 'pending' ORDER BY sign_order LIMIT 1").get(d.id);
      if (next) db.prepare("UPDATE cs_signers SET status = 'signed', typed_name = ?, signature_data = ?, consent = 1, ip = ?, user_agent = ?, signed_at = ? WHERE id = ?")
        .run(String(typed_name).slice(0, 120), signature_data, ip, ua, at, next.id);
      const remaining = db.prepare("SELECT COUNT(*) c FROM cs_signers WHERE document_id = ? AND status = 'pending'").get(d.id).c;
      const allSigned = remaining === 0;
      const status = allSigned ? 'completed' : 'signed';
      let totals = J(d.totals, {}); if (selection) totals = { ...totals, selection };
      const hash = crypto.createHash('sha256').update(`${d.id}::${d.blocks}::${typed_name}::${signature_data}::${at}`).digest('hex');
      db.prepare('UPDATE cs_documents SET status = ?, completed_at = COALESCE(completed_at, ?), totals = ?, doc_hash = ? WHERE id = ?')
        .run(status, allSigned ? at : null, JSON.stringify(totals), hash, d.id);
      recordEvent(d, 'signed', { actor: 'client', ip, ua, meta: { typed_name } });
      if (d.lead_id) addContactHistory(d.lead_id, d.created_by, 'contract', `${d.type} "${d.title}" signed by ${typed_name}`);
      let automations = [];
      if (allSigned) {
        try { automations = runAutomations(d, { selection, signerName: typed_name }); } catch {}
        try {
          const freshDoc = db.prepare('SELECT * FROM cs_documents WHERE id = ?').get(d.id);
          const allSigners = db.prepare('SELECT * FROM cs_signers WHERE document_id = ? ORDER BY sign_order').all(d.id);
          const pdfUrl = await generateSignedPdf(freshDoc, allSigners);
          const s2 = J(freshDoc.settings, {}); s2.signed_pdf = pdfUrl;
          db.prepare('UPDATE cs_documents SET settings = ? WHERE id = ?').run(JSON.stringify(s2), d.id);
        } catch { /* PDF is best-effort */ }
      }
      broadcastToWorkspace(d.workspace_id, 'cs_signed', { id: d.id, automations });
      try { notify(d.workspace_id, { type: 'contract', title: allSigned ? 'Contract fully signed' : 'Contract signed', body: `${typed_name} signed "${d.title}"`, url: d.lead_id ? `/leads/${d.lead_id}` : '/contracts', icon: '✍️' }); } catch {}
      try { const lead = d.lead_id ? db.prepare('SELECT * FROM leads WHERE id = ?').get(d.lead_id) : null; if (lead?.customer_phone) await sendClientMessage({ lead, userId: d.created_by, text: `✅ "${d.title}" was signed. Thank you!` }); } catch {}
      res.json({ ok: true, status, doc_hash: hash });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cs/public/:token/decline', (req, res) => {
    try {
      const d = loadByToken(req.params.token);
      if (!d) return res.status(404).json({ error: 'Not found' });
      if (['signed', 'completed'].includes(d.status)) return res.status(400).json({ error: 'Already signed' });
      db.prepare("UPDATE cs_documents SET status = 'declined' WHERE id = ?").run(d.id);
      recordEvent(d, 'declined', { actor: 'client', ip: clientIp(req), ua: req.headers['user-agent'], meta: { reason: req.body.reason || '' } });
      broadcastToWorkspace(d.workspace_id, 'cs_updated', { id: d.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Client Q&A — grounded, plain-language answers about the document.
  app.post('/api/cs/public/:token/ask', async (req, res) => {
    if (!ai || !ai.callLLM) return res.status(503).json({ error: 'Live answers are unavailable right now.' });
    try {
      const d = loadByToken(req.params.token);
      if (!d || d.status === 'voided') return res.status(404).json({ error: 'Not available' });
      const q = String(req.body.question || '').slice(0, 500).trim();
      if (!q) return res.status(400).json({ error: 'Please type a question.' });
      const docText = blocksToText(J(d.blocks, []));
      const prompt = `A client is reading the document below and asks a question. Answer ONLY from the document, in plain, friendly language, 1–3 sentences. If the answer is not in the document, say they should ask the sender directly — do not guess.

DOCUMENT:
${docText}

QUESTION: ${q}`;
      const answer = (await ai.callLLM(prompt, { temperature: 0.3, maxTokens: 400 })).trim();
      recordEvent(d, 'client_question', { actor: 'client', ip: clientIp(req), meta: { q } });
      broadcastToWorkspace(d.workspace_id, 'cs_updated', { id: d.id });
      res.json({ answer });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Lightweight analytics beacon — time-on-page & block drop-off.
  app.post('/api/cs/public/:token/track', (req, res) => {
    try {
      const d = loadByToken(req.params.token);
      if (!d) return res.status(204).end();
      const ev = req.body.event;
      if (ev === 'time_on_page' || ev === 'block_viewed') recordEvent(d, ev, { actor: 'client', ip: clientIp(req), meta: req.body.meta || {} });
      res.json({ ok: true });
    } catch { res.status(204).end(); }
  });

  // ── Phase 4: daily expiry sweep (status only — never sends anything) ─────────
  if (cron) cron.schedule('0 8 * * *', async () => {
    try {
      const r = db.prepare("UPDATE cs_documents SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP AND status IN ('sent','viewed')").run();
      if (r.changes) console.log(`📄 Contracts Studio: marked ${r.changes} document(s) expired`);
    } catch (e) { console.error('cs expiry sweep:', e.message); }
    try { await autoReminderSweep(); } catch (e) { console.error('cs auto-reminder sweep:', e.message); }
  });
};
