'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Demo data seeder — for visual QA of every surface, including client-facing.
//
//  EVERY row this writes has an id beginning "demo-", which is the whole
//  cleanup story: `node seed-demo.js --clean` removes exactly what it added and
//  can never touch a real record. Nothing here updates or deletes existing
//  rows; it only inserts.
//
//  Phone numbers are +1 555 01xx (the reserved fictional range) so no
//  automation can ever reach a real handset, and every visible name carries a
//  DEMO marker so a screenshot is never mistaken for a real client.
//
//  Media is NOT fabricated: galleries reference assets already in the library,
//  so the public gallery renders real images instead of broken <img> tags.
//
//    node seed-demo.js          seed
//    node seed-demo.js --clean  remove every demo-* row
//    node seed-demo.js --urls   print the public URLs to audit
// ════════════════════════════════════════════════════════════════════════════
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : __dirname);
const db = new Database(path.join(DATA_DIR, 'wappflow.db'));
const BASE = process.env.BASE_URL || 'https://wappflow.remoteops.co';

const ws = db.prepare('SELECT id FROM workspaces LIMIT 1').get();
const user = db.prepare('SELECT id, email FROM users LIMIT 1').get();
if (!ws || !user) { console.error('No workspace/user found — nothing to attach demo data to.'); process.exit(1); }
const WS = ws.id, UID = user.id;

// Tables the seeder touches, in dependency order for cleanup (children first).
const TABLES = [
  'ms_print_orders', 'ms_gallery_assets', 'ms_portfolio_items', 'ms_galleries', 'ms_projects',
  'knowledge_documents', 'ms_print_products', 'bookings', 'payments',
  'cs_documents', 'invoices', 'messages', 'leads',
];

function clean() {
  let total = 0;
  for (const t of TABLES) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
      // ms_gallery_assets has no id column — key off gallery_id instead.
      const col = cols.includes('id') ? 'id' : cols.includes('gallery_id') ? 'gallery_id' : null;
      if (!col) continue;
      const r = db.prepare(`DELETE FROM ${t} WHERE ${col} LIKE 'demo-%'`).run();
      if (r.changes) { console.log(`  − ${String(r.changes).padStart(3)}  ${t}`); total += r.changes; }
    } catch (e) { console.log(`  !  ${t}: ${e.message.slice(0, 60)}`); }
  }
  // booking_settings is keyed on workspace_id, not an id — only remove the slug
  // this seeder published, never a real one the studio configured itself.
  try {
    const r = db.prepare("DELETE FROM booking_settings WHERE workspace_id = ? AND slug = 'demo-studio'").run(WS);
    if (r.changes) { console.log(`  −   ${r.changes}  booking_settings (demo-studio)`); total += r.changes; }
  } catch {}

  // Rows the APP created while the demo data was being exercised — a store
  // checkout raises a real order, invoice and payment with server-generated ids,
  // so "demo-%" alone would strand them. They are reachable from the demo
  // gallery, which is how we find them.
  try {
    const orders = db.prepare("SELECT id, invoice_id, payment_id FROM ms_print_orders WHERE gallery_id LIKE 'demo-%' AND id NOT LIKE 'demo-%'").all();
    for (const o of orders) {
      if (o.payment_id) db.prepare('DELETE FROM payments WHERE id = ?').run(o.payment_id);
      if (o.invoice_id) db.prepare('DELETE FROM invoices WHERE id = ?').run(o.invoice_id);
      db.prepare('DELETE FROM ms_print_orders WHERE id = ?').run(o.id);
      console.log(`  − order ${o.id.slice(0, 8)} (+ its invoice and payment) raised by the demo store`);
      total += 1;
    }
  } catch (e) { console.log('  !  store-generated rows: ' + e.message.slice(0, 60)); }

  // The portfolio is shared with real data — only undo the flag we set.
  try {
    const r = db.prepare("UPDATE ms_portfolios SET is_public = 0 WHERE id IN (SELECT id FROM ms_portfolios WHERE workspace_id = ?)").run(WS);
    if (r.changes) console.log(`  ↺ ${r.changes}  ms_portfolios (is_public reset to 0)`);
  } catch {}
  console.log(`\n${total} demo row(s) removed.`);
}

// ── helpers ────────────────────────────────────────────────────────────────
const now = Date.now();
const DAY = 86400000;
const stamp = (offsetDays) => new Date(now + offsetDays * DAY).toISOString().replace('T', ' ').slice(0, 19);
const iso = (offsetDays) => new Date(now + offsetDays * DAY).toISOString();
const has = (t, c) => { try { return db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c); } catch { return false; } };

// Insert only the columns that actually exist, so a schema drift skips a field
// rather than aborting the whole seed.
function insert(table, row) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const keys = Object.keys(row).filter((k) => cols.includes(k));
  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  db.prepare(sql).run(...keys.map((k) => row[k]));
}

function seed() {
  const made = {};
  const bump = (k, n = 1) => { made[k] = (made[k] || 0) + n; };

  // ── LEADS — one per pipeline stage, plus two converted clients ────────────
  const LEADS = [
    { id: 'demo-lead-01', name: 'DEMO · Aisha Rahman',   phone: '+15550100', status: 'New',           value: 1400, msg: 'Hi! Do you have availability for a two-day wedding in December?' },
    { id: 'demo-lead-02', name: 'DEMO · Omar Farooq',    phone: '+15550101', status: 'Contacted',     value: 700,  msg: 'What are your rates for a half-day corporate shoot?' },
    { id: 'demo-lead-03', name: 'DEMO · Priya Sharma',   phone: '+15550102', status: 'Interested',    value: 2600, msg: 'The package looks great — can we add a highlight film?' },
    { id: 'demo-lead-04', name: 'DEMO · Daniel Okafor',  phone: '+15550103', status: 'Negotiating',   value: 3200, msg: 'Can you do anything on the album price if we book both days?' },
    { id: 'demo-lead-05', name: 'DEMO · Mei Lin',        phone: '+15550104', status: 'Closed - Won',  value: 2600, msg: 'Booked! Sending the deposit now.', client: 1 },
    { id: 'demo-lead-06', name: 'DEMO · Tomas Novak',    phone: '+15550105', status: 'Closed - Won',  value: 1400, msg: 'Contract signed — see you on the day.', client: 1 },
    { id: 'demo-lead-07', name: 'DEMO · Sofia Ricci',    phone: '+15550106', status: 'Closed - Lost', value: 900,  msg: 'We went with someone closer to the venue, sorry!' },
    { id: 'demo-lead-08', name: 'DEMO · Kwame Mensah',   phone: '+15550107', status: 'New',           value: 0,    msg: 'Do you travel for shoots?' },
  ];
  for (const [i, l] of LEADS.entries()) {
    insert('leads', {
      id: l.id, user_id: UID, workspace_id: WS,
      customer_name: l.name, customer_phone: l.phone,
      email: `demo${i + 1}@example.test`,
      status: l.status, first_message: l.msg,
      total_messages: 3, estimated_value: l.value,
      actual_sale: l.status === 'Closed - Won' ? l.value : null,
      is_client: l.client || 0,
      client_since: l.client ? stamp(-20 + i) : null,
      closed_at: (l.status === 'Closed - Won' || l.status === 'Closed - Lost') ? stamp(-8 + i) : null,
      lost_reason: l.status === 'Closed - Lost' ? 'Chose a closer supplier' : null,
      lead_source: ['whatsapp', 'instagram', 'facebook', 'website'][i % 4],
      created_at: stamp(-30 + i * 2), last_message_at: stamp(-2 + (i % 3)),
      is_deleted: 0,
    });
    bump('leads');

    // A short thread each, so conversation views are not empty.
    const thread = [
      { b: l.msg, me: 0, d: -2.0 },
      { b: 'Thanks for getting in touch — let me check the calendar and come right back to you.', me: 1, d: -1.9 },
      { b: 'Perfect, no rush.', me: 0, d: -1.8 },
    ];
    thread.forEach((m, k) => {
      insert('messages', {
        id: `demo-msg-${i + 1}-${k}`, lead_id: l.id, user_id: UID,
        body: m.b, from_me: m.me, timestamp: stamp(m.d), platform: 'whatsapp',
      });
      bump('messages');
    });
  }

  // ── INVOICES — every status the list filters on ───────────────────────────
  const items = (label, amt) => JSON.stringify([{ description: label, quantity: 1, rate: amt, amount: amt }]);
  const INVOICES = [
    { id: 'demo-inv-01', no: 'DEMO-1001', lead: 'demo-lead-05', name: 'DEMO · Mei Lin',       total: 2600, status: 'paid',    due: 5 },
    { id: 'demo-inv-02', no: 'DEMO-1002', lead: 'demo-lead-06', name: 'DEMO · Tomas Novak',   total: 1400, status: 'sent',    due: 9 },
    { id: 'demo-inv-03', no: 'DEMO-1003', lead: 'demo-lead-04', name: 'DEMO · Daniel Okafor', total: 3200, status: 'pending', due: 3 },
    // "overdue" is DERIVED by the backend from due_date, never stored — a past
    // due date on a pending invoice is what makes the Overdue tab light up.
    { id: 'demo-inv-04', no: 'DEMO-1004', lead: 'demo-lead-03', name: 'DEMO · Priya Sharma',  total: 800,  status: 'pending', due: -6 },
    { id: 'demo-inv-05', no: 'DEMO-1005', lead: 'demo-lead-02', name: 'DEMO · Omar Farooq',   total: 700,  status: 'draft',   due: 14 },
  ];
  for (const v of INVOICES) {
    insert('invoices', {
      id: v.id, user_id: UID, workspace_id: WS, lead_id: v.lead,
      invoice_number: v.no, customer_name: v.name,
      customer_email: 'demo@example.test', customer_phone: '+15550100',
      items: items('Photography coverage', v.total),
      subtotal: v.total, tax_rate: 0, tax_amount: 0, discount: 0, total: v.total,
      currency: 'USD', currency_symbol: '$',
      status: v.status, due_date: stamp(v.due),
      notes: 'Demo invoice — safe to delete.',
      created_at: stamp(-10), is_deleted: 0,
    });
    bump('invoices');
  }

  // ── PAYMENTS — incl. a public pay link to audit /pay/<token> ──────────────
  insert('payments', {
    id: 'demo-pay-01', workspace_id: WS, kind: 'invoice', ref_id: 'demo-inv-01',
    lead_id: 'demo-lead-05', amount: 2600, currency: 'USD', currency_symbol: '$',
    description: 'DEMO · Wedding coverage — paid in full',
    status: 'paid', provider: 'manual', created_by: UID,
    created_at: stamp(-5), paid_at: stamp(-5),
  });
  insert('payments', {
    id: 'demo-pay-02', workspace_id: WS, kind: 'invoice', ref_id: 'demo-inv-02',
    lead_id: 'demo-lead-06', amount: 1400, currency: 'USD', currency_symbol: '$',
    description: 'DEMO · Balance due',
    status: 'pending', provider: 'manual', public_token: 'demopaytoken00000000000000000001',
    created_by: UID, created_at: stamp(-2),
  });
  bump('payments', 2);

  // ── CONTRACTS — draft / sent / signed ─────────────────────────────────────
  const blocks = (title, amount) => JSON.stringify([
    { type: 'heading', data: { text: title } },
    { type: 'text', data: { text: 'This is DEMO content for visual QA. It is not a real agreement and carries no legal effect.' } },
    { type: 'pricing_table', data: { currency: 'USD', rows: [{ name: 'Coverage', price: amount }] } },
  ]);
  const DOCS = [
    { id: 'demo-doc-01', lead: 'demo-lead-03', title: 'DEMO · Wedding Coverage Agreement', status: 'draft',     amount: 2600, tok: null },
    { id: 'demo-doc-02', lead: 'demo-lead-04', title: 'DEMO · Two-Day Package Agreement',  status: 'sent',      amount: 3200, tok: 'demosigntoken000000000000000001' },
    { id: 'demo-doc-03', lead: 'demo-lead-05', title: 'DEMO · Signed Wedding Agreement',   status: 'signed',    amount: 2600, tok: 'demosigntoken000000000000000002' },
  ];
  for (const d of DOCS) {
    insert('cs_documents', {
      id: d.id, workspace_id: WS, lead_id: d.lead, type: 'contract',
      title: d.title, status: d.status, blocks: blocks(d.title, d.amount),
      theme: 'classic', settings: '{}',
      totals: JSON.stringify({ currency: 'USD', total: d.amount }),
      token: d.tok, version: 1, created_by: UID,
      sent_at: d.status !== 'draft' ? stamp(-6) : null,
      viewed_at: d.status !== 'draft' ? stamp(-5) : null,
      completed_at: d.status === 'signed' ? stamp(-4) : null,
      created_at: stamp(-7), updated_at: stamp(-4), is_deleted: 0,
    });
    bump('cs_documents');
  }

  // ── BOOKINGS — past, today and upcoming ───────────────────────────────────
  const BOOKINGS = [
    { id: 'demo-bk-01', lead: 'demo-lead-05', service: 'DEMO · Wedding — day one', d: -6,   status: 'completed' },
    { id: 'demo-bk-02', lead: 'demo-lead-06', service: 'DEMO · Engagement session', d: 0.2, status: 'confirmed' },
    { id: 'demo-bk-03', lead: 'demo-lead-04', service: 'DEMO · Pre-wedding consult', d: 3,  status: 'confirmed' },
    { id: 'demo-bk-04', lead: 'demo-lead-03', service: 'DEMO · Studio portrait',     d: 9,  status: 'pending'   },
  ];
  for (const b of BOOKINGS) {
    insert('bookings', {
      id: b.id, workspace_id: WS, lead_id: b.lead, service: b.service,
      start_at: iso(b.d), duration_min: 120,
      name: 'DEMO client', phone: '+15550100', email: 'demo@example.test',
      notes: 'Demo booking — safe to delete.', status: b.status,
      token: `demobk${b.id.slice(-2)}token00000000000000`,
      created_at: stamp(-9), is_deleted: 0,
    });
    bump('bookings');
  }

  // ── MEDIA STUDIO — project + published gallery using REAL assets ──────────
  insert('ms_projects', {
    id: 'demo-proj-01', workspace_id: WS, lead_id: 'demo-lead-05',
    title: 'DEMO · Mei & Partner Wedding', project_type: 'wedding',
    shoot_date: stamp(-6), location: 'Demo Hall', status: 'delivered',
    settings: '{}', created_by: UID, created_at: stamp(-20), updated_at: stamp(-4),
  });
  bump('ms_projects');

  insert('ms_galleries', {
    id: 'demo-gal-01', workspace_id: WS, project_id: 'demo-proj-01', lead_id: 'demo-lead-05',
    title: 'DEMO · Mei & Partner — Final Gallery',
    visibility: 'link', share_token: 'demogallerytoken0000000000000001',
    status: 'published', version: 1,
    settings: JSON.stringify({ allow_download: true, allow_favourites: true, allow_comments: true }),
    published_at: stamp(-4), created_by: UID, created_at: stamp(-5),
  });
  bump('ms_galleries');

  // Real photos from the library — a demo gallery of broken images tests nothing.
  const photos = db.prepare("SELECT id FROM ms_assets WHERE type = 'photo' AND deleted_at IS NULL LIMIT 12").all();
  photos.forEach((a, i) => {
    try {
      db.prepare('INSERT OR REPLACE INTO ms_gallery_assets (gallery_id, asset_id, sort_order, is_hidden) VALUES (?,?,?,0)')
        .run('demo-gal-01', a.id, i);
      bump('gallery photos');
    } catch {}
  });

  // ── PRINT STORE — products + one order ────────────────────────────────────
  const PRODUCTS = [
    { id: 'demo-prod-01', name: 'DEMO · Fine art print', kind: 'print', desc: 'Giclée on cotton rag', opts: [{ label: '8×10', price: 35 }, { label: '16×20', price: 85 }] },
    { id: 'demo-prod-02', name: 'DEMO · Layflat album',  kind: 'album', desc: '30 spreads, leather bound', opts: [{ label: '10×10', price: 450 }] },
    { id: 'demo-prod-03', name: 'DEMO · Digital bundle', kind: 'digital', desc: 'Full-resolution downloads', opts: [{ label: 'Full gallery', price: 250 }] },
  ];
  PRODUCTS.forEach((p, i) => {
    insert('ms_print_products', {
      id: p.id, workspace_id: WS, name: p.name, kind: p.kind, description: p.desc,
      options: JSON.stringify(p.opts), active: 1, sort_order: i, created_at: stamp(-15),
    });
    bump('store products');
  });

  insert('ms_print_orders', {
    id: 'demo-order-01', workspace_id: WS, gallery_id: 'demo-gal-01', lead_id: 'demo-lead-05',
    items: JSON.stringify([{ product: 'DEMO · Fine art print', option: '16×20', qty: 2, price: 85 }]),
    total: 170, currency_symbol: '$',
    customer_name: 'DEMO · Mei Lin', customer_phone: '+15550104', customer_email: 'demo@example.test',
    note: 'Demo order — safe to delete.', status: 'pending', created_at: stamp(-3),
  });
  bump('store orders');

  // ── KNOWLEDGE ─────────────────────────────────────────────────────────────
  insert('knowledge_documents', {
    id: 'demo-kb-01', workspace_id: WS, document_name: 'DEMO · Pricing & policies',
    file_path: '', file_type: 'text',
    extracted_text: 'DEMO knowledge entry. Half day $700. Full day $1,400. Two-day wedding $2,600. Deposit 30%. Albums 4–6 weeks.',
    memory_count: 3, processed: 1, uploaded_at: stamp(-12),
  });
  bump('knowledge docs');

  // ── BOOKING PAGE — publish a slug so /book/<slug> can be audited ──────────
  try {
    insert('booking_settings', {
      workspace_id: WS, slug: 'demo-studio',
      settings: JSON.stringify({
        services: [
          // The public page reads `duration` (book/[slug] renders `{s.duration} min`);
          // `duration_min` rendered a bare "min" with no number.
          { name: 'DEMO · Consultation', duration: 30, price: 0, is_shoot: false },
          { name: 'DEMO · Portrait session', duration: 90, price: 150, is_shoot: true },
        ],
        hours: { mon: [9, 17], tue: [9, 17], wed: [9, 17], thu: [9, 17], fri: [9, 17] },
        buffer_min: 15, timezone: 'Asia/Karachi',
      }),
      updated_at: stamp(0),
    });
    bump('booking page');
  } catch (e) { console.log('  !  booking_settings: ' + e.message.slice(0, 70)); }

  // ── PORTFOLIO — publish it AND give it work to show ───────────────────────
  // Publishing alone rendered "Coming soon.", because the portfolio had no items
  // and so proved nothing about how the page actually looks with a body of work.
  try {
    const pf = db.prepare('SELECT id, handle FROM ms_portfolios WHERE workspace_id = ? LIMIT 1').get(WS);
    if (pf) {
      db.prepare('UPDATE ms_portfolios SET is_public = 1 WHERE id = ?').run(pf.id);
      const shots = db.prepare("SELECT id, storage_key, variants FROM ms_assets WHERE type = 'photo' AND deleted_at IS NULL LIMIT 9").all();
      shots.forEach((a, i) => {
        insert('ms_portfolio_items', {
          id: `demo-pfi-${String(i + 1).padStart(2, '0')}`,
          workspace_id: WS, portfolio_id: pf.id, asset_id: a.id,
          storage_key: a.storage_key, variants: a.variants,
          kind: 'photo', source: 'manual', gallery_id: 'demo-gal-01',
          title: `DEMO · Selected work ${i + 1}`,
          caption: 'Demo portfolio item — safe to delete.',
          featured: i === 0 ? 1 : 0, sort_order: i, created_at: stamp(-10),
        });
        bump('portfolio items');
      });
      console.log(`  ↑ portfolio /folio/${pf.handle} published with ${shots.length} item(s)`);
    }
  } catch (e) { console.log('  !  portfolio: ' + e.message.slice(0, 70)); }

  console.log('\nSeeded:');
  for (const [k, v] of Object.entries(made)) console.log(`  + ${String(v).padStart(3)}  ${k}`);
}

function urls() {
  const pf = db.prepare('SELECT handle FROM ms_portfolios WHERE workspace_id = ? LIMIT 1').get(WS);
  const g = db.prepare("SELECT share_token FROM ms_galleries WHERE id = 'demo-gal-01'").get();
  const p = db.prepare("SELECT public_token FROM payments WHERE id = 'demo-pay-02'").get();
  const b = db.prepare("SELECT token FROM bookings WHERE id = 'demo-bk-03'").get();
  const d = db.prepare("SELECT token FROM cs_documents WHERE id = 'demo-doc-02'").get();
  console.log('\nPublic surfaces to audit:');
  if (g) console.log(`  gallery   ${BASE}/g/${g.share_token}`);
  if (g) console.log(`  shop      ${BASE}/shop/${g.share_token}`);
  if (p) console.log(`  payment   ${BASE}/pay/${p.public_token}`);
  if (d) console.log(`  contract  ${BASE}/d/${d.token}`);
  if (b) console.log(`  booking-manage ${BASE}/booking/manage/${b.token}`);
  console.log(`  booking-page   ${BASE}/book/demo-studio`);
  if (pf) console.log(`  portfolio ${BASE}/folio/${pf.handle}`);
}

const arg = process.argv[2];
if (arg === '--clean') { console.log('Removing demo data…'); clean(); }
else if (arg === '--urls') { urls(); }
else { console.log(`Seeding demo data into workspace ${WS}…`); seed(); urls(); }
db.close();
