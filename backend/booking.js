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

const { publicBrand, journeyLinks } = require('./public-brand');
const studioTime = require('./studio-time');

module.exports = function mountBooking(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    notify = () => {},
    sendClientMessage = async () => ({ skipped: true }),
    clientBaseUrl = process.env.FRONTEND_URL || '',
    // Injected so a booking hands off to the SAME creators the rest of the app
    // uses - a shoot booked from the calendar is not a second kind of shoot.
    createProject = null,
    createInvoiceForLead = null,
    // Puts the appointment on the studio's real (Google) calendar. A no-op unless
    // the studio set a booking timezone - see the note on bookingCalendar.
    calendar = null,
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
  // Phase 7: what this booking became. Kept ON the booking so the handoff is
  // idempotent - clicking "Create shoot" twice opens the first shoot instead of
  // quietly making a second one for the same appointment.
  for (const c of ['project_id TEXT', 'invoice_id TEXT', 'calendar_event_id TEXT', 'calendar_html_link TEXT']) { try { db.exec(`ALTER TABLE bookings ADD COLUMN ${c}`); } catch { /* exists */ } }

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
  // One resolver for who the studio is, shared by every public surface. The old
  // local helper returned a bare name and fell back to the literal 'WappFlow',
  // which told a client they were booking with the software vendor.
  const brand = (ws) => publicBrand(db, ws, clientBaseUrl);
  const getRow = (ws) => db.prepare('SELECT * FROM booking_settings WHERE workspace_id = ?').get(ws);
  const cfgOf = (row) => ({ ...DEFAULTS, ...J(row && row.settings, {}) });

  // Add minutes to a studio-LOCAL naive 'YYYY-MM-DD HH:MM:SS' and return the same
  // shape. Deliberately does its own arithmetic: new Date() on a naive string
  // reinterprets it in the SERVER's zone, which would shift every end time by the
  // studio's offset.
  function addMinutes(stamp, mins) {
    const m = String(stamp || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return stamp;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    d.setUTCMinutes(d.getUTCMinutes() + (Number(mins) || 0));
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`;
  }

  function slugify(s) { return String(s || 'studio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'studio'; }

  const LEAD_MS = 60 * 60 * 1000;      // a client cannot book the next hour

  // The studio's own calendar, expressed once. Everything below — slot offers,
  // the collision guard, the availability window — reads these two.
  function slotWindow(cfg, serviceDuration) {
    return {
      tz: studioTime.isValidZone(cfg.timezone) ? cfg.timezone : '',
      dur: Math.max(10, Number(serviceDuration) || cfg.slot_min || 30),
      step: Math.max(10, Number(cfg.slot_min) || 30),
      buffer: Math.max(0, Number(cfg.buffer_min) || 0),
      blackout: new Set(cfg.blackout || []),
      daysAhead: Number(cfg.days_ahead) || 21,
    };
  }

  // Calendar arithmetic on a 'YYYY-MM-DD' string, with no Date-object timezone
  // involved: adding a day must not depend on where the server is standing.
  const addDays = (dateStr, n) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    const p = (x) => String(x).padStart(2, '0');
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
  };
  const dowOf = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  };

  // Build available slots for the next N days from availability config minus booked times.
  //
  // Phase 9 (audit gap-4): the day loop used `new Date()` and `setHours`, i.e. the
  // SERVER's calendar. On a UTC box a Karachi studio's "today" rolled over five
  // hours late and the lead-time check was out by the same amount. Days and hours
  // are now the STUDIO's, and every comparison happens on the instant scale.
  function computeSlots(ws, cfg, serviceDuration, excludeBookingId) {
    const w = slotWindow(cfg, serviceDuration);
    // When MOVING a booking, its own slot must not count as busy or a four-hour
    // wedding would block every time it overlaps — i.e. most of the valid moves.
    const booked = availability.busyIntervals(db, ws, {
      bufferMin: w.buffer, defaultDurationMin: w.dur, timeZone: w.tz,
      excludeBookingId: excludeBookingId || undefined,
    });
    const free = (sMs) => !availability.clashes(booked, sMs, sMs + (w.dur + w.buffer) * 60000);
    const out = [];
    const now = Date.now();
    // "Today" where the studio is standing, not where the server is.
    const today = studioTime.msToWallClock(now, w.tz).slice(0, 10);

    for (let dayOffset = 0; dayOffset <= w.daysAhead; dayOffset++) {
      const dateStr = addDays(today, dayOffset);
      if (w.blackout.has(dateStr)) continue;
      const hours = cfg.availability && cfg.availability[dowOf(dateStr)];
      if (!hours) continue;
      const [startH, endH] = hours; const times = [];
      for (let mins = startH * 60; mins + w.dur <= endH * 60; mins += w.step) {
        const stamp = `${dateStr} ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
        const ms = studioTime.wallClockToMs(stamp, w.tz);
        if (!Number.isFinite(ms) || ms < now + LEAD_MS) continue;
        if (!free(ms)) continue;
        times.push(stamp);
      }
      if (times.length) out.push({ date: dateStr, times });
    }
    return out;
  }

  /**
   * Can this exact appointment be taken? Returns null when yes, or a reason.
   *
   * Phase 9 (audit gap-3). The create and reschedule guards were
   * `WHERE start_at = ?` — an EXACT match. A four-hour wedding at 09:00 did not
   * collide with a session at 10:00, and the public endpoint accepted any
   * start_at a caller sent rather than one it had offered, so an overlapping
   * booking did not even need a race to win. The 409 "just taken" message gave
   * false confidence about a calendar that was not being checked.
   *
   * This applies the SAME interval test computeSlots uses to offer slots, plus
   * the window rules the offer list already respects, so what the guard enforces
   * and what the page shows can no longer drift apart.
   */
  function slotProblem(ws, cfg, startStamp, serviceDuration, excludeBookingId) {
    const w = slotWindow(cfg, serviceDuration);
    const startMs = studioTime.wallClockToMs(startStamp, w.tz);
    if (!Number.isFinite(startMs)) return 'That time is not valid.';
    if (startMs < Date.now() + LEAD_MS) return 'Please pick a time at least an hour from now.';

    const dateStr = String(startStamp).slice(0, 10);
    if (w.blackout.has(dateStr)) return 'The studio is closed that day.';

    const hours = cfg.availability && cfg.availability[dowOf(dateStr)];
    if (!hours) return 'The studio is closed that day.';
    const [startH, endH] = hours;
    const mins = (Number(String(startStamp).slice(11, 13)) * 60) + Number(String(startStamp).slice(14, 16));
    if (!Number.isFinite(mins) || mins < startH * 60 || mins + w.dur > endH * 60) {
      return 'That time is outside the studio’s opening hours.';
    }

    const busy = availability.busyIntervals(db, ws, {
      bufferMin: w.buffer, defaultDurationMin: w.dur, timeZone: w.tz,
      excludeBookingId: excludeBookingId || undefined,
    });
    if (availability.clashes(busy, startMs, startMs + (w.dur + w.buffer) * 60000)) {
      return 'That time was just taken — please pick another.';
    }
    return null;
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
      // timezone was a free-text "display label" that nothing ever applied. It is
      // load-bearing now - slots, guards, messages and the calendar push all read
      // it - so an unusable value must be refused rather than silently ignored.
      if (settings.timezone && !studioTime.isValidZone(settings.timezone)) {
        return res.status(400).json({ error: `"${settings.timezone}" is not a timezone. Use an IANA name like Asia/Karachi.` });
      }
      let slug = (cur && cur.slug) || slugify(req.body.slug || brand(req.workspaceId).name || 'studio');
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
      // start_at is a wall clock AT THE STUDIO. The page rendered it with
      // new Date(...).toLocaleString(), i.e. in whatever zone the admin's browser
      // happens to be in - so an owner travelling saw every appointment shifted.
      res.json({ bookings: rows, timezone: cfgOf(getRow(req.workspaceId)).timezone || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Handoff: turn an appointment into the work it represents ──────────────
  // A booking used to be a dead end - the studio took the appointment and then
  // re-typed the client into Media Studio and again into an invoice. Both records
  // are created ALREADY LINKED to the same lead, and the link is stored on the
  // booking so a second click opens the first one.
  app.post('/api/booking/:id/handoff', auth, (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      if (!b.lead_id) return res.status(400).json({ error: 'This booking is not linked to a contact yet.' });
      const target = String(req.body?.target || '');

      if (target === 'shoot') {
        if (b.project_id) return res.json({ ok: true, existing: true, id: b.project_id, url: `/studio/${b.project_id}` });
        if (!createProject) return res.status(503).json({ error: 'Media Studio unavailable' });
        const project = createProject(req, {
          lead_id: b.lead_id,
          title: `${b.name || 'Client'} — ${b.service || 'Shoot'}`,
          // start_at is a studio-LOCAL 'YYYY-MM-DD HH:MM:SS'; the shoot date is the
          // date part of it, not a converted instant.
          shoot_date: String(b.start_at || '').slice(0, 10) || null,
        });
        db.prepare('UPDATE bookings SET project_id = ? WHERE id = ?').run(project.id, b.id);
        return res.json({ ok: true, id: project.id, url: `/studio/${project.id}` });
      }

      if (target === 'invoice') {
        if (b.invoice_id) return res.json({ ok: true, existing: true, id: b.invoice_id, url: `/invoices` });
        if (!createInvoiceForLead) return res.status(503).json({ error: 'Invoicing unavailable' });
        const invoice = createInvoiceForLead(req, {
          lead_id: b.lead_id,
          customer_name: b.name || null, customer_email: b.email || null, customer_phone: b.phone || null,
          items: [{ description: b.service || 'Session', qty: 1, rate: 0, amount: 0 }],
          subtotal: 0, tax_rate: 0, tax_amount: 0, discount: 0, total: 0,
          notes: `For the ${b.service || 'session'} on ${b.start_at}.`,
          status: 'draft',
        });
        db.prepare('UPDATE bookings SET invoice_id = ? WHERE id = ?').run(invoice.id, b.id);
        return res.json({ ok: true, id: invoice.id, url: `/invoices` });
      }

      return res.status(400).json({ error: 'target must be "shoot" or "invoice"' });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // The CLIENT could reschedule from their manage link; the studio could not,
  // from anywhere (audit booking-1). A studio that needed to move an appointment
  // had to ask the client to do it, or cancel and hope they rebooked.
  app.post('/api/booking/:id/reschedule', auth, async (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      const start_at = req.body?.start_at;
      if (!start_at) return res.status(400).json({ error: 'Pick a time' });

      const cfg = cfgOf(getRow(req.workspaceId));
      const moved = db.transaction(() => {
        const problem = slotProblem(req.workspaceId, cfg, start_at, b.duration_min || cfg.slot_min || 30, b.id);
        if (problem) return problem;
        db.prepare("UPDATE bookings SET start_at = ?, status = 'confirmed' WHERE id = ?").run(start_at, b.id);
        return null;
      })();
      if (moved) return res.status(409).json({ error: moved });

      if (calendar && b.calendar_event_id) {
        try {
          await calendar.move({
            workspaceId: req.workspaceId, eventId: b.calendar_event_id, timezone: cfg.timezone,
            startsAt: start_at, endsAt: addMinutes(start_at, b.duration_min || 30),
          });
        } catch (e) { console.warn('admin reschedule → calendar failed:', e.message); }
      }

      const when = studioTime.formatStudioTime(start_at, cfg.timezone);
      const ownerId = owner(req.workspaceId);
      try { if (b.lead_id) addContactHistory(b.lead_id, req.userId || ownerId, 'booking', `Rescheduled ${b.service} → ${when}`); } catch {}
      // The client must be told: a studio moving an appointment silently is worse
      // than not being able to move it at all.
      try {
        const lead = b.lead_id ? db.prepare('SELECT * FROM leads WHERE id = ?').get(b.lead_id) : null;
        if (lead && lead.customer_phone) {
          await sendClientMessage({ lead, userId: ownerId, text: `🗓️ Your ${b.service} booking has been moved to ${when}. Reply if that does not work for you.` });
        }
      } catch {}
      broadcastToWorkspace(req.workspaceId, 'booking_updated', { id: b.id });
      res.json({ ok: true, start_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Slots the studio can move a booking INTO — the same calendar the public page
  // reads, so admin and client cannot be shown different availability.
  app.get('/api/booking/:id/slots', auth, (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      const cfg = cfgOf(getRow(req.workspaceId));
      res.json({ slots: computeSlots(req.workspaceId, cfg, b.duration_min, b.id), timezone: cfg.timezone || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/booking/:id/cancel', auth, async (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND workspace_id = ?").run(req.params.id, req.workspaceId);
      if (calendar && b.calendar_event_id) {
        try { await calendar.remove({ workspaceId: b.workspace_id, eventId: b.calendar_event_id }); } catch (e) { console.warn('booking cancel → calendar failed:', e.message); }
        db.prepare('UPDATE bookings SET calendar_event_id = NULL, calendar_html_link = NULL WHERE id = ?').run(b.id);
      }
      // The studio cancelling was silent on every channel: no client message, no
      // history line, no feed entry. The client-side cancel did all three.
      const ownerId = owner(req.workspaceId);
      try { if (b.lead_id) addContactHistory(b.lead_id, req.userId || ownerId, 'booking', `Cancelled ${b.service}`); } catch {}
      try {
        const lead = b.lead_id ? db.prepare('SELECT * FROM leads WHERE id = ?').get(b.lead_id) : null;
        if (lead && lead.customer_phone) await sendClientMessage({ lead, userId: ownerId, text: `Your ${b.service} booking has been cancelled. Reply if you'd like to rebook.` });
      } catch {}
      broadcastToWorkspace(req.workspaceId, 'booking_cancelled', { id: b.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Public ────────────────────────────────────────────────────────────────
  app.get('/api/booking/public/:slug', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM booking_settings WHERE slug = ?').get(req.params.slug);
      if (!row) return res.status(404).json({ error: 'Not available' });
      const cfg = cfgOf(row);
      res.json({ brand: brand(row.workspace_id), services: cfg.services || [], slots: computeSlots(row.workspace_id, cfg), intake: cfg.intake || [], timezone: cfg.timezone || '' });
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
      // required intake questions
      for (const q of (cfg.intake || [])) { if (q.required && !(intake && String(intake[q.label] || '').trim())) return res.status(400).json({ error: `Please answer: ${q.label}` }); }
      const svc = (cfg.services || []).find(s => s.name === service) || (cfg.services || [])[0] || { name: service || 'Booking', duration: cfg.slot_min || 30 };
      const ownerId = owner(ws);
      const bid = generateId(); const token = crypto.randomBytes(12).toString('hex');

      // Check and claim in ONE transaction. Checking outside it left a window in
      // which two clients could both pass the guard and both insert — the exact
      // race the "just taken" message pretends to prevent.
      let lead;
      const taken = db.transaction(() => {
        const problem = slotProblem(ws, cfg, start_at, svc.duration || cfg.slot_min || 30, null);
        if (problem) return problem;

        // find or create the lead
        lead = phone ? db.prepare('SELECT * FROM leads WHERE workspace_id = ? AND customer_phone = ?').get(ws, phone) : null;
        if (!lead && email) lead = db.prepare('SELECT * FROM leads WHERE workspace_id = ? AND email = ?').get(ws, email);
        if (!lead) {
          const lid = generateId();
          db.prepare("INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, email, status, first_message) VALUES (?,?,?,?,?,?,'New',?)")
            .run(lid, ownerId, ws, name, phone || null, email || null, `Booked: ${svc.name}`);
          lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lid);
        }
        db.prepare('INSERT INTO bookings (id, workspace_id, lead_id, service, start_at, duration_min, name, phone, email, notes, intake, token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(bid, ws, lead.id, svc.name, start_at, svc.duration || 30, name, phone || null, email || null, notes || null, JSON.stringify(intake || {}), token);
        return null;
      })();
      if (taken) return res.status(409).json({ error: taken });
      const manageUrl = `${clientBaseUrl}/booking/manage/${token}`;
      // Write reminder_date too — the reminder cron fires on reminder_date, so a
      // due_date-only row would silently never notify.
      try { db.prepare('INSERT INTO reminders (id, lead_id, user_id, title, due_date, reminder_date) VALUES (?,?,?,?,?,?)').run(generateId(), lead.id, ownerId, `${svc.name} with ${name}`, start_at, start_at); } catch {}
      try { addContactHistory(lead.id, ownerId, 'booking', `Booked ${svc.name} for ${studioTime.formatStudioTime(start_at, cfg.timezone)}`); } catch {}
      try { if (lead.customer_phone) await sendClientMessage({ lead, userId: ownerId, text: `✅ You're booked: ${svc.name} on ${studioTime.formatStudioTime(start_at, cfg.timezone)}.\nManage/reschedule: ${manageUrl}` }); } catch {}
      // A service can declare itself a shoot, and then the booking creates the
      // project up front. Opt-in on purpose: auto-creating a Media Studio project
      // for every 15-minute discovery call would bury the real shoots.
      if (svc.creates_shoot && createProject) {
        try {
          const project = createProject(
            { workspaceId: ws, userId: ownerId, senderName: 'Booking' },
            { lead_id: lead.id, title: `${name} — ${svc.name}`, shoot_date: String(start_at).slice(0, 10) },
          );
          db.prepare('UPDATE bookings SET project_id = ? WHERE id = ?').run(project.id, bid);
        } catch (e) { console.warn('booking → shoot failed:', e.message); }
      }
      // The studio's real calendar is the one on their phone. Failing to reach it
      // must never fail the client's booking, so this is best-effort.
      if (calendar) {
        try {
          const ev = await calendar.create({
            workspaceId: ws, timezone: cfg.timezone,
            summary: `${svc.name} — ${name}`,
            description: [notes, `Manage: ${manageUrl}`].filter(Boolean).join(String.fromCharCode(10)),
            startsAt: start_at,
            endsAt: addMinutes(start_at, svc.duration || 30),
            attendee: email ? { email, name } : null,
          });
          if (ev) db.prepare('UPDATE bookings SET calendar_event_id = ?, calendar_html_link = ? WHERE id = ?').run(ev.event_id, ev.html_link, bid);
        } catch (e) { console.warn('booking → calendar failed:', e.message); }
      }
      broadcastToWorkspace(ws, 'booking_created', { id: bid, lead_id: lead.id });
      try { notify(ws, { type: 'booking', title: 'New booking', body: `${name} booked ${svc.name} · ${studioTime.formatStudioTime(start_at, cfg.timezone)}`, url: `/leads/${lead.id}`, icon: '📅' }); } catch {}
      res.json({
        ok: true, service: svc.name, start_at, manage_url: manageUrl,
        next: journeyLinks(db, ws, lead.id, clientBaseUrl),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Self-serve manage (reschedule / cancel) by booking token ────────────────
  app.get('/api/booking/manage/:token', (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE token = ?').get(req.params.token);
      if (!b) return res.status(404).json({ error: 'Not found' });
      const row = db.prepare('SELECT * FROM booking_settings WHERE workspace_id = ?').get(b.workspace_id);
      const cfg = cfgOf(row);
      res.json({ brand: brand(b.workspace_id), booking: { service: b.service, start_at: b.start_at, name: b.name, status: b.status }, slots: computeSlots(b.workspace_id, cfg, b.duration_min, b.id), timezone: cfg.timezone || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/booking/manage/:token/reschedule', async (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE token = ?').get(req.params.token);
      if (!b) return res.status(404).json({ error: 'Not found' });
      const start_at = req.body.start_at; if (!start_at) return res.status(400).json({ error: 'Pick a time' });
      const cfgNow = cfgOf(getRow(b.workspace_id));
      const moved = db.transaction(() => {
        // Excludes THIS booking, or it would collide with the slot it already holds.
        const problem = slotProblem(b.workspace_id, cfgNow, start_at, b.duration_min || cfgNow.slot_min || 30, b.id);
        if (problem) return problem;
        db.prepare("UPDATE bookings SET start_at = ?, status = 'confirmed' WHERE id = ?").run(start_at, b.id);
        return null;
      })();
      if (moved) return res.status(409).json({ error: moved });
      // Move the calendar entry with it. A booking that moves but leaves its event
      // behind is worse than never having pushed one: the studio blocks out an hour
      // they are actually free and misses the one they are not.
      if (calendar && b.calendar_event_id) {
        try {
          await calendar.move({
            workspaceId: b.workspace_id, eventId: b.calendar_event_id,
            timezone: cfgOf(getRow(b.workspace_id)).timezone,
            startsAt: start_at, endsAt: addMinutes(start_at, b.duration_min || 30),
          });
        } catch (e) { console.warn('booking reschedule → calendar failed:', e.message); }
      }
      const ownerId = owner(b.workspace_id);
      try { addContactHistory(b.lead_id, ownerId, 'booking', `Rescheduled ${b.service} → ${studioTime.formatStudioTime(start_at, cfgNow.timezone)}`); } catch {}
      // Notify the client of the new time (was previously silent — Appendix A fix).
      try { const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(b.lead_id); if (lead && lead.customer_phone) await sendClientMessage({ lead, userId: ownerId, text: `🗓️ Your ${b.service} booking is rescheduled to ${studioTime.formatStudioTime(start_at, cfgNow.timezone)}.` }); } catch {}
      // The client was messaged, but the studio's own feed said nothing — and the
      // frame was still called 'booking_created' for a reschedule.
      broadcastToWorkspace(b.workspace_id, 'booking_updated', { id: b.id });
      try { notify(b.workspace_id, { type: 'booking', title: 'Booking rescheduled', body: `${b.service} → ${studioTime.formatStudioTime(start_at, cfgNow.timezone)}`, url: '/bookings', icon: '🗓️' }); } catch {}
      res.json({ ok: true, start_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/booking/manage/:token/cancel', async (req, res) => {
    try {
      const b = db.prepare('SELECT * FROM bookings WHERE token = ?').get(req.params.token);
      if (!b) return res.status(404).json({ error: 'Not found' });
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
      if (calendar && b.calendar_event_id) {
        try { await calendar.remove({ workspaceId: b.workspace_id, eventId: b.calendar_event_id }); } catch (e) { console.warn('booking cancel → calendar failed:', e.message); }
        db.prepare('UPDATE bookings SET calendar_event_id = NULL, calendar_html_link = NULL WHERE id = ?').run(b.id);
      }
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
