'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Chat bubbles (PROP-007): the per-user setting, and pushes for customer
//  messages when WappFlow is closed. Unit-level: a real in-memory database and
//  a fake push sender, so who-gets-what is checked exactly.
//    node test-chat-bubbles.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const Database = require('better-sqlite3');
const chatBubbles = require('./chat-bubbles');
const { previewOf } = chatBubbles;

let pass = 0;
const t = async (n, fn) => { await fn(); pass++; console.log('  ✓', n); };

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT);
  CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT, customer_phone TEXT, assigned_to TEXT);
  INSERT INTO users (id, email) VALUES ('owner','o@x'), ('agent','a@x'), ('quiet','q@x'), ('other','z@x');
  INSERT INTO leads VALUES ('L1','W','Ayesha Khan','+923001112233','agent'), ('L2','W','Bilal','+923004445566',NULL), ('L9','W2','Other studio',NULL,NULL);
`);
const safeAlter = (sql) => { try { db.exec(sql); } catch {} };
const routes = {};
const app = { get: (p, _a, h) => (routes['GET ' + p] = h), put: (p, _a, h) => (routes['PUT ' + p] = h) };
const sent = [];
const members = { W: ['owner', 'agent', 'quiet'], W2: ['other'] };
const seesAll = { owner: true, agent: false, quiet: true, other: true };
const api = chatBubbles(app, db, {
  auth: () => {}, safeAlter,
  sendPushToUser: async (uid, title, body, data) => { sent.push({ uid, title, body, data }); },
  workspaceMemberIds: (w) => members[w] || [],
  canMemberSeeLead: (_w, uid, lead) => seesAll[uid] || lead.assigned_to === uid,
});
const call = (key, userId, body) => {
  let out = { status: 200, body: null };
  const res = { status(s) { out.status = s; return res; }, json(b) { out.body = b; return out; } };
  routes[key]({ userId, body }, res);
  return out;
};
const msg = (lead, extra = {}) => ({ lead_id: lead, message: { lead_id: lead, from_me: 0, body: 'Is the 14th free for a wedding shoot?', ...extra } });

(async () => {
  await t('the setting defaults to on', () => assert.deepStrictEqual(call('GET /api/me/preferences', 'owner').body, { chat_bubbles: true }));
  await t('a member can turn it off for themselves only', () => {
    assert.deepStrictEqual(call('PUT /api/me/preferences', 'quiet', { chat_bubbles: false }).body, { chat_bubbles: false });
    assert.strictEqual(call('GET /api/me/preferences', 'quiet').body.chat_bubbles, false);
    assert.strictEqual(call('GET /api/me/preferences', 'owner').body.chat_bubbles, true);
  });
  await t('a value that is not on/off is refused in plain words', () => {
    const r = call('PUT /api/me/preferences', 'owner', { chat_bubbles: 'yes' });
    assert.strictEqual(r.status, 400); assert.match(r.body.error, /on or off/);
  });

  await t('a customer message notifies every member who can see the lead and has bubbles on', () => {
    sent.length = 0;
    api.onBroadcast('W', 'new_message', msg('L1'));
    assert.deepStrictEqual(sent.map((s) => s.uid).sort(), ['agent', 'owner']); // quiet turned it off
    const s = sent[0];
    assert.strictEqual(s.title, 'Ayesha Khan');
    assert.strictEqual(s.body, 'Is the 14th free for a wedding shoot?');
    assert.deepStrictEqual(s.data, { url: '/dashboard?bubble=L1', tag: 'wf-chat-L1', kind: 'chat', lead_id: 'L1' });
  });
  await t('a member who only sees their own leads is not told about others', () => {
    sent.length = 0;
    api.onBroadcast('W', 'new_message', msg('L2'));
    assert.deepStrictEqual(sent.map((s) => s.uid), ['owner']);
  });
  await t('a burst from one customer does not buzz again within 30 seconds', () => {
    sent.length = 0;
    api.onBroadcast('W', 'new_message', msg('L1'));
    assert.strictEqual(sent.length, 0);
  });
  await t("the studio's own messages and other events are ignored", () => {
    sent.length = 0;
    api.onBroadcast('W', 'new_message', msg('L2', { from_me: 1 }));
    api.onBroadcast('W', 'lead_updated', msg('L2'));
    api.onBroadcast('W', 'new_message', { lead_id: 'L2' });
    assert.strictEqual(sent.length, 0);
  });
  await t("a lead from another workspace never notifies this one", () => {
    sent.length = 0;
    api.onBroadcast('W', 'new_message', msg('L9'));
    assert.strictEqual(sent.length, 0);
  });
  await t('previews read like a phone notification', () => {
    assert.strictEqual(previewOf({ body: 'x'.repeat(200) }).length, 80);
    assert.strictEqual(previewOf({ body: '', media_type: 'image/jpeg', media_url: '/u/a.jpg' }), '📷 Photo');
    assert.strictEqual(previewOf({ body: '[image]', media_type: 'image' }), '📷 Photo');
    assert.strictEqual(previewOf({ body: '', media_type: 'audio/ogg' }), '🎤 Voice message');
    assert.strictEqual(previewOf({ body: '', media_url: '/u/x.bin' }), '📎 Attachment');
    assert.strictEqual(previewOf({}), 'New message');
  });
  console.log(`\n${pass}/9 passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
