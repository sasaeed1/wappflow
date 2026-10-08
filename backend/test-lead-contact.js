'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Adding a lead by WhatsApp, Instagram or Facebook (any one is enough), with
//  plain-language messages when the details are wrong.
//    DATA_DIR=<scratch> PORT=3025 node server.js &   then   node test-lead-contact.js
// ════════════════════════════════════════════════════════════════════════════
const C = require('./lead-contact');
const API = process.env.WF_API || 'http://127.0.0.1:3025/api';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const plain = (e) => typeof e === 'string' && /^[A-Z][^{}<>]*[.!]$/.test(e) && !/[A-Z_]{4,}|\b(400|500|SQLITE|undefined|null)\b/.test(e);

(async () => {
  console.log('\n[1] Rules');
  ok(C.normalizePhone('+44 7700 900-123').value === '+447700900123', 'phone cleaned to digits with +');
  ok(C.normalizePhone('0092 300 1234567').value === '+923001234567', '00 prefix becomes +');
  ok(plain(C.normalizePhone('12ab34').error), 'letters in a number → a sentence');
  ok(plain(C.normalizePhone('12345').error), 'too short → a sentence');
  ok(C.normalizeInstagram('https://www.instagram.com/Lumen.Studio/?igsh=x').value === 'lumen.studio', 'Instagram link → username');
  ok(C.normalizeInstagram('@lumen_studio').value === 'lumen_studio', '@username accepted');
  ok(plain(C.normalizeInstagram('not valid!!').error), 'bad Instagram username → a sentence');
  ok(C.normalizeFacebook('https://facebook.com/profile.php?id=1000123').value === 'id:1000123', 'Facebook profile id link');
  ok(C.normalizeFacebook('https://www.facebook.com/lumenstudio/').value === 'lumenstudio', 'Facebook page link');
  ok(C.normalizeFacebook('Sara Khan').value === 'Sara Khan', 'a plain name is fine');
  ok(plain(C.checkContact({}).error), 'nothing given → asks for at least one way to reach them');

  console.log('\n[2] Through the API');
  const reg = await (await fetch(API + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `lc-${Date.now()}@test.local`, password: 'pw123456', businessName: 'LC' }) })).json();
  const T = reg.token;
  const create = async (body) => { const r = await fetch(API + '/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T }, body: JSON.stringify(body) }); return { status: r.status, d: await r.json() }; };
  let r = await create({ customer_name: 'Insta Only', instagram: '@insta.only' });
  ok(r.status === 201 && r.d.platform_source === 'instagram' && !r.d.customer_phone, 'Instagram-only lead created');
  const instaId = r.d.id;
  r = await create({ customer_name: 'FB Only', facebook: 'facebook.com/fb.only' });
  ok(r.status === 201 && r.d.platform_source === 'facebook', 'Facebook-only lead created');
  r = await create({ customer_name: 'All three', customer_phone: '+44 7700 900555', instagram: 'all.three', facebook: 'All Three' });
  ok(r.status === 201 && r.d.customer_phone === '+447700900555' && r.d.platform_source === 'whatsapp', 'WhatsApp + Instagram + Facebook; phone cleaned');
  r = await create({ customer_name: 'Bad', customer_phone: '12ab' });
  ok(r.status === 400 && plain(r.d.error), `wrong WhatsApp number → "${r.d.error}"`);
  r = await create({ customer_name: 'Nothing' });
  ok(r.status === 400 && plain(r.d.error), `no contact → "${r.d.error}"`);
  r = await create({ customer_name: 'Dup', instagram: 'https://instagram.com/INSTA.ONLY' });
  ok(r.status === 400 && r.d.existing_id === instaId && plain(r.d.error), 'same Instagram again → points to the existing contact');
  r = await create({ customer_name: 'Dup phone', customer_phone: '+447700900555' });
  ok(r.status === 400 && r.d.existing_id && plain(r.d.error), 'same WhatsApp number again → points to the existing contact');
  const list = await (await fetch(API + '/leads?limit=50', { headers: { Authorization: 'Bearer ' + T } })).json();
  const rows = list.leads || list.data || list;
  ok(rows.find((l) => l.id === instaId)?.social_handle === '@insta.only', 'the leads list shows @insta.only for the Instagram-only lead');

  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
