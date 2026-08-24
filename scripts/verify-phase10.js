'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 10 — the frontend half.
//
//  These are static checks over the source, so they assert CAPABILITY (the wiring
//  exists and reaches the right thing) rather than appearance. The behavioural
//  half lives in test-phase10-gallery-expiry-e2e.js, which drives real endpoints.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── Gallery editing + expiry ────────────────────────────────────────────────
check('a gallery can be edited from the studio — the update method had no caller at all', () => {
  const page = strip(R('app/studio/[id]/page.js'));
  assert(/mediaAPI\.updateGallery\(/.test(page), 'nothing calls updateGallery; a gallery still cannot be changed after creation');
  assert(/setEditing\(\{/.test(page), 'no edit entry point on the gallery card');
  for (const field of ['title', 'visibility', 'expires_at']) {
    assert(new RegExp(`${field}[:=]`).test(page), `the editor cannot change ${field}`);
  }
});

check('Gallery Expiry is visible to the studio, not just enforced on the client', () => {
  // Otherwise a studio finds out a gallery expired when the client rings.
  const page = strip(R('app/studio/[id]/page.js'));
  assert(/g\.is_expired/.test(page), 'the gallery card never shows expiry state');
  assert(/expires_at/.test(page), 'the expiry date is never displayed');
});

check('clearing an expiry is possible, so access can be given back', () => {
  const page = strip(R('app/studio/[id]/page.js'));
  assert(/expires_at: editing\.expires_at \|\| ''/.test(page),
    'an empty date is not sent, so a studio could set an expiry and never remove it');
});

// ── Chat drafts ─────────────────────────────────────────────────────────────
check('a half-written message survives switching channels', () => {
  // The composer is a contentEditable, not React state, so a channel switch
  // simply discarded whatever had been typed.
  const chat = strip(R('app/chat/page.js'));
  assert(/draftsRef/.test(chat), 'no draft store');
  assert(/stashDraft/.test(chat), 'nothing saves the draft on the way out');
  assert(/sessionStorage/.test(chat), 'drafts do not survive a refresh');
  assert(/el\.innerHTML = saved/.test(chat), 'the draft is saved but never restored');
});

check('sending clears the draft, so it does not reappear', () => {
  const chat = strip(R('app/chat/page.js'));
  const send = chat.slice(chat.indexOf('chatAPI.sendMessage('), chat.indexOf('chatAPI.sendMessage(') + 900);
  assert(/delete draftsRef\.current\[/.test(send), 'a sent message stays in the draft store and comes back');
});

// ── Duplicate lead ──────────────────────────────────────────────────────────
check('a duplicate phone offers the existing contact instead of a dead end', () => {
  // The API has always returned existing_id; the modal threw it away and showed
  // an error the user could do nothing about.
  const modal = strip(R('components/AddLeadModal.js'));
  assert(/existing_id/.test(modal), 'the modal ignores which contact it clashed with');
  assert(/\/leads\/\$\{duplicateId\}/.test(modal), 'there is no link to the existing contact');
});

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
check('there are app-wide shortcuts, mounted once on the shell', () => {
  const shell = strip(R('components/shell/AppShell.js'));
  assert(/useShortcuts\(\)/.test(shell), 'shortcuts are not wired into the shell');
  assert(/ShortcutHelp/.test(shell), 'the shortcut list is not reachable');
  // One shell means one binding — a per-page handler would bind repeatedly.
  const sc = strip(R('components/shell/shortcuts.js'));
  assert(/addEventListener\('keydown'/.test(sc), 'no key handler');
});

check('shortcuts never steal a key while the user is typing', () => {
  // The whole feature is a liability if typing "g" in a message navigates away.
  const sc = strip(R('components/shell/shortcuts.js'));
  assert(/function isTyping/.test(sc), 'no typing guard at all');
  for (const t of ['input', 'textarea', 'isContentEditable']) {
    assert(sc.includes(t), `the typing guard ignores ${t}`);
  }
  assert(/role="dialog"/.test(sc), 'shortcuts fire inside dialogs');
  assert(/e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey/.test(sc), 'single-key bindings fight browser shortcuts');
});

check('the shortcuts are discoverable', () => {
  const sc = strip(R('components/shell/shortcuts.js'));
  assert(/e\.key === '\?'/.test(sc), 'nothing opens the shortcut list');
  assert(/Ctrl/.test(sc), 'the list does not mention the palette binding that already existed');
});

check('a half-typed sequence does not wait forever', () => {
  const sc = strip(R('components/shell/shortcuts.js'));
  assert(/setTimeout\(\(\) => setPending\(null\)/.test(sc), 'a stray "g" would swallow the next keypress indefinitely');
});

// ── Invoice status ──────────────────────────────────────────────────────────
check('every status the backend produces has a presentation', () => {
  const reg = strip(R('lib/invoiceStatus.js'));
  for (const s of ['draft', 'sent', 'pending', 'paid', 'overdue']) {
    assert(new RegExp(`\\b${s}:`).test(reg), `${s} has no entry, so it renders as an unknown status`);
  }
  assert(/displayInvoiceStatus/.test(reg), 'nothing derives the displayed status from is_overdue');
});

check('overdue is derived from the backend flag, not a status nothing writes', () => {
  const page = strip(R('app/invoices/page.js'));
  assert(/i\.is_overdue/.test(page), 'the overdue stat still counts a status that is never written');
  assert(/displayInvoiceStatus\(inv\)/.test(page), 'the filter tab cannot match overdue');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
