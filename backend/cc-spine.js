'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — PRODUCT EVENT SPINE (PROP-005 §D)
//
//  platform_events used to have one writer: admin actions inside command-center.js.
//  The "Live Event Stream" showed nothing customers did. Product modules can't call
//  emit() (the Command Center mounts last), and threading a dependency through every
//  route — including the WhatsApp inbound pipeline, which is off-limits — is the
//  wrong trade. SQLite triggers record the facts at the data layer instead:
//
//    user_signed_up · workspace_created · lead_created · contract_signed
//    payment_received · gallery_published · booking_created
//
//  Each trigger is a single INSERT into platform_events (plus a Founder Inbox row
//  for a new workspace). Triggers are only created when every column they reference
//  exists, so a schema difference can never make a product write fail.
//
//  A light poller (every 4s) pushes newly-written rows to admins watching the SSE
//  stream, using rowid as the cursor.
// ════════════════════════════════════════════════════════════════════════════

const NEW_ID = "lower(hex(randomblob(16)))";

const TRIGGERS = [
  {
    name: 'cc_ev_user_signup', table: 'users', cols: ['id', 'workspace_id'],
    sql: `CREATE TRIGGER IF NOT EXISTS cc_ev_user_signup AFTER INSERT ON users BEGIN
      INSERT INTO platform_events (id, workspace_id, actor_type, actor_id, type, entity_type, entity_id, source)
      VALUES (${NEW_ID}, NEW.workspace_id, 'user', NEW.id, 'user_signed_up', 'user', NEW.id, 'trigger');
    END`,
  },
  {
    name: 'cc_ev_workspace_created', table: 'workspaces', cols: ['id', 'name', 'owner_id'],
    sql: `CREATE TRIGGER IF NOT EXISTS cc_ev_workspace_created AFTER INSERT ON workspaces BEGIN
      INSERT INTO platform_events (id, workspace_id, actor_type, actor_id, type, entity_type, entity_id, payload, source)
      VALUES (${NEW_ID}, NEW.id, 'user', NEW.owner_id, 'workspace_created', 'workspace', NEW.id, json_object('name', NEW.name), 'trigger');
      INSERT INTO cc_inbox (id, kind, workspace_id, severity, title, body, link)
      VALUES (${NEW_ID}, 'new_signup', NEW.id, 'low', 'New workspace: ' || COALESCE(NEW.name, 'unnamed'), 'A new customer just signed up.', '/control/customers/' || NEW.id);
    END`,
  },
  {
    name: 'cc_ev_lead_created', table: 'leads', cols: ['id', 'workspace_id', 'platform_source'],
    sql: `CREATE TRIGGER IF NOT EXISTS cc_ev_lead_created AFTER INSERT ON leads BEGIN
      INSERT INTO platform_events (id, workspace_id, actor_type, type, entity_type, entity_id, payload, source)
      VALUES (${NEW_ID}, NEW.workspace_id, 'system', 'lead_created', 'lead', NEW.id, json_object('channel', NEW.platform_source), 'trigger');
    END`,
  },
  {
    name: 'cc_ev_contract_signed', table: 'cs_documents', cols: ['id', 'workspace_id', 'status', 'type'],
    sql: `CREATE TRIGGER IF NOT EXISTS cc_ev_contract_signed AFTER UPDATE OF status ON cs_documents
      WHEN NEW.status = 'signed' AND COALESCE(OLD.status, '') <> 'signed' BEGIN
      INSERT INTO platform_events (id, workspace_id, actor_type, type, entity_type, entity_id, payload, source)
      VALUES (${NEW_ID}, NEW.workspace_id, 'client', 'contract_signed', 'contract', NEW.id, json_object('type', NEW.type), 'trigger');
    END`,
  },
  {
    name: 'cc_ev_payment_paid_upd', table: 'payments', cols: ['id', 'workspace_id', 'status', 'amount', 'currency'],
    sql: `CREATE TRIGGER IF NOT EXISTS cc_ev_payment_paid_upd AFTER UPDATE OF status ON payments
      WHEN NEW.status = 'paid' AND COALESCE(OLD.status, '') <> 'paid' BEGIN
      INSERT INTO platform_events (id, workspace_id, actor_type, type, entity_type, entity_id, payload, source)
      VALUES (${NEW_ID}, NEW.workspace_id, 'client', 'payment_received', 'payment', NEW.id, json_object('amount', NEW.amount, 'currency', NEW.currency), 'trigger');
    END`,
  },
  {
    name: 'cc_ev_payment_paid_ins', table: 'payments', cols: ['id', 'workspace_id', 'status', 'amount', 'currency'],
    sql: `CREATE TRIGGER IF NOT EXISTS cc_ev_payment_paid_ins AFTER INSERT ON payments WHEN NEW.status = 'paid' BEGIN
      INSERT INTO platform_events (id, workspace_id, actor_type, type, entity_type, entity_id, payload, source)
      VALUES (${NEW_ID}, NEW.workspace_id, 'user', 'payment_received', 'payment', NEW.id, json_object('amount', NEW.amount, 'currency', NEW.currency), 'trigger');
    END`,
  },
  {
    name: 'cc_ev_gallery_published', table: 'ms_galleries', cols: ['id', 'workspace_id', 'status'],
    sql: `CREATE TRIGGER IF NOT EXISTS cc_ev_gallery_published AFTER UPDATE OF status ON ms_galleries
      WHEN NEW.status = 'published' AND COALESCE(OLD.status, '') <> 'published' BEGIN
      INSERT INTO platform_events (id, workspace_id, actor_type, type, entity_type, entity_id, source)
      VALUES (${NEW_ID}, NEW.workspace_id, 'user', 'gallery_published', 'gallery', NEW.id, 'trigger');
    END`,
  },
  {
    name: 'cc_ev_booking_created', table: 'bookings', cols: ['id', 'workspace_id', 'service'],
    sql: `CREATE TRIGGER IF NOT EXISTS cc_ev_booking_created AFTER INSERT ON bookings BEGIN
      INSERT INTO platform_events (id, workspace_id, actor_type, type, entity_type, entity_id, payload, source)
      VALUES (${NEW_ID}, NEW.workspace_id, 'client', 'booking_created', 'booking', NEW.id, json_object('service', NEW.service), 'trigger');
    END`,
  },
];

function colsOf(db, table) {
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)); } catch { return new Set(); }
}

// Create every trigger whose table and columns exist. Returns the names installed.
function installTriggers(db) {
  const installed = [];
  for (const t of TRIGGERS) {
    const cols = colsOf(db, t.table);
    if (!cols.size || !t.cols.every((c) => cols.has(c))) continue;
    try { db.exec(t.sql); installed.push(t.name); } catch (e) { console.error(`cc-spine: ${t.name}:`, e.message); }
  }
  return installed;
}

// Push trigger-written events to admins on the live stream.
function startPoller(db, broadcastToAdmins, everyMs = 4000) {
  let cursor = 0;
  try { cursor = db.prepare('SELECT COALESCE(MAX(rowid),0) AS r FROM platform_events').get().r; } catch {}
  const tick = () => {
    try {
      const rows = db.prepare(`SELECT e.rowid AS _r, e.*, w.name AS workspace_name FROM platform_events e
        LEFT JOIN workspaces w ON w.id = e.workspace_id WHERE e.rowid > ? AND e.source = 'trigger' ORDER BY e.rowid LIMIT 200`).all(cursor);
      for (const r of rows) {
        cursor = r._r;
        const { _r, ...ev } = r;
        broadcastToAdmins('event', { event: ev });
      }
      if (!rows.length) {
        // keep the cursor current even when nothing was a trigger event
        cursor = Math.max(cursor, db.prepare('SELECT COALESCE(MAX(rowid),0) AS r FROM platform_events').get().r);
      }
    } catch {}
  };
  const h = setInterval(tick, everyMs);
  if (h.unref) h.unref();
  return () => clearInterval(h);
}

module.exports = { installTriggers, startPoller, TRIGGERS };
