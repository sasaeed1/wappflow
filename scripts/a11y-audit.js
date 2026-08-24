'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Accessibility audit — find the real problems, not the easy metrics.
//
//  The PRODUCT-AUDIT counted "19 aria-labels against 1074 onClick handlers",
//  which is a ratio, not a defect list: most click handlers are on <button>s with
//  visible text and need no label at all. Counting aria attributes measures how
//  much aria was typed, and adding aria to something that did not need it makes
//  the number better and the product worse.
//
//  So this looks for things a keyboard or screen-reader user would actually hit:
//
//    1. A control with NO ACCESSIBLE NAME — an icon-only button announced as
//       "button", which is the single most common real barrier in this codebase.
//    2. A CLICKABLE DIV — not focusable, not announced as interactive, and
//       unreachable without a mouse.
//    3. An IMAGE WITH NO ALT — either describe it or mark it decorative.
//    4. AN INPUT WITH NO LABEL — a screen reader announces "edit text, blank".
//    5. A DIALOG WITH NO NAME — announced as "dialog" with no indication what of.
//
//  Deliberately NOT reported: aria-label on a button that already has text (that
//  is usually a mistake, not a fix), and colour contrast (needs rendering, not
//  source reading — a separate job).
//
//  Usage:  node scripts/a11y-audit.js [--json] [--fail-on <n>]
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');

// Components whose rendered output carries no text of its own. A button whose
// only child is one of these needs a name from somewhere else.
const ICON_ONLY = /^(?:[A-Z][A-Za-z0-9]*)$/;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})(WEB);

const rel = (p) => path.relative(path.join(__dirname, '..'), p).split(path.sep).join('/');
const findings = { unnamed: [], clickableDiv: [], noAlt: [], unlabelledInput: [], placeholderOnly: [], unnamedDialog: [] };

/** Grab the full opening tag starting at `i`, respecting nested braces/quotes. */
function openingTag(src, i) {
  let depth = 0, q = null;
  for (let k = i; k < src.length && k < i + 4000; k++) {
    const c = src[k];
    if (q) { if (c === q && src[k - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(i, k + 1);
  }
  return src.slice(i, i + 400);
}

/** The children between an opening tag and its matching close, shallowly. */
function childrenOf(src, tagEnd, tagName) {
  const close = src.indexOf(`</${tagName}>`, tagEnd);
  if (close < 0 || close - tagEnd > 3000) return '';
  return src.slice(tagEnd, close);
}

// A control needs a name only when it renders NOTHING a sighted user could read.
// Statically distinguishing "renders text from a variable" from "renders an icon"
// is not reliably possible, so this asks the precise question instead: are the
// children ONLY self-closing components and whitespace? That is exactly the
// icon-only button pattern, and it is the real barrier — a close button announced
// as "button" with no further information.
//
// An earlier version stripped {expressions} before looking for words, which
// reported every button whose label came from a ternary — 391 findings, almost
// all of them false. Under-reporting here is far better than sending somebody to
// "fix" hundreds of buttons that were already fine.
const ICON_ONLY_CHILDREN = /^(?:\s|<[A-Z][A-Za-z0-9]*[^>]*\/>)*$/;

const hasName = (tag, kids) =>
  // Deliberately hidden from assistive tech (a decorative mockup, say) — it does
  // not need a name, and giving it one would announce a control nobody can use.
  /aria-hidden\s*=\s*[{"']?true/.test(tag) ||
  /aria-label\s*=/.test(tag) ||
  /aria-labelledby\s*=/.test(tag) ||
  /title\s*=/.test(tag) ||
  !ICON_ONLY_CHILDREN.test(kids);

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  // Blank out comments, keeping length and newlines so reported line numbers stay
  // true. Without this, prose that mentions `<button>` in a comment is reported as
  // an unnamed control — which is how this audit started flagging its own docs.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  // ── 1. Controls with no accessible name ──────────────────────────────────
  for (const m of src.matchAll(/<button\b/g)) {
    const tag = openingTag(src, m.index);
    if (/\/>\s*$/.test(tag)) {                       // self-closing: no children
      if (!/aria-label|aria-labelledby|title\s*=/.test(tag)) {
        findings.unnamed.push({ file: rel(file), line: lineOf(m.index), snippet: tag.slice(0, 100) });
      }
      continue;
    }
    const kids = childrenOf(src, m.index + tag.length, 'button');
    if (!hasName(tag, kids)) {
      findings.unnamed.push({ file: rel(file), line: lineOf(m.index), snippet: (tag + kids).replace(/\s+/g, ' ').slice(0, 110) });
    }
  }

  // ── 2. Clickable non-interactive elements ────────────────────────────────
  for (const m of src.matchAll(/<(div|span|li|td|tr)\b[^>]*?onClick/g)) {
    const el = m[1];
    const tag = openingTag(src, m.index);
    if (!/onClick/.test(tag)) continue;

    // Two patterns here are CORRECT, not defects, and counting them buries the
    // ones that are real:
    //
    //  · A MODAL BACKDROP that closes on click — a mouse convenience sitting
    //    beside a real Close button and an Escape handler (components/ui/overlay.js).
    //    Making it focusable adds a tab stop that announces nothing.
    //  · A CLICK-SWALLOWER whose handler only calls stopPropagation, so a click
    //    inside a panel does not reach the backdrop. It is not a control at all.
    const isSwallower = /onClick=\{\s*\(?e\)?\s*=>\s*e\.stopPropagation\(\)\s*\}/.test(tag);
    const isBackdrop = /e\.target === e\.currentTarget/.test(tag) ||
      (/position: 'fixed'/.test(tag) && /inset: 0/.test(tag));
    if (isSwallower || isBackdrop) continue;

    // A <tr> must KEEP its row semantics: role="button" on a row breaks the table
    // for anyone navigating it by rows and columns. Focusable + key-handling is the
    // bar there; anything else also needs a role so it is announced as actionable.
    const keyable = /tabIndex/.test(tag) && /onKeyDown|onKeyUp|onKeyPress/.test(tag);
    const ok = (el === 'tr' || el === 'td') ? keyable : (keyable && /role\s*=/.test(tag));
    if (!ok) {
      findings.clickableDiv.push({ file: rel(file), line: lineOf(m.index), snippet: tag.replace(/\s+/g, ' ').slice(0, 110) });
    }
  }

  // ── 3. Images with no alt ────────────────────────────────────────────────
  for (const m of src.matchAll(/<img\b/g)) {
    const tag = openingTag(src, m.index);
    if (!/\balt\s*=/.test(tag)) {
      findings.noAlt.push({ file: rel(file), line: lineOf(m.index), snippet: tag.replace(/\s+/g, ' ').slice(0, 110) });
    }
  }

  // ── 4. Inputs with no label ──────────────────────────────────────────────
  for (const m of src.matchAll(/<(input|textarea|select)\b/g)) {
    const tag = openingTag(src, m.index);
    if (/type\s*=\s*["']?(hidden|submit|button)/.test(tag)) continue;
    // A visually hidden file input triggered by a real button is not a control a
    // user ever reaches — the BUTTON is the control, and it has its own name.
    // Labelling the hidden input changes nothing anybody can perceive.
    if (/display: *'none'/.test(tag)) continue;

    // What actually gives a field a name, in descending order of quality:
    //   · aria-label / aria-labelledby   — explicit
    //   · id=, paired with a <label for> — the proper HTML way
    //   · title=                          — weak, but browsers DO expose it
    //   · being wrapped in a <label>      — implicit association, perfectly valid
    //   · being inside <Field>            — the shared primitive wires htmlFor/id
    //
    // A PLACEHOLDER is not in that list. Browsers fall back to it when nothing
    // else exists, so the field is not silent — but it vanishes the moment you
    // type, which is precisely when you might want to check what you are filling
    // in. Those are reported separately rather than counted as unlabelled.
    const named = /aria-label|aria-labelledby|\bid\s*=|\btitle\s*=/.test(tag);
    const before = src.slice(Math.max(0, m.index - 400), m.index);
    const wrapped = /<label\b[^>]*>(?:(?!<\/label>)[\s\S])*$/.test(before);
    const inField = /<Field\b/.test(before.slice(-260));

    if (!named && !wrapped && !inField) {
      const hasPlaceholder = /placeholder\s*=/.test(tag);
      const rec = { file: rel(file), line: lineOf(m.index), snippet: tag.replace(/\s+/g, ' ').slice(0, 110) };
      if (hasPlaceholder) findings.placeholderOnly.push(rec);
      else findings.unlabelledInput.push(rec);
    }
  }

  // ── 5. Dialogs with no name ──────────────────────────────────────────────
  for (const m of src.matchAll(/role\s*=\s*["']dialog["']/g)) {
    // `closest('[role="dialog"]')` is a selector, not an element. Only treat this
    // as JSX when an opening tag actually starts before it on the same statement.
    const start = src.lastIndexOf('<', m.index);
    if (start < 0) continue;
    const between = src.slice(start, m.index);
    if (/['"`\[]/.test(between.replace(/=\s*["'][^"']*["']/g, ''))) continue;
    const tag = openingTag(src, start);
    if (!/aria-label|aria-labelledby/.test(tag)) {
      findings.unnamedDialog.push({ file: rel(file), line: lineOf(m.index), snippet: tag.replace(/\s+/g, ' ').slice(0, 110) });
    }
  }
}

const total = Object.values(findings).reduce((a, v) => a + v.length, 0);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total, findings }, null, 2));
} else {
  const LABELS = {
    unnamed: 'Controls with NO ACCESSIBLE NAME (announced as just "button")',
    clickableDiv: 'CLICKABLE non-interactive elements (unreachable by keyboard)',
    noAlt: 'Images with no alt',
    unlabelledInput: 'Form fields with NO name at all (announced as "edit text, blank")',
    placeholderOnly: 'Form fields named ONLY by a placeholder (vanishes as you type)',
    unnamedDialog: 'Dialogs with no name',
  };
  for (const [k, list] of Object.entries(findings)) {
    console.log(`\n${LABELS[k]}: ${list.length}`);
    const byFile = {};
    for (const f of list) (byFile[f.file] ||= []).push(f.line);
    const worst = Object.entries(byFile).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
    for (const [f, lines] of worst) console.log(`  ${String(lines.length).padStart(3)}  ${f}  (${lines.slice(0, 6).join(', ')}${lines.length > 6 ? '…' : ''})`);
    if (Object.keys(byFile).length > 12) console.log(`       …and ${Object.keys(byFile).length - 12} more files`);
  }
  console.log(`\nTOTAL: ${total}`);
}

const failOn = process.argv.indexOf('--fail-on');
if (failOn > -1) {
  const budget = Number(process.argv[failOn + 1]);
  if (total > budget) {
    console.error(`\n❌ ${total} accessibility findings exceeds the budget of ${budget}.`);
    process.exitCode = 1;
  } else {
    console.log(`✅ within budget (${total} ≤ ${budget})`);
  }
}
