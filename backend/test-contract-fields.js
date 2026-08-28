'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Placed contract fields — the rule that decides whether a document is signed.
//
//  This is the gate on a legally-binding act, so the failure modes are not
//  cosmetic:
//
//    • a required field silently skipped  → a contract completed without the
//                                            term it was supposed to capture
//    • one role blocked by another's field → the witness cannot sign, or worse,
//                                            signs on the client's behalf
//    • a blank signature pad accepted      → a "signature" that is an empty
//                                            canvas, discovered in a dispute
//    • values posted for fields that are
//      not in the document                → a client writing into the record
//
//  Documents created BEFORE this feature have no field blocks and sign the old
//  way (one drawn signature in a closing modal). Both paths must keep working,
//  so `usesPlacedSigning` is tested in both directions.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const F = require('./contract-fields.js');

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  ✓', n); pass++; }
  catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

const field = (id, kind, extra = {}) => ({ id, type: 'field', data: { kind, ...extra } });
const REAL_SIG = 'data:image/png;base64,' + 'A'.repeat(2000);
const BLANK_SIG = 'data:image/png;base64,' + 'A'.repeat(40);

const DOC = [
  { id: 'h1', type: 'heading', data: { text: 'Agreement' } },
  field('f_sig', 'signature', { role: 'client', label: 'Sign here' }),
  field('f_init', 'initials', { role: 'client', label: 'Initial the terms' }),
  field('f_date', 'date', { role: 'client', label: 'Date', required: true }),
  field('f_note', 'text', { role: 'client', label: 'Anything we should know?' }),
  field('f_agree', 'checkbox', { role: 'client', label: 'I accept the terms', required: true }),
  field('f_wit', 'signature', { role: 'witness', label: 'Witness signature' }),
];

console.log('\n[1] what a document is actually asking for');

check('field blocks are collected and non-field blocks ignored', () => {
  const fs = F.collectFields(DOC);
  assert.strictEqual(fs.length, 6, `expected 6 fields, got ${fs.length}`);
  assert(!fs.some(f => f.id === 'h1'), 'a heading was treated as a field');
});

check('a signature is required by DEFAULT — an optional signature is a mistake', () => {
  const [sig] = F.collectFields([field('s', 'signature', { role: 'client' })]);
  assert.strictEqual(sig.required, true);
  const [txt] = F.collectFields([field('t', 'text', { role: 'client' })]);
  assert.strictEqual(txt.required, false, 'a text box should not block signing unless asked to');
});

check('required:false on a signature is still honoured', () => {
  const [sig] = F.collectFields([field('s', 'signature', { role: 'client', required: false })]);
  assert.strictEqual(sig.required, false, 'the default overrode an explicit choice');
});

check('an unknown kind or role falls back rather than vanishing', () => {
  const [f] = F.collectFields([field('x', 'fingerprint', { role: 'notary' })]);
  assert.strictEqual(f.kind, 'text', 'an unknown kind was dropped, losing the field entirely');
  assert.strictEqual(f.role, 'client', 'an unknown role left a field nobody is responsible for');
});

check('fields are separated by role', () => {
  assert.strictEqual(F.fieldsForRole(DOC, 'client').length, 5);
  assert.strictEqual(F.fieldsForRole(DOC, 'witness').length, 1);
  assert.strictEqual(F.fieldsForRole(DOC, 'company').length, 0);
});

console.log('\n[2] the gate on signing');

check('a complete client submission passes', () => {
  const r = F.validateSubmission(DOC, 'client', {
    f_sig: REAL_SIG, f_init: REAL_SIG, f_date: '2026-09-14', f_agree: true,
  });
  assert(r.ok, `blocked with: ${r.missing.map(m => m.label).join(', ')}`);
});

check('a missing required field blocks, and is NAMED', () => {
  const r = F.validateSubmission(DOC, 'client', { f_sig: REAL_SIG, f_init: REAL_SIG, f_date: '2026-09-14' });
  assert(!r.ok, 'signed without accepting the terms');
  assert.strictEqual(r.missing.length, 1);
  assert.strictEqual(r.missing[0].label, 'I accept the terms',
    'the client would be told "something is missing" with no way to find it');
});

check('an OPTIONAL field left blank does not block', () => {
  const r = F.validateSubmission(DOC, 'client', {
    f_sig: REAL_SIG, f_init: REAL_SIG, f_date: '2026-09-14', f_agree: true,
  });
  assert(r.ok);
  assert(!('f_note' in r.values), 'an empty optional field was stored as a value');
});

check('a BLANK signature pad is not a signature', () => {
  const r = F.validateSubmission(DOC, 'client', {
    f_sig: BLANK_SIG, f_init: REAL_SIG, f_date: '2026-09-14', f_agree: true,
  });
  assert(!r.ok, 'an empty canvas was accepted as a signature');
  assert.strictEqual(r.missing[0].id, 'f_sig');
});

check('whitespace is not an answer', () => {
  const r = F.validateSubmission(DOC, 'client', {
    f_sig: REAL_SIG, f_init: REAL_SIG, f_date: '   ', f_agree: true,
  });
  assert(!r.ok, 'a date of "   " was accepted');
});

check('an unchecked checkbox is not consent', () => {
  for (const v of [false, 'false', 0, '0', '', undefined, null]) {
    const r = F.validateSubmission(DOC, 'client', {
      f_sig: REAL_SIG, f_init: REAL_SIG, f_date: '2026-09-14', f_agree: v,
    });
    assert(!r.ok, `checkbox value ${JSON.stringify(v)} was treated as accepted`);
  }
});

console.log('\n[3] one role can never answer for another');

check("the witness is not blocked by the client's fields", () => {
  const r = F.validateSubmission(DOC, 'witness', { f_wit: REAL_SIG });
  assert(r.ok, `witness blocked by: ${r.missing.map(m => m.label).join(', ')}`);
});

check("the witness cannot fill the client's signature", () => {
  const r = F.validateSubmission(DOC, 'witness', { f_wit: REAL_SIG, f_sig: REAL_SIG, f_agree: true });
  assert(r.ok);
  assert(!('f_sig' in r.values), "a witness wrote into the client's signature field");
  assert(!('f_agree' in r.values), "a witness accepted the terms on the client's behalf");
});

check('values for fields that are not in the document are dropped', () => {
  const r = F.validateSubmission(DOC, 'client', {
    f_sig: REAL_SIG, f_init: REAL_SIG, f_date: '2026-09-14', f_agree: true,
    f_not_a_field: 'injected', __proto__: 'nope',
  });
  assert(r.ok);
  assert(!('f_not_a_field' in r.values), 'a client wrote a value the document never asked for');
  assert.strictEqual(Object.keys(r.values).length, 4);
});

console.log('\n[4] documents written before this feature still sign');

check('a document with no fields does NOT use placed signing', () => {
  const legacy = [{ id: 'h', type: 'heading', data: {} }, { id: 's', type: 'signature', data: {} }];
  assert.strictEqual(F.usesPlacedSigning(legacy, 'client'), false,
    'a pre-existing contract would now demand fields it does not have');
  const r = F.validateSubmission(legacy, 'client', {});
  assert(r.ok, 'a legacy document became unsignable');
});

check('a document WITH a required signature field does use placed signing', () => {
  assert.strictEqual(F.usesPlacedSigning(DOC, 'client'), true);
  assert.strictEqual(F.usesPlacedSigning(DOC, 'witness'), true);
});

check('a role with only data fields does not count as placed signing', () => {
  // Otherwise a document asking the company for a date would let it "sign" by
  // typing one, with no mark of assent anywhere.
  const doc = [field('c_date', 'date', { role: 'company', required: true })];
  assert.strictEqual(F.usesPlacedSigning(doc, 'company'), false,
    'a text/date field alone was treated as a signature');
});

check('malformed input never throws', () => {
  for (const junk of [null, undefined, 'x', 42, {}, [null, 'x', { type: 'field' }]]) {
    assert.deepStrictEqual(F.collectFields(junk), Array.isArray(junk) ? F.collectFields(junk) : []);
    const r = F.validateSubmission(junk, 'client', null);
    assert(typeof r.ok === 'boolean');
  }
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
