'use strict';
// Desktop chat bubbles (PROP-007): the pure parts — reading the live stream,
// deciding when a bubble shows, window size and edge snapping.
//   node test-chat-bubble.js
const assert = require('assert');
const { parseSse, wantsBubble, sizeFor, snapToEdge, HEAD, MAX_HEADS } = require('./src/main/chat-bubble');
let pass = 0;
const t = (n, fn) => { fn(); pass++; console.log('  ✓', n); };

const msg = (extra = {}) => ({ type: 'new_message', lead_id: 'L1', message: { lead_id: 'L1', from_me: 0, body: 'hi', ...extra } });

t('reads unnamed SSE frames, keeping a partial frame for later', () => {
  const a = parseSse('data: {"type":"new_message","lead_id":"L1"}\n\ndata: {"type":"lead_upd');
  assert.deepStrictEqual(a.frames, [{ type: 'new_message', lead_id: 'L1' }]);
  assert.strictEqual(a.rest, 'data: {"type":"lead_upd');
  const b = parseSse(a.rest + 'ated"}\n\n');
  assert.deepStrictEqual(b.frames, [{ type: 'lead_updated' }]);
  assert.strictEqual(b.rest, '');
});
t('ignores comments, keep-alives, CRLF and junk', () => {
  const r = parseSse(': ping\r\n\r\ndata: not json\n\ndata:{"type":"x"}\r\n\r\n');
  assert.deepStrictEqual(r.frames, [{ type: 'x' }]);
});
t('a customer message bubbles only when the app is not in front and bubbles are on', () => {
  assert.strictEqual(wantsBubble(msg(), { enabled: true, appInFront: false }), true);
  assert.strictEqual(wantsBubble(msg(), { enabled: true, appInFront: true }), false);
  assert.strictEqual(wantsBubble(msg(), { enabled: false, appInFront: false }), false);
});
t("the studio's own messages and other events never bubble", () => {
  assert.strictEqual(wantsBubble(msg({ from_me: 1 }), { enabled: true, appInFront: false }), false);
  assert.strictEqual(wantsBubble({ ...msg(), type: 'lead_updated' }, { enabled: true, appInFront: false }), false);
  assert.strictEqual(wantsBubble({ type: 'new_message', message: { from_me: 0 } }, { enabled: true, appInFront: false }), false);
  assert.strictEqual(wantsBubble(null, { enabled: true, appInFront: false }), false);
});
t('the window fits the stack, one to four bubbles', () => {
  assert.deepStrictEqual(sizeFor(1), { width: HEAD + 20, height: HEAD + 20 });
  assert.deepStrictEqual(sizeFor(3), { width: HEAD + 20, height: 3 * HEAD + 2 * 10 + 20 });
  assert.deepStrictEqual(sizeFor(9), sizeFor(MAX_HEADS));
  assert.deepStrictEqual(sizeFor(0), sizeFor(1));
});
t('dropping it snaps to the nearer screen edge and stays on screen', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepStrictEqual(snapToEdge({ x: 300, y: 400, width: 76, height: 76 }, work), { x: 8, y: 400, side: 'left' });
  assert.deepStrictEqual(snapToEdge({ x: 1500, y: 400, width: 76, height: 76 }, work), { x: 1836, y: 400, side: 'right' });
  assert.deepStrictEqual(snapToEdge({ x: 1500, y: -200, width: 76, height: 76 }, work).y, 8);
  assert.deepStrictEqual(snapToEdge({ x: 1500, y: 5000, width: 76, height: 76 }, work).y, 1040 - 76 - 8);
  // a second monitor to the right
  assert.deepStrictEqual(snapToEdge({ x: 2000, y: 100, width: 76, height: 76 }, { x: 1920, y: 0, width: 1280, height: 1000 }), { x: 1928, y: 100, side: 'left' });
});
console.log(`\n${pass}/6 passed`);
