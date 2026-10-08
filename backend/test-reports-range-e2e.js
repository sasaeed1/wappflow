'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Analytics follows the chosen date range — every figure, not just the charts.
//
//  Before: only "Leads over time" and the revenue chart changed with 7D/30D/1Y;
//  the cards, funnel, sources, team and lost reasons were all-time, so the
//  filter looked broken. Revenue summed a typed deal amount, so paid invoices
//  never showed. This checks the endpoint against a real server and database.
//
//    DATA_DIR=<scratch> PORT=3024 node server.js &
//    DATA_DIR=<scratch> WF_API=http://127.0.0.1:3024/api node test-reports-range-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const API = process.env.WF_API || 'http://127.0.0.1:3024/api';
const db = new Database(path.join(process.env.DATA_DIR, 'wappflow.db'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const j = async (method, p, tok, body) => {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})) };
};
const RUN = Date.now();
const digits = String(RUN).slice(-7);

(async () => {
  const A = (await j('POST', '/auth/register', null, { email: `rr-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Range A' })).d.token;
  const B = (await j('POST', '/auth/register', null, { email: `rr-b-${RUN}@test.local`, password: 'pw123456', businessName: 'Range B' })).d.token;

  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = await j('POST', '/leads', A, { customer_name: `Range ${i}`, customer_phone: `+4477${digits}${i}`, estimated_value: 100 * (i + 1) });
    ids.push(r.d.id || r.d.lead?.id);
  }
  ok(ids.every(Boolean), 'three leads created');
  const wid = db.prepare('SELECT workspace_id FROM leads WHERE id=?').get(ids[0]).workspace_id;

  // Lead 0 arrived 60 days ago; lead 1 is won today for 500.
  db.prepare("UPDATE leads SET created_at = datetime('now','-60 days') WHERE id=?").run(ids[0]);
  await j('PUT', `/leads/${ids[1]}/status`, A, { status: 'Closed - Won', actual_sale: 500 });
  // Money received: 200 today, 300 sixty days ago.
  const pay = db.prepare("INSERT INTO payments (id, workspace_id, kind, amount, status, paid_at) VALUES (?,?,?,?, 'paid', datetime('now', ?))");
  pay.run(crypto.randomUUID(), wid, 'manual', 200, '+0 days');
  pay.run(crypto.randomUUID(), wid, 'manual', 300, '-60 days');

  console.log('\n[1] Last 7 days counts only what happened in the last 7 days');
  const w = (await j('GET', '/reports/overview?period=7', A)).d;
  ok(w.range?.days === 7, `range is 7 days (${w.range?.start} → ${w.range?.end})`);
  ok(w.summary?.leads === 2, `2 new leads (got ${w.summary?.leads})`);
  ok(w.summary?.won === 1 && w.summary?.won_value === 500, `1 deal won worth 500 (got ${w.summary?.won} / ${w.summary?.won_value})`);
  ok(w.summary?.collected === 200, `200 collected (got ${w.summary?.collected})`);
  ok(w.summary?.conversion_rate === 50, `conversion 50% (got ${w.summary?.conversion_rate})`);
  ok(w.pipeline.reduce((s, p) => s + p.count, 0) === 2, 'the funnel counts the 2 leads in range');
  ok(w.revenueOverTime.length === 1 && w.revenueOverTime[0].revenue === 200, 'revenue chart shows the payment, not the typed deal amount');
  ok(w.wonOverTime.length === 1 && w.wonOverTime[0].revenue === 500, 'won-deals line shows the 500 deal');
  ok(w.previous?.leads === 0, 'the 7 days before had no leads');

  console.log('\n[2] Last 90 days includes the older lead and payment');
  const q = (await j('GET', '/reports/overview?period=90', A)).d;
  ok(q.summary.leads === 3, `3 new leads (got ${q.summary.leads})`);
  ok(q.summary.collected === 500, `500 collected (got ${q.summary.collected})`);
  ok(q.sources.reduce((s, x) => s + x.count, 0) === 3, 'sources cover all 3 leads');

  console.log('\n[3] A custom range shows only that range');
  const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const c = (await j('GET', `/reports/overview?start_date=${d(65)}&end_date=${d(55)}`, A)).d;
  ok(c.range.start === d(65) && c.range.end === d(55), 'the range is echoed back');
  ok(c.summary.leads === 1 && c.summary.collected === 300, `only the old lead and payment (got ${c.summary.leads} / ${c.summary.collected})`);
  ok(c.summary.won === 0, 'no deals won then');

  console.log('\n[4] Bad input is safe, and workspaces stay separate');
  const bad = await j('GET', `/reports/overview?start_date=${encodeURIComponent("2026-01-01' OR 1=1 --")}&end_date=x&tz=${encodeURIComponent('1; DROP TABLE leads')}`, A);
  ok(bad.s === 200 && bad.d.range.days === 30, 'nonsense dates fall back to the last 30 days');
  ok(db.prepare('SELECT COUNT(*) c FROM leads WHERE workspace_id=?').get(wid).c === 3, 'leads table intact');
  const other = (await j('GET', '/reports/overview?period=365', B)).d;
  ok(other.summary.leads === 0 && other.summary.collected === 0, "another workspace sees none of it");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
