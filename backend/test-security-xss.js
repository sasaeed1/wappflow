'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  SECURITY — the HTML sanitiser.
//
//  THE BUG THIS PINS: app/leads/[id]/page.js rendered INBOUND EMAIL BODIES with
//  dangerouslySetInnerHTML and no sanitiser. An inbound email is
//  attacker-controlled by definition — anyone who knows a studio's connected
//  address can send one — so that was stored XSS inside an authenticated CRM
//  session. A single <img onerror> could read the session token out of
//  localStorage and walk the whole workspace through the API.
//
//  An identical sanitiser already existed in app/chat/page.js and was used
//  correctly there. Present in one file, forgotten in another: the same class of
//  bug as three copies of a WhatsApp type mapping that disagreed with each other.
//
//  These drive the REAL module through jsdom rather than asserting on its source,
//  because a sanitiser that merely looks strict is worth nothing.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch {
  console.log('  ⚠ jsdom not installed — cannot execute the sanitiser.');
  console.log('    npm i -D jsdom in backend/, then re-run. Skipping (not a pass).');
  process.exitCode = 0;
  return;
}

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  ✓', n); pass++; }
  catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

(async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://wappflow.test/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;

  const mod = await import(pathToFileURL(
    path.join(__dirname, '..', 'wappflow-web', 'src', 'lib', 'sanitizeHtml.js')
  ).href);
  const clean = mod.sanitizeHtml;

  console.log('\n[1] script execution vectors are neutralised');

  const VECTORS = [
    ['<script>alert(1)</script>', 'script'],
    ['<img src=x onerror="alert(1)">', 'onerror'],
    ['<svg/onload=alert(1)>', 'svg onload'],
    ['<iframe src="javascript:alert(1)"></iframe>', 'iframe'],
    ['<body onload=alert(1)>', 'body onload'],
    ['<div onclick="alert(1)">x</div>', 'inline handler on an allowed tag'],
    ['<a href="javascript:alert(1)">click</a>', 'javascript: href'],
    ['<a href="JaVaScRiPt:alert(1)">click</a>', 'mixed-case javascript:'],
    ['<a href=" javascript:alert(1)">click</a>', 'leading-space javascript:'],
    ['<object data="x"></object>', 'object'],
    ['<embed src="x">', 'embed'],
    ['<form action="/x"><input name="a"></form>', 'form'],
    ['<style>body{background:url(javascript:alert(1))}</style>', 'style block'],
    ['<div style="background:url(javascript:alert(1))">x</div>', 'style attribute'],
    ['<!--[if IE]><script>alert(1)</script><![endif]-->', 'conditional comment'],
    ['<meta http-equiv="refresh" content="0;url=//evil">', 'meta refresh'],
    ['<base href="//evil/">', 'base tag'],
  ];

  for (const [payload, label] of VECTORS) {
    check(`${label} cannot survive`, () => {
      const out = clean(payload);
      assert(!/<script/i.test(out), 'a <script> tag survived');
      assert(!/\son\w+\s*=/i.test(out), 'an inline event handler survived: ' + out);
      assert(!/javascript:/i.test(out), 'a javascript: URL survived: ' + out);
      assert(!/<(iframe|object|embed|form|style|meta|base|svg)/i.test(out), 'a dangerous element survived: ' + out);
    });
  }

  console.log('\n[2] the message is still readable afterwards');

  check('formatting is preserved', () => {
    const out = clean('<p>Hi <b>there</b>, see <i>below</i>.</p>');
    assert(/<b>there<\/b>/.test(out), 'bold was stripped: ' + out);
    assert(/<i>below<\/i>/.test(out), 'italic was stripped: ' + out);
  });

  check('email structure survives — tables and headings', () => {
    // Without these an HTML email collapses into one run-on paragraph, which is
    // the reason someone reached for raw rendering in the first place.
    const out = clean('<h2>Quote</h2><table><tr><td>Coverage</td><td>1000</td></tr></table>');
    assert(/<h2>/i.test(out) && /<table>/i.test(out) && /<td>/i.test(out), 'structure lost: ' + out);
  });

  check('a disallowed wrapper keeps its TEXT, so nothing is silently deleted', () => {
    const out = clean('<font color="red">important terms</font>');
    assert(out.includes('important terms'), 'the words were deleted with the tag: ' + out);
    assert(!/<font/i.test(out));
  });

  check('safe links survive and are made safe to click', () => {
    const out = clean('<a href="https://example.com">site</a>');
    assert(/href="https:\/\/example\.com"/.test(out), 'the link was dropped: ' + out);
    assert(/rel="[^"]*noopener/.test(out), 'no rel=noopener — the target page gets window.opener');
    assert(/target="_blank"/.test(out));
  });

  check('mailto and tel links survive', () => {
    assert(/href="mailto:a@b\.com"/.test(clean('<a href="mailto:a@b.com">mail</a>')));
    assert(/href="tel:\+123"/.test(clean('<a href="tel:+123">call</a>')));
  });

  console.log('\n[3] it never throws, whatever it is handed');

  check('malformed and hostile input degrades to something safe', () => {
    for (const bad of ['', null, undefined, '<div><div><div>unclosed', '<<<>>>', 'plain text', '<a href>x</a>', '<p'.repeat(500)]) {
      const out = clean(bad);
      assert(typeof out === 'string', 'returned a non-string for ' + JSON.stringify(bad));
      assert(!/<script/i.test(out));
    }
  });

  check('deep nesting does not blow the stack', () => {
    const deep = '<div>'.repeat(400) + 'x' + '</div>'.repeat(400);
    assert(typeof clean(deep) === 'string');
  });

  console.log('\n[4] the callers actually use it');

  const fs = require('fs');
  const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
  check('no page renders untrusted HTML without sanitising', () => {
    const offenders = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d)) {
        const fp = path.join(d, f);
        if (fs.statSync(fp).isDirectory()) { walk(fp); continue; }
        if (!f.endsWith('.js')) continue;
        // The sanitiser's own file QUOTES the vector it exists to stop.
        if (fp.endsWith(path.join('lib', 'sanitizeHtml.js'))) continue;
        const src = fs.readFileSync(fp, 'utf8');
        const re = /dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+)\}\}/g;
        let m;
        while ((m = re.exec(src))) {
          const expr = m[1].trim();
          // A static template we wrote ourselves is fine; a VARIABLE is not,
          // unless it demonstrably came out of the sanitiser.
          const isStaticTemplate = expr.startsWith('`') && !expr.includes('${');
          if (isStaticTemplate || expr.includes('sanitizeHtml') || expr.includes('buildInvoiceHTML')) continue;
          // A bare identifier assigned from sanitizeHtml() in the same file is
          // sanitised — just not at the point of use.
          const ident = expr.match(/^([A-Za-z_$][\w$]*)$/);
          if (ident && new RegExp(`\\b${ident[1]}\\s*=\\s*sanitizeHtml\\(`).test(src)) continue;
          offenders.push(`${path.relative(WEB, fp)} → ${expr.slice(0, 60)}`);
        }
      }
    };
    walk(WEB);
    assert.strictEqual(offenders.length, 0, 'unsanitised HTML render:\n    ' + offenders.join('\n    '));
  });

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
})();
