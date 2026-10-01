'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  WhatsApp conversation events — regression test (PROP-004).
//
//  Until these existed the CRM only heard about INBOUND messages. This pins the
//  rest of the conversation, with the real handlers running against a real
//  SQLite database and a fake whatsapp-web.js Client that emits the same event
//  shapes the library does:
//
//    · replies typed on the phone land on the lead (and WappFlow's own sends are
//      linked to WhatsApp's id instead of duplicated)
//    · locations, contact cards and polls are kept, not dropped
//    · delivery / read ticks, only ever moving forward
//    · LID senders: same person → same lead; real number used when WhatsApp
//      reveals it
//    · replies (quoted messages), reactions, edits, "deleted for everyone"
//    · incoming WhatsApp calls are recorded and notified
//    · link-with-phone-number pairing codes
//
//  Run:  node test-whatsapp-events.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-events-'));

// Swap the library's Client for a fake BEFORE the service destructures it.
const wweb = require('whatsapp-web.js');
class FakeClient extends EventEmitter {
  constructor() { super(); this.sent = []; this.pupPage = {}; this.lidMap = {}; this.messages = {}; this.pairCalls = []; }
  initialize() { return Promise.resolve(); }
  async sendMessage(chatId, body, options) { this.sent.push({ chatId, body, options }); return { id: { _serialized: `true_${chatId}_SENT${this.sent.length}` } }; }
  async getContactLidAndPhone(ids) { return ids.map(id => ({ lid: id, pn: this.lidMap[id] })); }
  async getMessageById(id) { return this.messages[id] || null; }
  async requestPairingCode(phone, notify) { this.pairCalls.push({ phone, notify }); return 'ABCD1234'; }
}
wweb.Client = FakeClient;
wweb.LocalAuth = class {};

const Database = require('better-sqlite3');
const { WhatsAppService, waSpecialContent, parseVcard, phoneFromJid } = require('./whatsapp-service.js');
// initialize() tidies lock files under ./.wwebjs_auth — never let a test touch a real session folder.
process.chdir(process.env.DATA_DIR);

let pass = 0, fail = 0;
const results = [];
const check = async (n, fn) => {
  try { await fn(); results.push(`  ✓ ${n}`); pass++; }
  catch (e) { results.push(`  ✗ ${n} — ${e.message}`); fail++; }
};

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY);
    CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE platform_accounts (id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT, phone_number TEXT, last_connected_at TEXT);
    CREATE TABLE leads (id TEXT PRIMARY KEY, user_id TEXT, workspace_id TEXT, customer_name TEXT, customer_phone TEXT,
      wa_username TEXT, wa_lid TEXT, first_message TEXT, total_messages INTEGER DEFAULT 0, status TEXT,
      platform_source TEXT, platform_account_id TEXT, is_deleted INTEGER DEFAULT 0,
      last_message_at TEXT, last_contacted_at TEXT, ai_score INTEGER);
    CREATE TABLE messages (id TEXT PRIMARY KEY, lead_id TEXT, user_id TEXT, body TEXT, from_me INTEGER DEFAULT 0,
      media_url TEXT, media_type TEXT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP, wa_message_id TEXT, platform TEXT,
      platform_account_id TEXT, ack INTEGER, quoted_wa_id TEXT, quoted_body TEXT, reactions TEXT, edited_at TEXT,
      original_body TEXT, deleted_at TEXT, meta TEXT);
    CREATE TABLE auto_reply_rules (id TEXT, user_id TEXT, is_active INTEGER);
    INSERT INTO workspaces VALUES ('ws1');
    INSERT INTO users (id, workspace_id) VALUES ('u1', 'ws1');
  `);
  return db;
}

function makeService() {
  const db = freshDb();
  const events = [], notes = [];
  const svc = new WhatsAppService(db, () => {}, null, undefined, (ws, type, data) => events.push({ type, data }), (ws, n) => notes.push(n));
  svc._outgoingSettleMs = 0;
  svc._maybeAutoAnalyze = () => {};
  svc.initialize();                         // registers every listener on the FakeClient
  svc._stopInitWatchdog();
  svc.isReady = true;
  return { svc, db, client: svc.client, events, notes };
}

const lead = (db, id, phone, extra = {}) => db.prepare(
  `INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, wa_lid, status) VALUES (?, 'u1', 'ws1', ?, ?, ?, 'New')`
).run(id, extra.name || 'Client', phone, extra.lid || null);
const msgs = (db, leadId) => db.prepare('SELECT * FROM messages WHERE lead_id = ? ORDER BY rowid').all(leadId);
const emit = async (client, event, ...args) => { client.emit(event, ...args); await new Promise(r => setTimeout(r, 30)); };
const id = (fromMe, remote, k) => ({ fromMe, remote, id: k, _serialized: `${fromMe}_${remote}_${k}` });
const inbound = (from, k, extra = {}) => ({
  from, to: 'me@c.us', fromMe: false, id: id(false, from, k), body: '', hasMedia: false, type: 'chat',
  timestamp: Math.floor(Date.now() / 1000),
  getContact: async () => (extra.contact || { id: { _serialized: from, user: from.split('@')[0] }, number: from.split('@')[0], pushname: 'Ayesha' }),
  ...extra,
});

(async () => {
  console.log('\n[1] Content that has no text and no file');
  await check('a location becomes a readable body + a map link', () => {
    const r = waSpecialContent({ type: 'location', location: { latitude: 31.52, longitude: 74.35, name: 'Pearl Continental', address: 'Lahore' } });
    assert.strictEqual(r.body, '📍 Pearl Continental — Lahore');
    assert.strictEqual(r.meta.location.url, 'https://maps.google.com/?q=31.52,74.35');
  });
  await check('a contact card keeps name and number', () => {
    const v = 'BEGIN:VCARD\nVERSION:3.0\nFN:Bilal Khan\nitem1.TEL;waid=923001234567:+92 300 1234567\nEND:VCARD';
    assert.deepStrictEqual(parseVcard(v), { name: 'Bilal Khan', phones: ['+92 300 1234567'] });
    assert.strictEqual(waSpecialContent({ type: 'vcard', body: v }).body, '👤 Bilal Khan · +92 300 1234567');
  });
  await check('a poll keeps its question and options', () => {
    const r = waSpecialContent({ type: 'poll_creation', pollName: 'Which package?', pollOptions: [{ name: 'Silver' }, { name: 'Gold' }] });
    assert.strictEqual(r.body, '📊 Which package?');
    assert.deepStrictEqual(r.meta.poll.options, ['Silver', 'Gold']);
  });
  await check('an inbound location is stored (it used to be dropped as "empty")', async () => {
    const { db, client } = makeService();
    await emit(client, 'message', inbound('923001112222@c.us', 'LOC1', { type: 'location', location: { latitude: 1, longitude: 2, description: 'Venue' } }));
    const l = db.prepare('SELECT * FROM leads').get();
    assert(l, 'no lead was created');
    const m = msgs(db, l.id)[0];
    assert(m && m.body === '📍 Venue', `stored body: ${m && m.body}`);
    assert.strictEqual(JSON.parse(m.meta).location.lat, 1);
  });

  console.log('\n[2] Replies typed on the phone (message_create)');
  await check('a reply sent from the phone lands on the lead as an outgoing message', async () => {
    const { db, client, events } = makeService();
    lead(db, 'L1', '+923001112222');
    await emit(client, 'message_create', { fromMe: true, to: '923001112222@c.us', id: id(true, '923001112222@c.us', 'P1'), body: 'Sure, Saturday works', hasMedia: false, type: 'chat', ack: 1 });
    const m = msgs(db, 'L1');
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].from_me, 1);
    assert.strictEqual(m[0].body, 'Sure, Saturday works');
    assert.strictEqual(m[0].ack, 1);
    assert(events.some(e => e.type === 'new_message'), 'open threads were not told');
  });
  await check("WappFlow's own send is LINKED to WhatsApp's id, not duplicated", async () => {
    const { db, client } = makeService();
    lead(db, 'L1', '+923001112222');
    db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, platform) VALUES ('M1', 'L1', 'u1', 'Your gallery is ready', 1, 'whatsapp')`).run();
    await emit(client, 'message_create', { fromMe: true, to: '923001112222@c.us', id: id(true, '923001112222@c.us', 'W1'), body: 'Your gallery is ready', hasMedia: false, type: 'chat', ack: 1 });
    const m = msgs(db, 'L1');
    assert.strictEqual(m.length, 1, `rows: ${m.length}`);
    assert.strictEqual(m[0].wa_message_id, 'true_923001112222@c.us_W1');
  });
  await check('a personal chat that is not a lead is ignored', async () => {
    const { db, client } = makeService();
    await emit(client, 'message_create', { fromMe: true, to: '923009999999@c.us', id: id(true, '923009999999@c.us', 'X'), body: 'hi mum', hasMedia: false, type: 'chat' });
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM messages').get().c, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM leads').get().c, 0);
  });
  await check('group chats are ignored', async () => {
    const { db, client } = makeService();
    await emit(client, 'message_create', { fromMe: true, to: '1203630@g.us', id: id(true, '1203630@g.us', 'G'), body: 'team', hasMedia: false, type: 'chat' });
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM messages').get().c, 0);
  });

  console.log('\n[3] Delivery and read ticks');
  await check('ticks move forward and never back', async () => {
    const { db, client } = makeService();
    lead(db, 'L1', '+923001112222');
    db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, from_me, wa_message_id, ack) VALUES ('M1', 'L1', 'u1', 'hi', 1, 'K1', 1)`).run();
    await emit(client, 'message_ack', { id: { _serialized: 'K1' } }, 3);
    assert.strictEqual(msgs(db, 'L1')[0].ack, 3);
    await emit(client, 'message_ack', { id: { _serialized: 'K1' } }, 2);
    assert.strictEqual(msgs(db, 'L1')[0].ack, 3, 'read regressed to delivered');
  });
  await check('a tick that arrives before its row is applied when the row appears', async () => {
    const { db, client } = makeService();
    lead(db, 'L1', '+923001112222');
    await emit(client, 'message_ack', { id: { _serialized: 'true_923001112222@c.us_EARLY' } }, 2);
    await emit(client, 'message_create', { fromMe: true, to: '923001112222@c.us', id: id(true, '923001112222@c.us', 'EARLY'), body: 'hello', hasMedia: false, type: 'chat', ack: 1 });
    assert.strictEqual(msgs(db, 'L1')[0].ack, 2);
  });
  await check('sendMessage returns the WhatsApp id and passes reply options through', async () => {
    const { svc, client } = makeService();
    const key = await svc.sendMessage('+92 300 1112222', 'hi', { quotedMessageId: 'Q1' });
    assert.strictEqual(key, 'true_923001112222@c.us_SENT1');
    assert.deepStrictEqual(client.sent[0].options, { quotedMessageId: 'Q1' });
  });

  console.log('\n[4] Hidden numbers (LIDs)');
  await check('phoneFromJid only accepts real numbers', () => {
    assert.strictEqual(phoneFromJid('923001112222@c.us'), '+923001112222');
    assert.strictEqual(phoneFromJid('123456789012345@lid'), null);
  });
  await check('a LID sender gets their real number when WhatsApp can resolve it', async () => {
    const { db, client } = makeService();
    client.lidMap['555@lid'] = '923004445555@c.us';
    await emit(client, 'message', inbound('555@lid', 'L1M', { body: 'Hi', type: 'chat', contact: { id: { _serialized: '555@lid', user: '555' }, number: '', pushname: 'Sara' } }));
    const l = db.prepare('SELECT * FROM leads').get();
    assert.strictEqual(l.customer_phone, '+923004445555');
    assert.strictEqual(l.wa_lid, '555@lid');
  });
  await check('the same LID always lands on the same lead', async () => {
    const { db, client } = makeService();
    const c = { id: { _serialized: '777@lid', user: '777' }, number: '', pushname: 'Zara' };
    await emit(client, 'message', inbound('777@lid', 'A', { body: 'one', contact: c }));
    await emit(client, 'message', inbound('777@lid', 'B', { body: 'two', contact: c }));
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM leads').get().c, 1);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM messages').get().c, 2);
  });
  await check('a lead stored with its LID as "phone" is upgraded once the number is known', async () => {
    const { db, client } = makeService();
    lead(db, 'L1', '888@lid', { lid: '888@lid' });
    client.lidMap['888@lid'] = '923007778888@c.us';
    await emit(client, 'message', inbound('888@lid', 'C', { body: 'hello again', contact: { id: { _serialized: '888@lid', user: '888' }, number: '', pushname: 'N' } }));
    assert.strictEqual(db.prepare("SELECT customer_phone FROM leads WHERE id='L1'").get().customer_phone, '+923007778888');
  });

  console.log('\n[5–7] Replies, reactions, edits, deletions');
  await check('an inbound reply records which message it quotes', async () => {
    const { db, client } = makeService();
    const q = { id: id(true, '923001112222@c.us', 'ORIG'), body: 'Gold package is Rs 150k', hasMedia: false, type: 'chat' };
    await emit(client, 'message', inbound('923001112222@c.us', 'R1', { body: 'Is that final?', hasQuotedMsg: true, getQuotedMessage: async () => q }));
    const m = db.prepare('SELECT * FROM messages').get();
    assert.strictEqual(m.quoted_wa_id, 'true_923001112222@c.us_ORIG');
    assert.strictEqual(m.quoted_body, 'Gold package is Rs 150k');
  });
  await check('reactions from either side are stored, and removing one clears it', async () => {
    const { db, client } = makeService();
    lead(db, 'L1', '+923001112222');
    db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, wa_message_id) VALUES ('M1', 'L1', 'u1', 'hi', 'K1')`).run();
    await emit(client, 'message_reaction', { msgId: { _serialized: 'K1' }, reaction: '👍', id: { fromMe: false } });
    await emit(client, 'message_reaction', { msgId: { _serialized: 'K1' }, reaction: '❤️', id: { fromMe: true } });
    assert.deepStrictEqual(JSON.parse(msgs(db, 'L1')[0].reactions), { them: '👍', me: '❤️' });
    await emit(client, 'message_reaction', { msgId: { _serialized: 'K1' }, reaction: '', id: { fromMe: false } });
    assert.deepStrictEqual(JSON.parse(msgs(db, 'L1')[0].reactions), { me: '❤️' });
  });
  await check('an edit shows the new text and keeps the first version', async () => {
    const { db, client } = makeService();
    lead(db, 'L1', '+923001112222');
    db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, wa_message_id) VALUES ('M1', 'L1', 'u1', 'budget 100k', 'K1')`).run();
    await emit(client, 'message_edit', { id: { _serialized: 'K1' } }, 'budget 80k', 'budget 100k');
    await emit(client, 'message_edit', { id: { _serialized: 'K1' } }, 'budget 70k', 'budget 80k');
    const m = msgs(db, 'L1')[0];
    assert.strictEqual(m.body, 'budget 70k');
    assert.strictEqual(m.original_body, 'budget 100k');
    assert(m.edited_at);
  });
  await check('"deleted for everyone" is marked but the text is kept', async () => {
    const { db, client } = makeService();
    lead(db, 'L1', '+923001112222');
    db.prepare(`INSERT INTO messages (id, lead_id, user_id, body, wa_message_id) VALUES ('M1', 'L1', 'u1', 'my CNIC is…', 'K1')`).run();
    await emit(client, 'message_revoke_everyone', { id: { _serialized: 'REVOKE' }, type: 'revoked' }, { id: { _serialized: 'K1' } });
    const m = msgs(db, 'L1')[0];
    assert(m.deleted_at, 'not marked deleted');
    assert.strictEqual(m.body, 'my CNIC is…');
  });
  await check('reacting from WappFlow reaches the WhatsApp message', async () => {
    const { svc, client } = makeService();
    let reacted = null;
    client.messages.K1 = { react: async (e) => { reacted = e; } };
    await svc.react('K1', '🙏');
    assert.strictEqual(reacted, '🙏');
  });

  console.log('\n[8] Link with phone number');
  await check('a pairing code is requested with digits only', async () => {
    const { svc, client } = makeService();
    svc.isReady = false;
    const code = await svc.requestPairingCode('+92 300-1112222');
    assert.strictEqual(code, 'ABCD1234');
    assert.strictEqual(client.pairCalls[0].phone, '923001112222');
  });
  await check('pairing is refused when already connected or the number is incomplete', async () => {
    const { svc } = makeService();
    await assert.rejects(() => svc.requestPairingCode('923001112222'), /already connected/);
    svc.isReady = false;
    await assert.rejects(() => svc.requestPairingCode('12345'), /country code/);
  });

  console.log('\n[9] WhatsApp calls');
  await check('a call from a known lead lands on their thread and notifies', async () => {
    const { db, client, notes } = makeService();
    lead(db, 'L1', '+923001112222', { name: 'Ayesha' });
    await emit(client, 'call', { id: 'CALL1', from: '923001112222@c.us', isVideo: false, isGroup: false, fromMe: false });
    await emit(client, 'call', { id: 'CALL1', from: '923001112222@c.us', isVideo: false, isGroup: false, fromMe: false });
    const m = msgs(db, 'L1');
    assert.strictEqual(m.length, 1, 'duplicate call offer recorded twice');
    assert.strictEqual(m[0].body, '📞 Incoming WhatsApp voice call');
    assert(notes.some(n => n.type === 'call' && /Ayesha called you/.test(n.title)));
  });
  await check('a call from an unknown number creates the lead', async () => {
    const { db, client } = makeService();
    await emit(client, 'call', { id: 'CALL2', from: '923006667777@c.us', isVideo: true, isGroup: false, fromMe: false });
    const l = db.prepare('SELECT * FROM leads').get();
    assert(l && l.customer_phone === '+923006667777');
    assert.strictEqual(msgs(db, l.id)[0].body, '📞 Incoming WhatsApp video call');
  });

  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
