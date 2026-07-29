'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  PROP-002 Batch D verification — BOOT-FREE static checks.
//  One field anatomy (Field + Input/Textarea/Select/Checkbox/Switch); the global
//  `input {…!important}` override NARROWED (not removed) so legacy forms keep
//  byte-identical behavior while primitives style their own states; the dead
//  onFocus/onBlur borderColor handlers deleted app-wide.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');
const css = R('app/globals.css');
const field = R('components/ui/Field.js');

const ADOPTERS = {
  'components/AddLeadModal.js': R('components/AddLeadModal.js'),
  'app/invoices/page.js': R('app/invoices/page.js'),
  'app/settings/page.js': R('app/settings/page.js'),
  'app/accept-invite/page.js': R('app/accept-invite/page.js'),
  'app/profile/page.js': R('app/profile/page.js'),
};

// Every .js under src — for the app-wide dead-handler gate.
const ALL = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) ALL.push([path.relative(WEB, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')]);
  }
})(WEB);

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); console.log('  ✓', name); pass++; } catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; } }

// ── The scope-down (narrow, never remove) ────────────────────────────────────
check('legacy override NARROWED not removed — all three groups keep !important for unmigrated controls', () => {
  assert(/input:not\(\[data-ui\]\), textarea:not\(\[data-ui\]\), select:not\(\[data-ui\]\) \{/.test(css), 'base group not narrowed');
  assert(/input:not\(\[data-ui\]\)::placeholder, textarea:not\(\[data-ui\]\)::placeholder/.test(css), 'placeholder group not narrowed');
  assert(/input:not\(\[data-ui\]\):focus, textarea:not\(\[data-ui\]\):focus, select:not\(\[data-ui\]\):focus/.test(css), 'focus group not narrowed');
  // the properties themselves are untouched — legacy controls behave byte-identically
  const legacy = css.slice(css.indexOf('input:not([data-ui])'), css.indexOf('.wf-input {'));
  for (const decl of ['background: var(--surface2) !important', 'color: var(--text) !important', 'border-color: var(--border) !important', 'border-color: var(--accent) !important', 'outline: none !important'])
    assert(legacy.includes(decl), 'lost legacy declaration: ' + decl);
});
check('no BARE global input/textarea/select override survives (would still defeat primitives)', () => {
  assert(!/(^|\n)input, textarea, select \{/.test(css), 'bare global form-control rule still present');
  assert(!/(^|\n)input:focus, textarea:focus, select:focus \{/.test(css), 'bare global focus rule still present');
});
check('autofill block deliberately left global (covers legacy AND primitives)', () => {
  assert(/input:-webkit-autofill/.test(css) && !/input:not\(\[data-ui\]\):-webkit-autofill/.test(css));
});
check('.wf-input block is token-driven; raw hex only inside the deliberate public tone', () => {
  const block = css.slice(css.indexOf('.wf-input {'), css.indexOf('.wf-checkbox'));
  const publicPart = block.slice(block.indexOf('.wf-input--public'));
  const appPart = block.slice(0, block.indexOf('.wf-input--public'));
  assert(!/#[0-9a-fA-F]{3,6}/.test(appPart), 'raw hex in the app-theme field styles');
  assert(/var\(--surface2\)/.test(appPart) && /var\(--border\)/.test(appPart) && /var\(--radius\)/.test(appPart));
  assert(/#fff/.test(publicPart), 'public tone should pin a light palette');
  assert(/\.wf-input:focus \{\s*border-color: var\(--accent\);/.test(block), 'focus border rule missing');
  // --danger-fg (not --danger): the invalid border must match the error text colour
  assert(/\.wf-input\[aria-invalid='true'\] \{\s*border-color: var\(--danger-fg\);/.test(block), 'invalid border rule missing/mismatched token');
  assert(/\.wf-input--public option/.test(css) && /\.wf-input--public:-webkit-autofill/.test(css), 'public tone incomplete (option/autofill would repaint it dark)');
});

// ── Field primitives ─────────────────────────────────────────────────────────
check('Field system exports the full family', () => {
  for (const e of ['export function Field', 'export function Input', 'export function Textarea', 'export function Select', 'export function Checkbox', 'export function Switch'])
    assert(field.includes(e), 'missing ' + e);
});
check('Field owns a11y wiring: htmlFor + required + aria-invalid + describedby + role=alert', () => {
  assert(/htmlFor=\{inputId\}/.test(field), 'label not associated');
  assert(/'aria-required'\] = 'true'/.test(field) || /aria-required/.test(field));
  assert(/'aria-invalid'\] = 'true'/.test(field), 'aria-invalid not set from error');
  assert(/'aria-describedby'\] = field\.descId/.test(field), 'describedby not wired');
  assert(/role="alert"/.test(field), 'error message not announced');
  assert(/useId\(\)/.test(field), 'ids not collision-safe');
});
check('every control opts OUT of the legacy override via data-ui', () => {
  assert(/'data-ui': true/.test(field), 'controls do not set data-ui');
  assert(/data-ui\s*\n?\s*className="wf-checkbox"/.test(field) || /type="checkbox"[\s\S]{0,80}data-ui/.test(field), 'checkbox missing data-ui');
});
check('wiring wins over caller props (spread AFTER rest) so a stray id cannot break label association', () => {
  assert(/<input \{\.\.\.rest\} \{\.\.\.useControlProps/.test(field), 'Input spread order wrong');
  assert(/<textarea rows=\{rows\} \{\.\.\.rest\} \{\.\.\.useControlProps/.test(field), 'Textarea spread order wrong');
  assert(/<select \{\.\.\.rest\} \{\.\.\.useControlProps/.test(field), 'Select spread order wrong');
});
check('Switch is a real switch (role + aria-checked + native button keyboard)', () => {
  assert(/role="switch"/.test(field) && /aria-checked=\{!!checked\}/.test(field) && /type="button"/.test(field));
});
check('Field system is domain-agnostic and colour-literal-free (no hex AND no raw rgba)', () => {
  const code = field.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(!/\b(lead|invoice|contract|booking|whatsapp|album)\b/i.test(code), 'Field references a domain concept');
  // NB: do NOT strip rgba() before testing — that is exactly where an untokenized
  // shadow hid. Both literal forms must be absent; elevation comes from --elev-*.
  assert(!/#[0-9a-fA-F]{3,6}/.test(code), 'raw hex in Field.js');
  assert(!/rgba?\(/.test(code), 'raw rgb/rgba literal in Field.js (use an --elev-* / colour token)');
});
check('Checkbox + Switch adopt a surrounding Field id (else its <label htmlFor> is orphaned)', () => {
  const cb = field.slice(field.indexOf('export function Checkbox'), field.indexOf('export function Switch'));
  const sw = field.slice(field.indexOf('export function Switch'));
  for (const [name, src] of [['Checkbox', cb], ['Switch', sw]]) {
    assert(/useContext\(FieldContext\)/.test(src), name + ' ignores FieldContext');
    assert(/id=\{field\?\.inputId\}/.test(src), name + ' does not claim the Field id');
  }
});
check('Checkbox + Switch merge caller props instead of being clobbered by them', () => {
  const cb = field.slice(field.indexOf('export function Checkbox'), field.indexOf('export function Switch'));
  const sw = field.slice(field.indexOf('export function Switch'));
  assert(/\{\.\.\.rest\}\s*\n\s*type="checkbox"/.test(cb), 'Checkbox spreads rest after its wiring');
  assert(/className=\{`wf-checkbox\$\{className/.test(cb), 'Checkbox className replaces instead of merging');
  assert(/\{\.\.\.rest\}\s*\n\s*type="button"/.test(sw), 'Switch spreads rest after its onClick (would kill the toggle)');
  assert(/aria-checked=\{!!checked\}/.test(sw), 'Switch can emit an undefined aria-checked');
});
check('NO JS focus handlers in the primitive — focus is pure CSS', () => {
  // strip comments: the header deliberately *names* the handlers it replaced
  const code = field.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(!/onFocus=|onBlur=/.test(code), 'Field system re-introduced JS focus handlers');
});

// ── The dead-handler purge (app-wide gate) ───────────────────────────────────
check('all dead focus-borderColor handlers are gone app-wide (gate catches every spelling)', () => {
  // Broad on purpose: any onFocus/onBlur whose body writes style.borderColor on the
  // event target — `e =>`, `(e) =>`, currentTarget, or borderColor not the first
  // statement. parentElement writes are excluded: those style a wrapper div and are alive.
  const offenders = ALL.filter(([, s]) =>
    (s.match(/on(?:Focus|Blur)=\{[^}]*?\bstyle\.borderColor/g) || [])
      .some((m) => !/parentElement/.test(m))
  ).map(([n]) => n);
  assert(offenders.length === 0, 'dead handlers survive in: ' + offenders.join(', '));
});
check('the two ALIVE parentElement handlers were preserved (they style a wrapper div, not an input)', () => {
  const s = ALL.find(([n]) => n === 'app/leads/[id]/page.js')[1];
  assert((s.match(/currentTarget\.parentElement\.style\.borderColor/g) || []).length === 2, 'alive wrapper handlers were destroyed');
});
check('functional onBlur handlers inside the PURGED files survived', () => {
  // Scoped to files the sweep actually edited — a repo-wide grep would pass no matter
  // what happened here, which is the assurance this check is supposed to give.
  const purged = ['app/leads/[id]/page.js', 'app/settings/page.js', 'app/knowledge/page.js'];
  const src = ALL.filter(([n]) => purged.includes(n));
  assert(src.length === purged.length, 'purged file missing from tree');
  const leads = src.find(([n]) => n === 'app/leads/[id]/page.js')[1];
  assert(/onBlur=\{\(\) => commitValue\(draft\)\}/.test(leads), 'commitValue-on-blur was deleted');
  // every surviving onFocus/onBlur in a purged file must do real work, never borderColor
  for (const [n, s] of src)
    for (const m of s.match(/on(?:Focus|Blur)=\{[^}]*\}/g) || [])
      assert(!/\bstyle\.borderColor/.test(m) || /parentElement/.test(m), n + ' still has a dead handler: ' + m.slice(0, 60));
});

// ── Adopters ─────────────────────────────────────────────────────────────────
check('adopters import and use the Field system', () => {
  for (const [name, s] of Object.entries(ADOPTERS)) {
    assert(/from '@\/components\/ui\/Field'/.test(s), name + ' does not import Field');
    assert(/<Field\b/.test(s), name + ' has no <Field> usage');
  }
});
check('AddLeadModal: local style consts deleted, icon labels PRESERVED, required kept', () => {
  const s = ADOPTERS['components/AddLeadModal.js'];
  assert(!/const field = \{/.test(s) && !/const label = \{/.test(s), 'local field style consts survive');
  // the icon-led labels are an affordance, not decoration — migration must not drop them
  assert((s.match(/<Field label=\{<><[A-Z]\w+ size=\{13\} \/> /g) || []).length === 5, 'icon labels lost in migration');
  assert(/from 'lucide-react'/.test(s), 'icon import missing');
  assert(/required>/.test(s), 'required semantics lost');
});
check('invoices: one error surface per problem — no duplicated/contradictory messages', () => {
  const s = ADOPTERS['app/invoices/page.js'];
  assert(/const fieldError = error === RECIPIENT_ERROR \? error : null;/.test(s), 'field error not derived from the real error');
  assert(/const bannerError = error === RECIPIENT_ERROR \? null : error;/.test(s), 'banner not suppressed for field errors');
  assert(!/error \&\& !to\.trim\(\)/.test(s), 'fabricated field-error condition survives');
});
check('invoices SendInvoiceModal: local field const deleted, three Fields wired', () => {
  const s = ADOPTERS['app/invoices/page.js'];
  assert(!/const field = \{ width: '100%', padding: '10px 13px'/.test(s), 'local field const survives');
  assert((s.match(/<Field label="/g) || []).length >= 3, 'expected 3 migrated fields');
});
check('settings Input wrapper is now an adapter over Field with its prop shape preserved', () => {
  const s = ADOPTERS['app/settings/page.js'];
  assert(/function Input\(\{ label, value, onChange, placeholder, type = 'text', hint \}\)/.test(s), 'adapter prop shape changed — would break its tab consumers');
  assert(/<Field label=\{label\} hint=\{hint\}/.test(s), 'adapter does not delegate to Field');
  assert(/<UIInput type=\{type\}/.test(s), 'adapter does not render the primitive');
  assert(!/const inputStyle = \{/.test(s), 'PasswordTab local input style survives');
});
check('accept-invite + profile: password/confirm mismatch now uses the Field error path', () => {
  assert(/error=\{form\.confirm && form\.confirm !== form\.password \? 'Passwords do not match' : null\}/.test(ADOPTERS['app/accept-invite/page.js']));
  assert(/<Field label="Bio"/.test(ADOPTERS['app/profile/page.js']), 'profile bio not migrated');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
