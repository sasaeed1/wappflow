// Instagram / Facebook replies (PROP-006) against a stubbed Meta Send API.
//   node test-meta-send.js
const { sendMetaText } = require('./meta-send');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const account = { credentials: JSON.stringify({ access_token: 'PAGE_TOKEN', app_secret: 'x' }) };

(async () => {
  console.log('\n[1] A reply goes to Meta with the page token');
  let seen = null;
  let r = await sendMetaText({ account, recipientId: '17841400000000', text: 'Hi Lea, yes the 14th is free.',
    fetchImpl: async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ recipient_id: '17841400000000', message_id: 'm_1' }) }; } });
  ok(r.delivered && r.id === 'm_1', 'delivered, with Meta’s message id');
  ok(/\/me\/messages\?access_token=PAGE_TOKEN$/.test(seen.url), 'uses the Send API with the page token');
  ok(seen.body.recipient.id === '17841400000000' && seen.body.message.text.startsWith('Hi Lea') && seen.body.messaging_type === 'RESPONSE', 'to the sender, as a response');

  console.log('\n[2] Refusals are explained, never hidden');
  const refuse = (error) => async () => ({ ok: false, status: 400, json: async () => ({ error }) });
  r = await sendMetaText({ account, recipientId: '1', text: 'x', fetchImpl: refuse({ code: 10, error_subcode: 2018278, message: 'outside of allowed window' }) });
  ok(!r.delivered && /24 hours/.test(r.error), 'outside the 24-hour window → says so');
  r = await sendMetaText({ account, recipientId: '1', text: 'x', fetchImpl: refuse({ code: 190, message: 'Error validating access token' }) });
  ok(!r.delivered && /expired/.test(r.error), 'expired token → reconnect the account');
  r = await sendMetaText({ account: { credentials: '{}' }, recipientId: '1', text: 'x', fetchImpl: async () => { throw new Error('should not call'); } });
  ok(!r.delivered && /access token/.test(r.error), 'no token → nothing is sent, and it says what is missing');
  r = await sendMetaText({ account, recipientId: '1', text: 'x', fetchImpl: async () => { throw new Error('ENOTFOUND'); } });
  ok(!r.delivered && /reach Meta/.test(r.error), 'network failure → plain explanation');

  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
