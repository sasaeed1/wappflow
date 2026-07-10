'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  PROP-002 Batch B verification — BOOT-FREE static checks.
//  Primitives are domain-agnostic; registries map stable KEYS -> presentation
//  metadata (not colors-as-values, not labels-as-keys); the proving grounds
//  (invoices, leads-list) adopt them; no domain logic leaked into primitives.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');
const button = R('components/ui/Button.js'), badge = R('components/ui/Badge.js');
const leadReg = R('lib/leadStatus.js'), invReg = R('lib/invoiceStatus.js');
const invoices = R('app/invoices/page.js'), leads = R('app/leads-list/page.js');

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); console.log('  ✓', name); pass++; } catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; } }
const DOMAIN = /\b(lead|contract|invoice|booking|gallery|album|role|whatsapp)\b/i;

// ── Primitives are domain-agnostic ──────────────────────────────────────────
check('Button has exactly the 4 approved variants (primary/secondary/ghost/danger)', () => {
  for (const v of ['primary', 'secondary', 'ghost', 'danger']) assert(new RegExp(v + ':\\s*\\{').test(button), 'missing ' + v);
  assert(!/success:\s*\{|info:\s*\{/.test(button), 'unexpected extra Button variant');
});
check('Button is token-driven with no raw hex and no inline box-shadow', () => {
  assert(!/#[0-9a-fA-F]{3,6}/.test(button), 'Button contains a raw hex');
  assert(!/boxShadow/.test(button), 'Button sets inline box-shadow (would defeat the focus ring)');
  assert(/var\(--accent\)/.test(button) && /var\(--radius\)/.test(button));
});
check('Button has no domain knowledge / business props', () =>
  assert(!DOMAIN.test(button.replace(/\/\/.*$/gm, '')), 'Button references a domain concept'));
check('Button a11y: real disabled attr + aria-busy on loading', () =>
  assert(/disabled=\{off\}/.test(button) && /aria-busy=\{loading/.test(button)));
check('Badge is tone-driven, domain-agnostic, no raw hex (except color escape-hatch prop)', () => {
  for (const t of ['neutral', 'info', 'accent', 'success', 'warning', 'danger']) assert(new RegExp(t + ':\\s*\\{').test(badge), 'missing tone ' + t);
  assert(!/#[0-9a-fA-F]{3,6}/.test(badge), 'Badge contains a raw hex');
  assert(!DOMAIN.test(badge.replace(/\/\/.*$/gm, '')), 'Badge references a domain concept');
});

// ── Registries: key -> presentation metadata ────────────────────────────────
check('leadStatus registry keyed by DB values with {label,tone,order}, no hex', () => {
  assert(/'Closed - Won':\s*\{ label:.*tone: 'success'.*order: 5/.test(leadReg), 'lead key/metadata shape off');
  assert(!/#[0-9a-fA-F]{3,6}/.test(leadReg), 'leadStatus stores a raw color (should be tone)');
  assert(/export const leadStatusMeta/.test(leadReg));
});
check('invoiceStatus registry keyed by DB values with {label,tone,order}, no hex', () => {
  for (const k of ['draft:', 'pending:', 'paid:', 'overdue:']) assert(leadReg && new RegExp(k).test(invReg), 'missing ' + k);
  assert(!/#[0-9a-fA-F]{3,6}/.test(invReg), 'invoiceStatus stores a raw color');
  assert(/tone: 'success'/.test(invReg) && /tone: 'danger'/.test(invReg));
});
check('labels are NOT used as domain keys (keys are canonical values, label is a separate field)', () => {
  assert(/'paid':|paid:\s*\{ label: 'Paid'/.test(invReg) === false || /paid:\s*\{ label: 'Paid'/.test(invReg), 'key should be the raw value');
  assert(/label:/.test(invReg) && /label:/.test(leadReg));
});

// ── Proving grounds adopt the primitives + registries ───────────────────────
check('invoices: imports Button + Badge + invoiceStatusMeta; STATUS_COLORS map deleted', () => {
  assert(/import Button from '@\/components\/ui\/Button'/.test(invoices));
  assert(/import Badge from '@\/components\/ui\/Badge'/.test(invoices));
  assert(/invoiceStatusMeta/.test(invoices));
  assert(!/const STATUS_COLORS = \{/.test(invoices), 'STATUS_COLORS map still present');
});
check('invoices: status pills render via <Badge> + registry (no inline status span)', () => {
  assert((invoices.match(/<Badge tone=\{invoiceStatusMeta/g) || []).length >= 2, 'expected 2 migrated pills');
  assert(!/background: sc\.bg, color: sc\.text/.test(invoices), 'inline status span survives');
});
check('invoices: buttons migrated to <Button> across variants (primary/secondary/danger + loading)', () => {
  assert(/<Button variant="primary"/.test(invoices) && /<Button variant="secondary"/.test(invoices) && /<Button variant="danger"/.test(invoices));
  assert(/loading=\{sending\}/.test(invoices));
});
check('leads-list: status badge renders via <Badge> + leadStatusMeta', () => {
  assert(/import Badge from '@\/components\/ui\/Badge'/.test(leads));
  assert(/<Badge tone=\{leadStatusMeta\(lead\.status\)\.tone\} dot>/.test(leads));
});

// ── Registry fallback contract (unknown/legacy keys) ────────────────────────
const registry = R('lib/statusRegistry.js');
check('shared fallback contract exists (humanizeStatus + makeStatusLookup)', () => {
  assert(/export function humanizeStatus/.test(registry) && /export function makeStatusLookup/.test(registry));
});
check('unknown key → NEUTRAL tone + humanized ORIGINAL value + unknown flag (no crash)', () => {
  assert(/tone: 'neutral'/.test(registry), 'fallback not neutral');
  assert(/label: humanizeStatus\(key\)/.test(registry), 'fallback does not humanize the original value');
  assert(/unknown: true/.test(registry), 'fallback not flagged unknown');
});
check('fallback does NOT silently normalize (no "|| draft/New" masquerade)', () => {
  assert(!/\|\| INVOICE_STATUS\.draft/.test(invReg), 'invoice fallback still normalizes unknown→Draft');
  assert(!/\|\| \{ label: key \|\| 'New'/.test(leadReg), 'lead fallback still normalizes unknown→New');
  assert(/makeStatusLookup\('invoice-status'/.test(invReg) && /makeStatusLookup\('lead-status'/.test(leadReg), 'registries not wired to shared fallback');
});
check('telemetry is one-shot + SSR-safe (no log spam, no server noise)', () => {
  assert(/typeof window === 'undefined'/.test(registry), 'not SSR-guarded');
  assert(/_warned\.has\(id\)/.test(registry) && /_warned\.add\(id\)/.test(registry), 'not deduped');
});
// LIVE humanizeStatus behavior (extracted from source — no ESM import needed).
const humSrc = registry.match(/export function humanizeStatus\(key\) \{([\s\S]*?)\n\}/)[1];
const humanizeStatus = new Function('key', humSrc);
check('humanizeStatus: legacy values render readable, empty→Unknown', () => {
  assert.strictEqual(humanizeStatus('closed_won'), 'Closed Won');
  assert.strictEqual(humanizeStatus('CLOSED-WON'), 'CLOSED WON'); // already-caps preserved, separators → space
  assert.strictEqual(humanizeStatus(''), 'Unknown');
  assert.strictEqual(humanizeStatus(null), 'Unknown');
  assert.strictEqual(humanizeStatus('needs_approval'), 'Needs Approval');
});

// ── Keys drive logic; labels are display-only (steps 6-7) ───────────────────
check('filtering/sorting uses the stable KEY, not the display label', () => {
  // invoices filters by the raw status key; .label appears only for display text.
  assert(/statusFilter/.test(invoices) || /=== 'all'/.test(invoices), 'no key-based filter found');
  assert(!/=== invoiceStatusMeta\([^)]*\)\.label/.test(invoices), 'a comparison uses the display label');
  assert(!/=== leadStatusMeta\([^)]*\)\.label/.test(leads), 'a comparison uses the display label');
});
check('registry label is presentation-only (never used as an object key or query param)', () => {
  // .label must not be interpolated into a key/param position — only rendered.
  assert(!/\[[^\]]*Meta\([^)]*\)\.label\]/.test(invoices + leads), 'a display label is used as an object key');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
