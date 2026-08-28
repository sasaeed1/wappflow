'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Lead assistant — the gate between a language model and the CRM.
//
//  assistProposals asks a model what to do about a conversation. The model is a
//  suggestion engine, not a source of truth about our schema, and every failure
//  mode below ends — unfiltered — as a button in the UI that either does nothing
//  or does something wrong to a customer record:
//
//    • a proposal aimed at a column that does not exist  → a dead button
//    • a "change" whose value already matches the lead   → destroys trust in
//                                                          every other suggestion
//    • an "ask" for a field already on file              → makes the studio look
//                                                          like it wasn't listening
//    • a proposal with no evidence                       → unauditable, so it has
//                                                          to be checked by hand
//    • an unparseable date                               → a reminder at Invalid Date
//
//  validateProposals is exported and PURE precisely so this can drive it with
//  the shapes a model actually produces, including the wrong ones, with no
//  network call and no stubbed plumbing to drift out of step with the real path.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const { validateProposals, ASSIST_FIELDS } = require('./ai-engine.js');

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  ✓', n); pass++; }
  catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

const LEAD = {
  id: 'lead-1', customer_name: 'Ayesha', customer_phone: '+92300',
  email: '', address: '', estimated_value: null, date_of_birth: '', lead_source: '',
};
const soon = () => new Date(Date.now() + 864e5).toISOString();

console.log('\n[1] the gate drops what would become a broken button');

check('a proposal for a column the leads table does not have is dropped', () => {
  const out = validateProposals([
    { type: 'field', field: 'event_date', value: '2026-09-14', why: 'she said September' },
    { type: 'field', field: 'email', value: 'ayesha@example.com', why: 'she gave it in her last message' },
  ], LEAD);
  assert(!out.some(p => p.field === 'event_date'), 'kept a field with no column behind it');
  assert(out.some(p => p.field === 'email'), 'dropped a valid proposal alongside it');
});

check('every allowed field really is a writable lead column', () => {
  // Guards the other direction: ASSIST_FIELDS is what the prompt advertises, so
  // a name here that PUT /api/leads/:id will not accept is a dead button too.
  const fs = require('fs');
  const srv = fs.readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
  const i = srv.indexOf("app.put('/api/leads/:id'");
  assert(i > -1, 'lead update route moved');
  const allowList = srv.slice(i, i + 400);
  for (const f of ASSIST_FIELDS) {
    assert(allowList.includes(`'${f}'`), `${f} is offered to the model but PUT /api/leads/:id will not write it`);
  }
});

check('a "change" that matches what is already on the lead is dropped', () => {
  const out = validateProposals(
    [{ type: 'field', field: 'customer_name', value: 'Ayesha', why: 'she signs off as Ayesha' }], LEAD);
  assert.strictEqual(out.length, 0, 'proposed setting a field to the value it already has');
});

check('whitespace does not sneak an identical value past that check', () => {
  const out = validateProposals(
    [{ type: 'field', field: 'customer_name', value: '  Ayesha  ', why: 'x' }], LEAD);
  assert.strictEqual(out.length, 0);
});

check('an "ask" for a field already on file is dropped', () => {
  const out = validateProposals(
    [{ type: 'ask', field: 'email', question: 'What is your email?', why: 'no email on file' }],
    { ...LEAD, email: 'already@known.com' });
  assert.strictEqual(out.length, 0, 'asked the customer for something the CRM already knows');
});

check('a proposal with no evidence is dropped', () => {
  const out = validateProposals([{ type: 'reminder', title: 'Follow up', due_at: soon() }], LEAD);
  assert.strictEqual(out.length, 0, 'kept a suggestion with nothing to audit it against');
});

check('an unparseable due date is dropped, not stored as Invalid Date', () => {
  const out = validateProposals(
    [{ type: 'reminder', title: 'Call her', due_at: 'next tuesday-ish', why: 'she asked' }], LEAD);
  assert.strictEqual(out.length, 0);
});

check('a zero, negative or non-numeric invoice is dropped', () => {
  const out = validateProposals([
    { type: 'invoice', amount: 0, description: 'x', why: 'y' },
    { type: 'invoice', amount: -5, description: 'x', why: 'y' },
    { type: 'invoice', amount: 'lots', description: 'x', why: 'y' },
  ], LEAD);
  assert.strictEqual(out.length, 0);
});

check('an unknown proposal type is dropped', () => {
  const out = validateProposals([
    { type: 'send_whatsapp', body: 'hello', why: 'because' },
    { type: 'delete_lead', why: 'because' },
  ], LEAD);
  assert.strictEqual(out.length, 0, 'an unrecognised action reached the UI');
});

check('junk in the array does not throw', () => {
  const out = validateProposals([null, 'nonsense', 42, [], { why: 'no type' }], LEAD);
  assert.deepStrictEqual(out, []);
});

check('a model that returned prose instead of an array yields nothing', () => {
  for (const junk of [null, undefined, 'follow up with her soon!', {}, 0]) {
    assert.deepStrictEqual(validateProposals(junk, LEAD), []);
  }
});

console.log('\n[2] valid proposals survive intact');

check('a good set comes through with its evidence and shape', () => {
  const due = soon();
  const out = validateProposals([
    { type: 'field', field: 'email', value: 'ayesha@example.com', why: 'she gave it in her last message' },
    { type: 'invoice', amount: 45000, description: 'Full day wedding coverage', why: 'quoted 45000, she said book us in' },
    { type: 'reminder', title: 'Confirm the September date', due_at: due, why: 'she asked about September' },
    { type: 'ask', field: 'address', question: 'Where is the venue?', why: 'no address on file' },
  ], LEAD);
  assert.strictEqual(out.length, 4, `expected 4, got ${out.length}`);
  const f = out.find(p => p.type === 'field');
  assert.strictEqual(f.value, 'ayesha@example.com');
  assert.strictEqual(f.current, '', 'the current value must ride along so the UI can show what changes');
  assert.strictEqual(out.find(p => p.type === 'invoice').amount, 45000);
  assert.strictEqual(out.find(p => p.type === 'reminder').due_at, new Date(due).toISOString());
  assert(out.every(p => p.why && p.why.length), 'evidence was stripped');
});

check('the list is capped so the strip cannot bury the conversation', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({
    type: 'reminder', title: `Task ${i}`, due_at: soon(), why: 'because',
  }));
  assert(validateProposals(many, LEAD).length <= 4);
});

check('long free text is truncated rather than rendered at full length', () => {
  const out = validateProposals([{
    type: 'reminder', title: 'x'.repeat(400), due_at: soon(), why: 'y'.repeat(600),
  }], LEAD);
  assert(out[0].title.length <= 120, 'title not truncated');
  assert(out[0].why.length <= 240, 'evidence not truncated');
});

check('a null/empty current value is preserved as such, not as the string "null"', () => {
  const out = validateProposals(
    [{ type: 'field', field: 'estimated_value', value: '45000', why: 'quoted in chat' }], LEAD);
  assert.strictEqual(out[0].current, null, `current came through as ${JSON.stringify(out[0].current)}`);
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
