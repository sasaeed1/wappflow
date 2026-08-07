'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  Platform safety net — ONE recycle bin (Phase 3)
// ════════════════════════════════════════════════════════════════════════════
//
// Before this there were two inconsistent bins and a lot of unrecoverable deletes:
// leads soft-deleted with a 90-day purge, Studio assets with a 30-day one, and
// invoices, contracts, bookings and workspace members were HARD deleted — gone, no
// undo. Worse, permanently deleting a lead ran `DELETE FROM invoices WHERE lead_id`,
// destroying financial records as a side effect of tidying a pipeline.
//
// Owner decisions this file encodes (2026-07-27):
//   • ONE retention window: 90 days for everything.
//   • Invoices soft-delete but NEVER auto-purge — a financial record must not vanish
//     on a timer. They stay restorable indefinitely.
//   • Deleting a lead with attached records is GUARDED, not cascaded: we refuse and
//     say what is attached, rather than silently removing a lot on one click.
//
// Everything here is additive and idempotent so it is safe to run against the live
// DB on boot, matching the existing safeAlter pattern.

const RETENTION_DAYS = 90;

// The canonical registry. `retentionDays: null` means "restorable forever, never
// swept" — the escape hatch that lets financial records live under the same bin
// without inheriting its timer.
const ENTITIES = {
  leads:             { label: 'Lead',        retentionDays: RETENTION_DAYS, flag: 'is_deleted' },
  invoices:          { label: 'Invoice',     retentionDays: null,           flag: 'is_deleted' },
  cs_documents:      { label: 'Contract',    retentionDays: RETENTION_DAYS, flag: 'is_deleted' },
  bookings:          { label: 'Booking',     retentionDays: RETENTION_DAYS, flag: 'is_deleted' },
  // NOT workspace_members. It is an AUTH table: the auth middleware resolves role and
  // permissions from it on every request. Soft-deleting a member would leave them
  // authenticating with their old permissions unless all ~10 read sites filter the
  // flag — and missing one is a privilege-escalation hole, not a cosmetic bug.
  // Removing a member stays immediate; recovery is a re-invite. (Phase 3 decision.)
  // ms_assets predates this module and carries its own file-cleanup logic in
  // media-studio.js (blobs must be removed from storage, not just rows). It is listed
  // so the retention window is declared in ONE place; the purge itself stays there.
  ms_assets:         { label: 'Media asset', retentionDays: RETENTION_DAYS, flag: null, externalPurge: true },
};

/** Adds the soft-delete columns to every registered table. Idempotent. */
function installSchema(db, safeAlter) {
  for (const [table, cfg] of Object.entries(ENTITIES)) {
    if (cfg.externalPurge) continue; // owns its own schema
    if (cfg.flag) safeAlter(`ALTER TABLE ${table} ADD COLUMN ${cfg.flag} INTEGER DEFAULT 0`);
    safeAlter(`ALTER TABLE ${table} ADD COLUMN deleted_at TIMESTAMP`);
    safeAlter(`ALTER TABLE ${table} ADD COLUMN deleted_by TEXT`);
  }
}

/** SQL fragment for "not in the bin" — every list query must use it. */
function notDeleted(table) {
  const cfg = ENTITIES[table];
  if (!cfg || !cfg.flag) return '1=1';
  return `(${table}.${cfg.flag} = 0 OR ${table}.${cfg.flag} IS NULL)`;
}

function softDelete(db, { table, id, workspaceId, userId, logAudit }) {
  const cfg = ENTITIES[table];
  if (!cfg) throw new Error(`soft-delete: unregistered table "${table}"`);
  const res = db.prepare(
    `UPDATE ${table} SET ${cfg.flag} = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
     WHERE id = ? AND workspace_id = ?`
  ).run(userId || null, id, workspaceId);
  if (res.changes && logAudit) logAudit(workspaceId, userId, 'soft_delete', table, id, { label: cfg.label });
  return res.changes;
}

function restore(db, { table, id, workspaceId, userId, logAudit }) {
  const cfg = ENTITIES[table];
  if (!cfg) throw new Error(`restore: unregistered table "${table}"`);
  const res = db.prepare(
    `UPDATE ${table} SET ${cfg.flag} = 0, deleted_at = NULL, deleted_by = NULL
     WHERE id = ? AND workspace_id = ?`
  ).run(id, workspaceId);
  if (res.changes && logAudit) logAudit(workspaceId, userId, 'restore', table, id, { label: cfg.label });
  return res.changes;
}

/**
 * Sweeps everything past its window. Tables with retentionDays === null are skipped
 * entirely — that is the invoice guarantee, enforced here rather than remembered at
 * each call site.
 */
function purgeExpired(db, workspaceId = null) {
  const purged = {};
  for (const [table, cfg] of Object.entries(ENTITIES)) {
    if (cfg.externalPurge || cfg.retentionDays === null) continue;
    try {
      const scope = workspaceId ? ' AND workspace_id = ?' : '';
      const args = workspaceId ? [workspaceId] : [];
      const res = db.prepare(
        `DELETE FROM ${table} WHERE ${cfg.flag} = 1
         AND deleted_at < datetime('now', '-${cfg.retentionDays} days')${scope}`
      ).run(...args);
      if (res.changes) purged[table] = res.changes;
    } catch { /* table may not exist in older DBs */ }
  }
  return purged;
}

/**
 * What is still attached to a lead. Powers the GUARD: rather than cascading a delete
 * across contracts, invoices and bookings, we refuse and hand back this list so the
 * UI can tell the user exactly what is in the way.
 *
 * Deliberately counts only LIVE rows — something already in the bin should not block
 * a delete, otherwise the bin becomes a trap you cannot empty.
 */
function attachmentsForLead(db, leadId, workspaceId) {
  const count = (sql, ...args) => {
    try { return db.prepare(sql).get(...args)?.c || 0; } catch { return 0; }
  };
  const items = [
    { key: 'invoices',  label: 'invoice',  n: count(`SELECT COUNT(*) c FROM invoices WHERE lead_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, leadId) },
    { key: 'contracts', label: 'contract', n: count(`SELECT COUNT(*) c FROM cs_documents WHERE lead_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, leadId) },
    { key: 'bookings',  label: 'booking',  n: count(`SELECT COUNT(*) c FROM bookings WHERE lead_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, leadId) },
  ].filter((i) => i.n > 0);

  return {
    blocked: items.length > 0,
    items,
    // A sentence the UI can show verbatim — the point of the guard is telling the
    // user WHAT is in the way, not just refusing.
    message: items.length
      ? `This lead still has ${items.map((i) => `${i.n} ${i.label}${i.n > 1 ? 's' : ''}`).join(', ')}. Delete or detach them first.`
      : null,
  };
}

module.exports = {
  RETENTION_DAYS,
  ENTITIES,
  installSchema,
  notDeleted,
  softDelete,
  restore,
  purgeExpired,
  attachmentsForLead,
};
