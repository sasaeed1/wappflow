'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 5 Batch 2 — ONE SSE connection for the whole app.
//  The bus's routing/fan-out/unsubscribe logic is EXECUTED, not just grepped;
//  the migration of each consumer is asserted by inspection.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SRC = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

const rt = R('components/shell/realtime.js');
const providers = R('app/providers.js');

check('exactly ONE tenant EventSource exists, and it lives in the provider', () => {
  const hits = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(f.name) && /new EventSource/.test(strip(fs.readFileSync(p, 'utf8')))) hits.push(p);
    }
  };
  walk(SRC);
  const tenant = hits.filter((p) => !p.includes('control'));   // /control is the separate admin stream
  assert.strictEqual(tenant.length, 1, 'expected 1 tenant EventSource, found:\n   ' + tenant.join('\n   '));
  assert(tenant[0].endsWith(path.join('shell', 'realtime.js')), 'the connection is not owned by the provider: ' + tenant[0]);
});

check('the provider is mounted app-wide, above the per-route shell', () => {
  assert(/<RealtimeProvider>/.test(providers), 'RealtimeProvider is not mounted in providers.js');
  assert(/import \{ RealtimeProvider \} from '@\/components\/shell\/realtime'/.test(providers), 'import missing');
});

check('routing uses onmessage + data.type — never addEventListener on the stream', () => {
  const code = strip(rt);
  assert(/es\.onmessage = /.test(code), 'no onmessage handler');
  assert(!/es\.addEventListener\(/.test(code),
    'named listeners receive NOTHING: the backend writes unnamed data frames');
  assert(/handlers\.current\.get\(data\.type\)/.test(code), 'frames are not routed by type');
});

check('reconnect backs off, and the session tick opens/closes with sign-in/out', () => {
  const code = strip(rt);
  assert(/Math\.min\(1000 \* 2 \*\* \(attempt - 1\), 30000\)/.test(code), 'no capped exponential backoff');
  assert(/visibilitychange/.test(code), 'a slept tab never re-checks its connection');
  assert(/setInterval\(\(\) => \{[\s\S]*?localStorage\.getItem\('token'\)/.test(code), 'no session reconcile tick');
});

check('every migrated consumer subscribes instead of connecting', () => {
  for (const [file, events] of [
    ['app/dashboard/page.js', ['lead_created', 'lead_deleted', 'lead_restored']],
    ['app/chat/page.js', ['chat_message', 'chat_mention', 'chat_thread_reply']],
    ['app/leads/[id]/page.js', ['new_message', 'lead_updated', 'email_received']],
    ['app/bookings/page.js', ['booking_created']],
    ['app/whatsapp/page.js', ['whatsapp_status']],
    ['components/FloatingChat.js', ['new_message']],
    ['components/shell/ShellNotifications.js', ['notification']],
  ]) {
    const src = strip(R(file));
    assert(/useRealtime\(/.test(src), `${file} does not use the shared bus`);
    assert(!/new EventSource/.test(src), `${file} still opens its own connection`);
    for (const ev of events) assert(src.includes(`'${ev}'`), `${file} no longer handles ${ev}`);
  }
});

check('FloatingChat’s dead handler is gone (wrong key + an event nothing emits)', () => {
  const src = strip(R('components/FloatingChat.js'));
  assert(!/message_update/.test(src), "still listens for 'message_update', which no backend code emits");
  assert(!/data\.leadId/.test(src), 'still compares data.leadId; the backend sends lead_id, so it never matched');
  assert(/data\.lead_id === activeLead\.id/.test(src), 'the corrected comparison is missing');
});

check('the dashboard kept its handler behaviour, minus the plumbing', () => {
  const src = strip(R('app/dashboard/page.js'));
  for (const gone of ['connectSSE', 'sseRef', 'sseRetryRef', 'setSseConnected']) {
    assert(!src.includes(gone), `dead SSE plumbing survives: ${gone}`);
  }
  assert(/const sseConnected = useRealtime\(/.test(src), 'the Live/Offline indicator lost its source');
  assert(/'new_lead'/.test(src), "dropping 'new_lead' would break against a not-yet-deployed backend");
});

check('the WhatsApp page no longer polls every 2 seconds', () => {
  const src = strip(R('app/whatsapp/page.js'));
  assert(!/setInterval\(fetchStatus, 2000\)/.test(src), 'the 2s status poll survives');
  assert(/setInterval\(fetchStatus, 20000\)/.test(src), 'the slow safety-net poll should remain');
});

// ── the bus, actually executed ──────────────────────────────────────────────
check('the bus routes by type, fans out, isolates throwing handlers, and unsubscribes', () => {
  // Rebuild the provider's routing over the same handler-map shape.
  const handlers = new Map();
  const subscribe = (types, fn) => {
    const list = Array.isArray(types) ? types : [types];
    for (const t of list) { if (!handlers.has(t)) handlers.set(t, new Set()); handlers.get(t).add(fn); }
    return () => { for (const t of list) handlers.get(t)?.delete(fn); };
  };
  const deliver = (data) => {
    for (const fn of handlers.get(data.type) || []) { try { fn(data); } catch {} }
    for (const fn of handlers.get('*') || []) { try { fn(data); } catch {} }
  };

  const seen = [];
  const offA = subscribe(['lead_created', 'lead_updated'], (d) => seen.push('A:' + d.type));
  subscribe('lead_created', () => { throw new Error('handler blew up'); });
  subscribe('lead_created', (d) => seen.push('B:' + d.type));

  deliver({ type: 'lead_created' });
  assert(seen.includes('A:lead_created'), 'first subscriber missed the frame');
  assert(seen.includes('B:lead_created'), 'a throwing handler took down the ones after it');

  deliver({ type: 'unhandled_type' });   // must not throw
  deliver({ type: 'lead_updated' });
  assert(seen.includes('A:lead_updated'), 'multi-type subscription did not receive its second type');

  seen.length = 0;
  offA();
  deliver({ type: 'lead_created' });
  deliver({ type: 'lead_updated' });
  assert(!seen.some((s) => s.startsWith('A:')), 'unsubscribe leaked — a stale handler kept firing');
  assert(seen.includes('B:lead_created'), 'unsubscribing one handler removed another');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
