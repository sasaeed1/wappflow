// ════════════════════════════════════════════════════════════════════════════
//  CC-METERING — usage rollups + health/churn/expansion scoring.
//  See COMMAND-CENTER-SPEC.md §1.5 (metering), §10 (adoption), §11 (health).
//
//  Two derivations, both idempotent and re-runnable:
//   • runRollup()    → per-workspace daily snapshot into workspace_usage_daily
//   • computeScores() → per-workspace health/churn/expansion/activity into workspace_scores
//
//  All scoring is transparent and advisory. Cron runs nightly; also runs once
//  shortly after boot so the dashboards aren't empty, and on-demand via
//  POST /api/cc/rollup/run.
// ════════════════════════════════════════════════════════════════════════════
module.exports = function metering(db, deps = {}) {
  let cron = null; try { cron = require('node-cron'); } catch {}

  const safeAll = (sql) => { try { return db.prepare(sql).all(); } catch { return []; } };
  const mapBy = (rows, key) => { const m = {}; rows.forEach((r) => { m[r[key]] = r; }); return m; };
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  // ── Daily usage snapshot ──────────────────────────────────────────────────
  function runRollup() {
    const date = new Date().toISOString().slice(0, 10); // UTC, matches date('now')
    const leads = mapBy(safeAll("SELECT workspace_id ws, COUNT(*) c FROM leads WHERE date(created_at)=date('now') GROUP BY workspace_id"), 'ws');
    const msgs = mapBy(safeAll("SELECT l.workspace_id ws, COUNT(*) c FROM messages m JOIN leads l ON l.id=m.lead_id WHERE date(m.timestamp)=date('now') GROUP BY l.workspace_id"), 'ws');
    const ai = mapBy(safeAll("SELECT workspace_id ws, COUNT(*) c, COALESCE(SUM(est_cost),0) cost FROM ai_usage WHERE date(ts)=date('now') AND workspace_id IS NOT NULL GROUP BY workspace_id"), 'ws');
    const storage = mapBy(safeAll("SELECT workspace_id ws, COALESCE(SUM(size_bytes),0) b FROM ms_assets GROUP BY workspace_id"), 'ws');
    const active = mapBy(safeAll("SELECT l.workspace_id ws, COUNT(DISTINCT m.user_id) c FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.from_me=1 AND m.timestamp >= datetime('now','-7 days') GROUP BY l.workspace_id"), 'ws');
    const contracts = mapBy(safeAll("SELECT workspace_id ws, COUNT(*) c FROM cs_documents WHERE date(created_at)=date('now') GROUP BY workspace_id"), 'ws');
    const bookings = mapBy(safeAll("SELECT workspace_id ws, COUNT(*) c FROM bookings WHERE date(created_at)=date('now') GROUP BY workspace_id"), 'ws');
    const galleries = mapBy(safeAll("SELECT workspace_id ws, COUNT(*) c FROM ms_galleries WHERE date(created_at)=date('now') GROUP BY workspace_id"), 'ws');
    const wss = safeAll('SELECT id FROM workspaces');

    const up = db.prepare(`INSERT INTO workspace_usage_daily
      (workspace_id, date, leads, messages, ai_calls, ai_cost, storage_bytes, active_users, contracts, bookings, galleries)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(workspace_id, date) DO UPDATE SET leads=excluded.leads, messages=excluded.messages,
        ai_calls=excluded.ai_calls, ai_cost=excluded.ai_cost, storage_bytes=excluded.storage_bytes,
        active_users=excluded.active_users, contracts=excluded.contracts, bookings=excluded.bookings, galleries=excluded.galleries`);
    try {
      db.transaction(() => {
        for (const w of wss) {
          up.run(w.id, date, leads[w.id]?.c || 0, msgs[w.id]?.c || 0, ai[w.id]?.c || 0, ai[w.id]?.cost || 0,
            storage[w.id]?.b || 0, active[w.id]?.c || 0, contracts[w.id]?.c || 0, bookings[w.id]?.c || 0, galleries[w.id]?.c || 0);
        }
      })();
    } catch (e) { console.error('rollup:', e.message); }
    return wss.length;
  }

  // ── Health / churn / expansion / activity scoring ─────────────────────────
  function computeScores() {
    const lastAct = mapBy(safeAll('SELECT workspace_id ws, MAX(last_contacted_at) la FROM leads GROUP BY workspace_id'), 'ws');
    const leadTot = mapBy(safeAll('SELECT workspace_id ws, COUNT(*) c FROM leads GROUP BY workspace_id'), 'ws');
    const msgTot = mapBy(safeAll('SELECT l.workspace_id ws, COUNT(*) c, MAX(m.timestamp) lm FROM messages m JOIN leads l ON l.id=m.lead_id GROUP BY l.workspace_id'), 'ws');
    const projTot = mapBy(safeAll('SELECT workspace_id ws, COUNT(*) c FROM ms_projects GROUP BY workspace_id'), 'ws');
    const conTot = mapBy(safeAll('SELECT workspace_id ws, COUNT(*) c FROM cs_documents GROUP BY workspace_id'), 'ws');
    const bookTot = mapBy(safeAll('SELECT workspace_id ws, COUNT(*) c FROM bookings GROUP BY workspace_id'), 'ws');
    const galTot = mapBy(safeAll('SELECT workspace_id ws, COUNT(*) c FROM ms_galleries GROUP BY workspace_id'), 'ws');
    const aiTot = mapBy(safeAll('SELECT workspace_id ws, COUNT(*) c FROM ai_usage WHERE workspace_id IS NOT NULL GROUP BY workspace_id'), 'ws');
    const plans = mapBy(safeAll('SELECT workspace_id ws, plan FROM workspace_plan'), 'ws');
    const wss = safeAll('SELECT id FROM workspaces');
    const now = Date.now();
    const daysSince = (ts) => { if (!ts) return 999; const t = new Date(String(ts).replace(' ', 'T') + 'Z').getTime(); return isFinite(t) ? Math.max(0, (now - t) / 86400000) : 999; };

    const up = db.prepare(`INSERT INTO workspace_scores (workspace_id, health, churn, expansion, activity, risk_factors, computed_at)
      VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id) DO UPDATE SET health=excluded.health, churn=excluded.churn,
        expansion=excluded.expansion, activity=excluded.activity, risk_factors=excluded.risk_factors, computed_at=CURRENT_TIMESTAMP`);
    try {
      db.transaction(() => {
        for (const w of wss) {
          const id = w.id;
          const lastTs = [lastAct[id]?.la, msgTot[id]?.lm].filter(Boolean).sort().pop();
          const dsa = daysSince(lastTs);
          const leadsC = leadTot[id]?.c || 0, msgsC = msgTot[id]?.c || 0, projC = projTot[id]?.c || 0,
            conC = conTot[id]?.c || 0, bookC = bookTot[id]?.c || 0, galC = galTot[id]?.c || 0, aiC = aiTot[id]?.c || 0;
          const modules = [true, conC > 0, projC > 0, bookC > 0, galC > 0, aiC > 0]; // CRM always present
          const adoption = (modules.filter(Boolean).length / modules.length) * 100;
          const activity = clamp(100 - dsa * 5);
          const volume = clamp(Math.log10(1 + leadsC + msgsC) * 33);
          const health = clamp(0.4 * activity + 0.35 * adoption + 0.25 * volume);
          const plan = plans[id]?.plan || 'free';
          const lowPlan = plan === 'free' || plan === 'starter';
          let churn = clamp(0.6 * (100 - activity) + 0.4 * (100 - adoption));
          if (lowPlan && dsa > 14) churn = clamp(churn + 10);
          const expansion = clamp(volume * (lowPlan ? 1 : 0.4) * (adoption / 100 + 0.3));
          const risks = [];
          if (dsa > 30) risks.push('inactive_30d'); else if (dsa > 14) risks.push('inactive_14d');
          if (msgsC === 0) risks.push('no_messages');
          if (conC === 0) risks.push('no_contracts');
          if (projC === 0) risks.push('no_projects');
          if (aiC === 0) risks.push('no_ai');
          if (adoption < 34) risks.push('low_adoption');
          up.run(id, health, churn, expansion, activity, JSON.stringify(risks));
        }
      })();
    } catch (e) { console.error('scores:', e.message); }
    return wss.length;
  }

  function runAll() { const n = runRollup(); computeScores(); return n; }

  function start() {
    if (cron) { try { cron.schedule('0 2 * * *', runAll); } catch {} }
    const t = setTimeout(() => { try { runAll(); } catch {} }, 8000);
    if (t && t.unref) t.unref();
  }

  return { runRollup, computeScores, runAll, start };
};
