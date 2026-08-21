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
const availability = require('./availability');   // shared busy-calendar (bookings + meetings)

module.exports = function mountBooking(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    notify = () => {},
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
      is_deleted INTEGER DEFAULT 0,      -- Phase 3 recycle bin; older DBs get these via soft-delete.js
      deleted_at TIMESTAMP,
      deleted_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_ws ON bookings(workspace_id);
    -- Phase 4: the guard counts live bookings per lead on every lead
    -- permanent-delete, and every list is workspace + bin filtered. These live
    -- HERE, not in server.js: the module that creates the table must create its
    -- indexes, or a fresh install races the central index list against the mount.
    CREATE INDEX IF NOT EXISTS idx_bookings_lead ON bookings(lead_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_ws_deleted ON bookings(workspace_id, is_deleted);
  `);
  // Booking 2.0 columns (idempotent for existing installs)
  for (const c of ['token TEXT', 'intake TEXT']) { try { db.exec(`ALTER TABLE bookings ADD COLUMN ${c}`); } catch { /* exists */ } }

  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const DEFAULTS = {
    services: [{ name: 'Consultation', duration: 30, price: 0 }],
    availability: { 1: [9, 17], 2: [9, 17], 3: [9, 17], 4: [9, 17], 5: [9, 17] }, // 0=Sun..6=Sat
    slot_min: 30, days_ahead: 21,
    buffer_min: 0,        // gap enforced around each booking
    blackout: [],         // ['YYYY-MM-DD', …] days off
    intake: [],           // [{ label, required }] questions asked at booking
    timezone: '',         // display label (e.g. "Asia/Karachi"); slots are studio-local
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
    const buffer = Math.max(0, Number(cfg.buffer_min) || 0);
    const blackout = new Set(cfg.blackout || []);
    // Busy time from BOTH systems. This used to read the bookings table alone, so a
    // client could self-book the exact hour the studio had blocked for an internal
    // Google Meet and nothing objected (audit booking-7).
    const booked = availability.busyIntervals(db, ws, { bufferMin: buffer, defaultDurationMin: dur });
    const free = (sMs) => !availability.clashes(booked, sMs, sMs + (dur + buffer) * 60000);
    const out = []; const now = Date.now();
    for (let dayOffset = 0; dayOffset <= (cfg.days_ahead || 21); dayOffset++) {
      const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(0, 0, 0, 0);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (blackout.has(dateStr)) continue;
      const hours = cfg.availability && cfg.availability[d.getDay()];
      if (!hours) continue;
      const [startH, endH] = hours; const times = [];
      for (let mins = startH * 60; mins + dur <= endH * 60; mins += step) {
        const slot = new Date(d); slot.setMinutes(mins);
        if (slot.getTime() < now + 60 * 60 * 1000) continue; // ≥1h lead time
        if (!free(slot.getTime())) continue;
        times.push(`${dateStr} ${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}:00`);
      }
      if (times.length) out.push({ date: dateStr, times });
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
      res.json({ brand: brandName(row.workspace_id), services: cfg.services || [], slots: computeSlots(row.workspace_id, cfg), intake: cfg.intake || [], timezone: cfg.timezone || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/booking/public/:slug', async (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM booking_settings WHERE slug = ?').get(req.params.slug);
      if (!row) return res.status(404).json({ error: 'Not available' });
      const ws = row.workspace_id; const cfg = cfgOf(row);
      const { service, start_at, name, phone, email, notes, intake } = req.body || {};
      if (!start_at) return res.status(400).json({ error: 'Pick a time' });
      if (!name || !(phone || email)) return res.status(400).json({ error: 'Name and a phone or email are required' });
      // slot still free?
      const clash = db.prepare("SELECT id FROM bookings WHERE workspace_id = ? AND start_at = ? AND status != 'cancelled'").get(ws, start_at);
      if (clash) return res.status(409).json({ error: 'That time was just taken — please pick another.' });
      // required intake questions
      for (const q of (cfg.intake || [])) { if (q.required && !(intake && String(intake[q.label] || '').trim())) return res.status(400).json({ error: `Please answer: ${q.label}` }); }
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
      const bid = generateId(); const token = crypto.randomBytes(12).toString('hex');
      db.prepare('INSERT INTO bookings (id, workspace_id, lead_id, service, start_at, duration_min, name, phone, email, notes, intake, token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(bid, ws, lead.id, svc.name, start_at, svc.duration || 30, name, phone || null, email || null, notes || null, JSON.stringify(intake || {}), token);
      const manageUrl = `${clientBaseUrl}/booking/manage/${token}`;
      // Write reminder_date too — the reminder cron fires on reminder_date, so a
      // due_date-only row would silently never notify.
      try { db.prepare('INSERT INTO reminders (id, lead_id, user_id, title, due_date, reminder_date) VALUES (?,?,?,?,?,?)').run(generateId(), lead.id, ownerId, `${svc.name} with ${name}`, start_at, start_at); } catch {}
      try { addContactHistory(lead.id, ownerId, 'booking', `Booked ${svc.name} for ${new Date(start_at.replace(' ', 'T')).toLocaleString()}`); } catch {}
      try { if (lead.customer_phone) await sendClientMessage({ lead, userId: ownerId, text: `✅ You're booked: ${svc.name} on ${new Date(start_at.replace(' ', 'T')).toLocaleString()}.\nManage/reschedule: ${manageUrl}` }); } catch {}
      broadcastToWorkspace(ws, 'booking_created', { id: bid, lead_id: lead.id });
      try { notify(ws, { type: 'booking', title: 'New booking', body: `${name} booked ${svc.name} · ${new Date(start_at.replace(' ', 'T')).toLocaleString()}`, url: `/leads/${lead.id}`, icon: '📅' }); } catch {}
      res.json({ ok: true, service: svc.name, start_at, manage_url: manageUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Self-serve manage (reschedule / cancel) by booking token ────────────────
  app.get('/api/booking/manage/:token', (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE token = ?').get(req.params.token);
      if (!b) return res.status(404).json({ error: 'Not found' });
      const row = db.prepare('SELECT * FROM booking_settings WHERE workspace_id = ?').get(b.workspace_id);
      const cfg = cfgOf(row);
      res.json({ brand: brandName(b.workspace_id), booking: { service: b.service, start_at: b.start_at, name: b.name, status: b.status }, slots: computeSlots(b.workspace_id, cfg, b.duration_min) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/booking/manage/:token/reschedule', async (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE token = ?').get(req.params.token);
      if (!b) return res.status(404).json({ error: 'Not found' });
      const start_at = req.body.start_at; if (!start_at) return res.status(400).json({ error: 'Pick a time' });
      const clash = db.prepare("SELECT id FROM bookings WHERE workspace_id = ? AND start_at = ? AND status != 'cancelled' AND id != ?").get(b.workspace_id, start_at, b.id);
      if (clash) return res.status(409).json({ error: 'That time was just taken.' });
      db.prepare("UPDATE bookings SET start_at = ?, status = 'confirmed' WHERE id = ?").run(start_at, b.id);
      const ownerId = owner(b.workspace_id);
      try { addContactHistory(b.lead_id, ownerId, 'booking', `Rescheduled ${b.service} → ${new Date(start_at.replace(' ', 'T')).toLocaleString()}`); } catch {}
      // Notify the client of the new time (was previously silent — Appendix A fix).
      try { const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(b.lead_id); if (lead && lead.customer_phone) await sendClientMessage({ lead, userId: ownerId, text: `🗓️ Your ${b.service} booking is rescheduled to ${new Date(start_at.replace(' ', 'T')).toLocaleString()}.` }); } catch {}
      // The client was messaged, but the studio's own feed said nothing — and the
      // frame was still called 'booking_created' for a reschedule.
      broadcastToWorkspace(b.workspace_id, 'booking_updated', { id: b.id });
      try { notify(b.workspace_id, { type: 'booking', title: 'Booking rescheduled', body: `${b.service} → ${new Date(start_at.replace(' ', 'T')).toLocaleString()}`, url: '/bookings', icon: '🗓️' }); } catch {}
      res.json({ ok: true, start_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/booking/manage/:token/cancel', async (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE token = ?').get(req.params.token);
      if (!b) return res.status(404).json({ error: 'Not found' });
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
      const ownerId = owner(b.workspace_id);
      try { addContactHistory(b.lead_id, ownerId, 'booking', `Client cancelled ${b.service}`); } catch {}
      // Notify the client their cancellation went through (Appendix A fix).
      try { const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(b.lead_id); if (lead && lead.customer_phone) await sendClientMessage({ lead, userId: ownerId, text: `Your ${b.service} booking has been cancelled. Reply if you'd like to rebook.` }); } catch {}
      broadcastToWorkspace(b.workspace_id, 'booking_cancelled', { id: b.id });
      try { notify(b.workspace_id, { type: 'booking', title: 'Booking cancelled', body: `${b.service} — cancelled by the client`, url: '/bookings', icon: '❌' }); } catch {}
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
