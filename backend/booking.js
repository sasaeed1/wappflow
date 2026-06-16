'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · BOOKING — public self-scheduling that drops straight into the CRM.
 *  A client picks a service + time on a public page; we create/find the lead,
 *  log the booking, set a reminder, and notify. Owns `booking_*` / `bookings`.
 *  Additive: reads/writes only its own tables + creates leads/reminders.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

module.exports = function mountBooking(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    sendClientMessage = async () => ({ skipped: true }),
    clientBaseUrl = process.env.FRONTEND_URL || '',
  } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS booking_settings (
      workspace_id TEXT PRIMARY KEY,
      slug TEXT UNIQUE,
      settings TEXT DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      lead_id TEXT,
      service TEXT, start_at TEXT, duration_min INTEGER,
      name TEXT, phone TEXT, email TEXT, notes TEXT,
      status TEXT DEFAULT 'confirmed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_ws ON bookings(workspace_id);
  `);

  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const DEFAULTS = {
    services: [{ name: 'Consultation', duration: 30, price: 0 }],
    availability: { 1: [9, 17], 2: [9, 17], 3: [9, 17], 4: [9, 17], 5: [9, 17] }, // 0=Sun..6=Sat
    slot_min: 30, days_ahead: 21,
  };
  const owner = (ws) => { const r = db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1").get(ws); return r ? r.user_id : null; };
  const brandName = (ws) => { const o = owner(ws); if (!o) return 'WappFlow'; try { const cs = db.prepare('SELECT company_name FROM company_settings WHERE user_id = ?').get(o); return (cs && cs.company_name) || 'WappFlow'; } catch { return 'WappFlow'; } };
  const getRow = (ws) => db.prepare('SELECT * FROM booking_settings WHERE workspace_id = ?').get(ws);
  const cfgOf = (row) => ({ ...DEFAULTS, ...J(row && row.settings, {}) });

  function slugify(s) { return String(s || 'studio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'studio'; }

  // Build available slots for the next N days from availability config minus booked times.
  function computeSlots(ws, cfg, serviceDuration) {
    const dur = Math.max(10, Number(serviceDuration) || cfg.slot_min || 30);
    const step = Math.max(10, Number(cfg.slot_min) || 30);
    const taken = new Set(db.prepare("SELECT start_at FROM bookings WHERE workspace_id = ? AND status != 'cancelled' AND start_at >= datetime('now')").all(ws).map(r => r.start_at));
    const out = []; const now = Date.now();
    for (let dayOffset = 0; dayOffset <= (cfg.days_ahead || 21); dayOffset++) {
      const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(0, 0, 0, 0);
      const dow = d.getDay();
      const hours = cfg.availability && cfg.availability[dow];
      if (!hours) continue;
      const [startH, endH] = hours; const times = [];
      for (let mins = startH * 60; mins + dur <= endH * 60; mins += step) {
        const slot = new Date(d); slot.setMinutes(mins);
        if (slot.getTime() < now + 60 * 60 * 1000) continue; // ≥1h lead time
        const iso = `${slot.getFullYear()}-${String(slot.getMonth() + 1).padStart(2, '0')}-${String(slot.getDate()).padStart(2, '0')} ${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}:00`;
        if (taken.has(iso)) continue;
        times.push(iso);
      }
      if (times.length) out.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, times });
    }
    return out;
  }

  // ── Admin ───────────────────────────────────────────────────────────────────
  app.get('/api/booking/settings', auth, (req, res) => {
    try { const row = getRow(req.workspaceId); res.json({ slug: row && row.slug, settings: cfgOf(row), public_url: row && row.slug ? `${clientBaseUrl}/book/${row.slug}` : null }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/booking/settings', auth, (req, res) => {
    try {
      const cur = getRow(req.workspaceId);
      const settings = { ...DEFAULTS, ...(cur ? J(cur.settings, {}) : {}), ...(req.body.settings || {}) };
      let slug = (cur && cur.slug) || slugify(req.body.slug || brandName(req.workspaceId));
      // ensure unique
      const clash = db.prepare('SELECT workspace_id FROM booking_settings WHERE slug = ? AND workspace_id != ?').get(slug, req.workspaceId);
      if (clash) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
      db.prepare(`INSERT INTO booking_settings (workspace_id, slug, settings, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id) DO UPDATE SET slug = excluded.slug, settings = excluded.settings, updated_at = CURRENT_TIMESTAMP`)
        .run(req.workspaceId, slug, JSON.stringify(settings));
      res.json({ ok: true, slug, settings, public_url: `${clientBaseUrl}/book/${slug}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/booking/list', auth, (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM bookings WHERE workspace_id = ? AND status != 'cancelled' ORDER BY start_at DESC LIMIT 200").all(req.workspaceId);
      res.json({ bookings: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/booking/:id/cancel', auth, (req, res) => {
    try { db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND workspace_id = ?").run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Public ────────────────────────────────────────────────────────────────
  app.get('/api/booking/public/:slug', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM booking_settings WHERE slug = ?').get(req.params.slug);
      if (!row) return res.status(404).json({ error: 'Not available' });
      const cfg = cfgOf(row);
      res.json({ brand: brandName(row.workspace_id), services: cfg.services || [], slots: computeSlots(row.workspace_id, cfg) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/booking/public/:slug', async (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM booking_settings WHERE slug = ?').get(req.params.slug);
      if (!row) return res.status(404).json({ error: 'Not available' });
      const ws = row.workspace_id; const cfg = cfgOf(row);
      const { service, start_at, name, phone, email, notes } = req.body || {};
      if (!start_at) return res.status(400).json({ error: 'Pick a time' });
      if (!name || !(phone || email)) return res.status(400).json({ error: 'Name and a phone or email are required' });
      // slot still free?
      const clash = db.prepare("SELECT id FROM bookings WHERE workspace_id = ? AND start_at = ? AND status != 'cancelled'").get(ws, start_at);
      if (clash) return res.status(409).json({ error: 'That time was just taken — please pick another.' });
      const svc = (cfg.services || []).find(s => s.name === service) || (cfg.services || [])[0] || { name: service || 'Booking', duration: cfg.slot_min || 30 };
      const ownerId = owner(ws);
      // find or create the lead
      let lead = phone ? db.prepare('SELECT * FROM leads WHERE workspace_id = ? AND customer_phone = ?').get(ws, phone) : null;
      if (!lead && email) lead = db.prepare('SELECT * FROM leads WHERE workspace_id = ? AND email = ?').get(ws, email);
      if (!lead) {
        const lid = generateId();
        db.prepare("INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, email, status, first_message) VALUES (?,?,?,?,?,?,'New',?)")
          .run(lid, ownerId, ws, name, phone || null, email || null, `Booked: ${svc.name}`);
        lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lid);
      }
      const bid = generateId();
      db.prepare('INSERT INTO bookings (id, workspace_id, lead_id, service, start_at, duration_min, name, phone, email, notes) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(bid, ws, lead.id, svc.name, start_at, svc.duration || 30, name, phone || null, email || null, notes || null);
      // reminder for the studio
      try { db.prepare('INSERT INTO reminders (id, lead_id, user_id, title, due_date) VALUES (?,?,?,?,?)').run(generateId(), lead.id, ownerId, `${svc.name} with ${name}`, start_at); } catch {}
      try { addContactHistory(lead.id, ownerId, 'booking', `Booked ${svc.name} for ${new Date(start_at.replace(' ', 'T')).toLocaleString()}`); } catch {}
      try { if (lead.customer_phone) await sendClientMessage({ lead, userId: ownerId, text: `✅ You're booked: ${svc.name} on ${new Date(start_at.replace(' ', 'T')).toLocaleString()}. See you then!` }); } catch {}
      broadcastToWorkspace(ws, 'booking_created', { id: bid, lead_id: lead.id });
      res.json({ ok: true, service: svc.name, start_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
