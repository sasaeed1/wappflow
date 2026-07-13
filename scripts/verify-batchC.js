'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  PROP-002 Batch C verification — BOOT-FREE static checks.
//  One overlay foundation (portal/stack/escape/scroll-lock/focus-trap); Modal +
//  Toast primitives on the token ladder; confirm rebased on the foundation +
//  requireTyped tier; approved adopters migrated; grep gates SCOPED to migrated
//  files (the app-wide gate lands when the recorded backlog empties).
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

const overlay = R('components/ui/overlay.js');
const modal = R('components/ui/Modal.js');
const toastSrc = R('components/ui/Toast.js');
const confirmSrc = R('lib/confirm.js');
const providers = R('app/providers.js');

const MIGRATED = {
  'app/invoices/page.js': R('app/invoices/page.js'),
  'app/team/page.js': R('app/team/page.js'),
  'app/settings/page.js': R('app/settings/page.js'),
  'components/AddLeadModal.js': R('components/AddLeadModal.js'),
  'components/ScheduleMeetingModal.js': R('components/ScheduleMeetingModal.js'),
  'app/leads-list/page.js': R('app/leads-list/page.js'),
  'app/studio/trash/page.js': R('app/studio/trash/page.js'),
  'app/contracts/page.js': R('app/contracts/page.js'),
  'app/booking/manage/[token]/page.js': R('app/booking/manage/[token]/page.js'),
  'app/trash/page.js': R('app/trash/page.js'),
};

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); console.log('  ✓', name); pass++; } catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; } }
// Migration comments legitimately NAME the old values they removed — match against code only.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^ \* .*$/gm, '');

// ── Foundation ───────────────────────────────────────────────────────────────
check('overlay foundation: Portal + stack + escape + scroll-lock + focus-trap, all exported', () => {
  for (const h of ['export function Portal', 'export function useOverlayStack', 'export function useEscape', 'export function useScrollLock', 'export function useFocusTrap'])
    assert(overlay.includes(h), 'missing ' + h);
  assert(/lockCount/.test(overlay), 'scroll lock not reference-counted');
  assert(/stack\[stack\.length - 1\]/.test(overlay), 'no top-of-stack answer');
  assert(/previouslyFocused/.test(overlay), 'no focus restore');
});
check('foundation is manager-free (no context/provider — future primitives compose hooks)', () => {
  assert(!/createContext|Provider/.test(overlay), 'overlay.js grew a manager/context');
});

// ── Modal primitive ──────────────────────────────────────────────────────────
check('Modal: role=dialog + aria-modal + labelledBy/describedBy + portal + ladder token', () => {
  for (const s of ['role="dialog"', 'aria-modal="true"', 'aria-labelledby', 'aria-describedby', '<Portal>', 'var(--z-modal)'])
    assert(modal.includes(s), 'missing ' + s);
  assert(!/z-index:\s*\d/.test(modal), 'Modal hardcodes a z-index number');
});
check('Modal: dismissable={false} disables backdrop AND Escape close; motion tokens used', () => {
  assert(/dismissable = true/.test(modal) && /dismissable \? \(\) => onClose/.test(modal) || /dismissable/.test(modal));
  assert(/useEscape\(open, isTop, dismissable/.test(modal), 'Escape not gated on dismissable');
  assert(/dismissable \|\| !isTop/.test(modal) || /!dismissable \|\| !isTop/.test(modal), 'backdrop not gated on dismissable+top');
  assert(/var\(--dur/.test(modal) && /var\(--ease/.test(modal), 'motion tokens missing');
});
check('useModal: open/close/toggle + promise seam (confirmed/cancelled/dismissed)', () => {
  for (const s of ['export function useModal', 'const open = useCallback', 'const close = useCallback', 'const toggle = useCallback', "'dismissed'"])
    assert(modal.includes(s), 'missing ' + s);
  assert(/new Promise\(\(resolve\)/.test(modal), 'open() has no promise seam');
});

// ── Toast engine ─────────────────────────────────────────────────────────────
check('Toast: ONE engine — wrappers delegate to show(), no duplicate logic', () => {
  assert(/success: \(title, opts = \{\}\) => show\(/.test(toastSrc), 'success not delegating');
  assert(/error: {3}\(title, opts = \{\}\) => show\(/.test(toastSrc) || /error:\s+\(title, opts = \{\}\) => show\(/.test(toastSrc), 'error not delegating');
  assert((toastSrc.match(/setTimeout\(\(\) => dismiss/g) || []).length <= 2, 'duplicated dismiss timers');
});
check('Toast: bottom-right + aria-live + queue + ladder token + portal', () => {
  for (const s of ["aria-live=", 'bottom: 20px; right: 20px', 'var(--z-toast)', 'MAX_VISIBLE', '<Portal>'])
    assert(toastSrc.includes(s), 'missing ' + s);
  assert(/role=\{tone === 'danger' \? 'alert' : 'status'\}/.test(toastSrc), 'error toasts must be role=alert');
});
check('ToastViewport mounted once in providers', () => {
  assert(providers.includes('<ToastViewport />'), 'viewport not mounted');
  assert((providers.match(/ToastViewport/g) || []).length === 2, 'viewport mounted more than once');
});

// ── confirm: foundation + requireTyped ───────────────────────────────────────
check('confirm rebased on the foundation (stack/scroll-lock/trap/portal), API unchanged', () => {
  for (const s of ['useOverlayStack', 'useScrollLock', 'useFocusTrap', '<Portal>'])
    assert(confirmSrc.includes(s), 'missing ' + s);
  assert(/export function ConfirmProvider/.test(confirmSrc) && /export function useConfirm/.test(confirmSrc));
});
check('requireTyped tier: input gate + Enter guard + disabled confirm', () => {
  assert(/requireTyped: opts\.requireTyped \|\| null/.test(confirmSrc), 'option not plumbed');
  assert(/typed === requireTyped/.test(confirmSrc), 'no exact-match gate');
  assert(/if \(!canConfirm\) return;/.test(confirmSrc), 'Enter not guarded by canConfirm');
  assert(/disabled=\{!canConfirm\}/.test(confirmSrc), 'confirm button not disabled');
});

// ── Migrations (approved surfaces only) ──────────────────────────────────────
check('invoices: both modals on the primitive; local toast + z 300/320/9999 gone', () => {
  const s = MIGRATED['app/invoices/page.js'];
  assert((s.match(/<Modal /g) || []).length === 2, 'expected 2 Modal adopters');
  assert(!/zIndex: 300|zIndex: 320|zIndex: 9999/.test(s), 'raw overlay z-index survives');
  assert(!/flashToast|setToast/.test(s), 'local toast plumbing survives');
  assert(/toast\.success\(/.test(s) && /toast\.error\(/.test(s), 'engine not adopted');
});
check('team: 4 overlays → Modal; local Toast component deleted', () => {
  const s = MIGRATED['app/team/page.js'];
  assert((s.match(/<Modal /g) || []).length >= 4, 'expected 4 Modal adopters');
  assert(!/function Toast\(/.test(s) && !/zIndex:200|zIndex:300|zIndex: 9999/.test(s.replace(/\s/g, '')) || !/function Toast\(/.test(s), 'local Toast survives');
  assert(/toast\.success\(/.test(s) && /toast\.error\(/.test(s));
});
check('settings: local Toast engine deleted; showToast is a thin adapter over the engine', () => {
  const s = MIGRATED['app/settings/page.js'];
  assert(!/function Toast\(/.test(s), 'local Toast component survives');
  assert(!/setToast\(/.test(s), 'local toast state survives');
  assert(/toast\.error\(msg\)/.test(s) && /toast\.success\(msg\)/.test(s) && /toast\.info\(msg\)/.test(s), 'adapter not delegating all types');
});
check('AddLeadModal: Modal adopter, tokenized (no #0f1117), registry-driven status options', () => {
  const s = stripComments(MIGRATED['components/AddLeadModal.js']);
  assert(/<Modal/.test(s) && !/#0f1117|bg-black\/60|fixed inset-0/.test(s), 'Tailwind slab survives');
  assert(/LEAD_STATUS_KEYS\.map/.test(s), 'status options not registry-driven');
  assert(/loading=\{loading\}/.test(s), 'submit lost its loading state');
});
check('ScheduleMeetingModal: Modal adopter; z 9998 + hardcoded palette gone; notices are toasts', () => {
  const s = stripComments(MIGRATED['components/ScheduleMeetingModal.js']);
  assert(/<Modal/.test(s) && !/9998|sm-overlay|#14161f/.test(s), 'old overlay survives');
  assert(/toast\.success\(/.test(s) && /toast\.error\(/.test(s) && /toast\.warning\(/.test(s));
  assert(!/useConfirm/.test(s), 'stale useConfirm import');
});
check('typed confirmations: merge=MERGE, empty-trash=DELETE, studio-purge=DELETE, contract-delete=DELETE, booking-cancel=CANCEL', () => {
  assert(/requireTyped: 'MERGE'/.test(MIGRATED['app/leads-list/page.js']));
  assert(/requireTyped: 'DELETE'/.test(MIGRATED['app/trash/page.js']));
  assert(/requireTyped: 'DELETE'/.test(MIGRATED['app/studio/trash/page.js']));
  assert(/requireTyped: 'DELETE'/.test(MIGRATED['app/contracts/page.js']));
  assert(/requireTyped: 'CANCEL'/.test(MIGRATED['app/booking/manage/[token]/page.js']));
});
check('grep gate (scoped): no native window.confirm/alert/prompt beyond the recorded exceptions', () => {
  for (const [name, s] of Object.entries(MIGRATED)) {
    // leads-list keeps TWO recorded exceptions, both outside the approved list ("do not
    // hunt every confirm"): saved-view window.prompt + move-to-clients window.confirm.
    const hits = (s.match(/window\.(confirm|alert|prompt)\(/g) || []).length;
    const allowed = name === 'app/leads-list/page.js' ? 2 : 0;
    assert(hits <= allowed, `${name} has ${hits} native dialog call(s), allowed ${allowed}`);
  }
});
check('grep gate (scoped): no fixed-backdrop overlays left in OVERLAY-migrated files', () => {
  // Only these files had their overlays migrated in Batch C; other files in MIGRATED
  // only had confirm/toast swaps and legitimately keep their (recorded) legacy modals.
  for (const name of ['app/invoices/page.js', 'app/team/page.js', 'components/AddLeadModal.js', 'components/ScheduleMeetingModal.js']) {
    const s = stripComments(MIGRATED[name]);
    assert(!/position:\s*'?fixed'?,?\s*inset:\s*0/.test(s), `${name} still hand-rolls a fixed backdrop`);
  }
});
check('stacking: no numeric z-index escalation anywhere in the primitives', () => {
  for (const s of [overlay, modal, toastSrc]) assert(!/z-?[iI]ndex:\s*\d{2,}/.test(s), 'numeric z-index found');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
