'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  PROP-002 Batch F verification — BOOT-FREE static checks.
//  Public brand chrome: PublicBrandHeader/PublicFooter with graceful fallback
//  (D6: the brand-data backend is deferred), the .wf-public fixed-light scope on
//  documentElement (the portal trap), and the #0ea5e9→#6366f1 collision killed.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

const header = R('components/PublicBrandHeader.js');
const footer = R('components/PublicFooter.js');
const scope = R('components/PublicScope.js');
const css = R('app/globals.css');

const PAGES = {
  'app/book/[slug]/page.js': R('app/book/[slug]/page.js'),
  'app/booking/manage/[token]/page.js': R('app/booking/manage/[token]/page.js'),
  'app/client/[token]/page.js': R('app/client/[token]/page.js'),
  'app/shop/[token]/page.js': R('app/shop/[token]/page.js'),
  'app/pay/[token]/page.js': R('app/pay/[token]/page.js'),
  'app/d/[token]/page.js': R('app/d/[token]/page.js'),
  'app/g/[token]/page.js': R('app/g/[token]/page.js'),
};

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); console.log('  ✓', name); pass++; } catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; } }
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── The collision ────────────────────────────────────────────────────────────
check('the #0ea5e9→#6366f1 WappFlow gradient is GONE from every public page', () => {
  for (const [n, s] of Object.entries(PAGES))
    assert(!/0ea5e9,#6366f1|0ea5e9, ?#6366f1/.test(s), n + ' still carries the WappFlow gradient');
});
check("no public page falls back to a literal 'W' mark or a 'WappFlow' name slot", () => {
  for (const [n, s] of Object.entries(PAGES)) {
    assert(!/\(data\.brand \|\| 'W'\)/.test(s), n + " keeps the 'W' fallback");
    assert(!/\|\| 'WappFlow'}/.test(s), n + " renders 'WappFlow' as a brand fallback");
  }
});

// ── The primitives ───────────────────────────────────────────────────────────
check('PublicBrandHeader: graceful fallback — no brand → no mark, never a placeholder identity', () => {
  // Phase 8 replaced the D6 SEAM with the real thing: brand is now the object the
  // public-brand resolver returns, so the identity is read off it rather than from
  // a bare name string plus two unused placeholder props.
  assert(/brand\?\.name/.test(header), 'the header does not read the studio name off the brand object');
  assert(/const initial = name \? name\.trim\(\)\.charAt\(0\)\.toUpperCase\(\) : null;/.test(header), 'initial not derived from the brand name');
  assert(/\{logoUrl \? \(/.test(header) && /\) : initial \? \(/.test(header) && /\) : null\}/.test(header), 'mark renders without a brand');
  assert(!/['">]W[<'"]/.test(strip(header)), 'a literal W survives in the header');
});
check('PublicBrandHeader: renders the studio logo and accent the resolver supplies', () => {
  assert(/brand\?\.logo/.test(header), 'the header cannot render an uploaded logo');
  assert(/brand\?\.accent \|\| 'var\(--accent\)'/.test(header), 'accent fallback missing');
  assert(/tone = 'light'/.test(header) && /dark:/.test(header), 'no dark tone for the gallery/executive surfaces');
});
check('PublicFooter: studio primary, platform credit separable, dark tone available', () => {
  assert(/const name = brand\?\.name/.test(footer), 'the footer does not read the brand object');
  assert(/\{name \? \(/.test(footer), 'no brand-first branch');
  assert(/Powered by WappFlow/.test(footer), 'platform credit missing');
  assert(/dark:/.test(footer), 'no dark tone');
});
check('every public surface is served the studio identity by ONE resolver', () => {
  // Phase 8. Six endpoints each answered "who is the studio?" differently, and none
  // served the logo. A studio that uploads one should see it everywhere at once.
  const be = (f) => fs.readFileSync(path.join(__dirname, '..', 'backend', f), 'utf8');
  for (const f of ['server.js', 'booking.js', 'print-store.js', 'contracts-studio.js', 'payments.js', 'media-studio.js']) {
    assert(/publicBrand\(db,/.test(be(f)), `${f} does not use the shared brand resolver`);
  }
  const resolver = be('public-brand.js');
  assert(/company_logo/.test(resolver), 'the resolver does not read the uploaded logo');
  assert(/safeColor/.test(resolver), 'the accent is interpolated into public CSS without validation');
});

// ── The scope (the portal trap) ──────────────────────────────────────────────
check('.wf-public targets documentElement (html.wf-public) — the only placement portals respect', () => {
  assert(/\.wf-public,\s*\r?\nhtml\.wf-public \{/.test(css), 'selector must be `.wf-public, html.wf-public`');
  assert(/document\.documentElement/.test(scope) && /classList\.add\('wf-public'\)/.test(scope), 'PublicScope does not set the html class');
  assert(/classList\.remove\('wf-public'\)/.test(scope), 'no cleanup — app would stick light after navigating back');
});
check('.wf-public restates the three DERIVED tokens (silent-failure class)', () => {
  const block = css.slice(css.indexOf('html.wf-public {'));
  for (const t of ['--focus-ring:', '--accent-bg:', '--warning-fg:'])
    assert(block.includes(t), t + ' not restated — would inherit its dark-resolved literal');
  assert(/--focus-ring: 0 0 0 1px var\(--accent\), 0 0 0 4px rgba\(99,102,241,0\.28\)/.test(block), 'ring alpha not raised for white backgrounds');
});
check('.wf-public declares the full mode-varying set + body/scrollbar/option reach', () => {
  const block = css.slice(css.indexOf('html.wf-public {'));
  for (const t of ['--bg:', '--surface:', '--surface2:', '--border:', '--text:', '--accent:', '--overlay-bg:', '--elev-3:', '--success-bg:', '--danger-bg:', '--info-bg:', '--warning-bg:'])
    assert(block.includes(t), 'missing ' + t);
  assert(/html\.wf-public body \{ background: var\(--bg\)/.test(css), 'body bleed not covered');
  assert(/\.wf-public select option/.test(css), 'native option popup not covered');
});
check('.wf-public is declared AFTER html.light so source order settles the specificity tie', () => {
  assert(css.lastIndexOf('html.light {') < css.indexOf('html.wf-public {'), '.wf-public must come after every html.light block');
});

// ── Adoption ─────────────────────────────────────────────────────────────────
check('the five LIGHT pages take PublicScope + the wf-public wrapper class', () => {
  for (const n of ['app/book/[slug]/page.js', 'app/booking/manage/[token]/page.js', 'app/client/[token]/page.js', 'app/shop/[token]/page.js', 'app/pay/[token]/page.js']) {
    assert(/<PublicScope \/>/.test(PAGES[n]), n + ' missing PublicScope');
    assert(/className="wf-public"/.test(PAGES[n]), n + ' wrapper not pre-hydration light');
  }
});
check('the DARK surfaces are NOT wrapped in the light scope (gallery stays dark by design)', () => {
  assert(!/PublicScope/.test(PAGES['app/g/[token]/page.js']), '/g must not opt into fixed-light');
  assert(!/PublicScope/.test(PAGES['app/d/[token]/page.js']), '/d has themed documents (executive is dark) — header/footer only this batch');
});
check('every public page now has ONE footer built on the primitive', () => {
  for (const [n, s] of Object.entries(PAGES))
    assert(/<PublicFooter/.test(s), n + ' has no PublicFooter');
  assert(!/Delivered with WappFlow Media Studio/.test(PAGES['app/g/[token]/page.js']), 'gallery still signs off as WappFlow only');
  assert(!/Powered by \{data\.brand\}/.test(Object.values(PAGES).join('')), 'a hand-rolled Powered-by survives');
});
check('/d: the header primitive replaced the hand-rolled Brand bar', () => {
  const s = PAGES['app/d/[token]/page.js'];
  assert(/<PublicBrandHeader/.test(s), 'header primitive not adopted');
  assert(/brand=\{data\?\.brand\}/.test(s), 'brand seam not wired for the deferred endpoint');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
