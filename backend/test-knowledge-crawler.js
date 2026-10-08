'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Knowledge → "Crawl Website": the route exists again, crawls a site, stores
//  what it learned, explains failures in plain words, and never fetches an
//  internal address (SSRF).
//    NODE_ENV=test CRAWL_ALLOW_LOOPBACK=1 node test-knowledge-crawler.js
// ════════════════════════════════════════════════════════════════════════════
process.env.NODE_ENV = 'test'; process.env.CRAWL_ALLOW_LOOPBACK = '1';
const express = require('express'); const http = require('http'); const Database = require('better-sqlite3');
const crawler = require('./knowledge-crawler');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A small public-looking site on loopback.
const pages = {
  '/': '<html><body><h1>Lumen Studio</h1><p>We photograph weddings and families across the city, with a team of three photographers.</p><a href="/pricing">Pricing</a> <a href="/about#team">About</a> <a href="mailto:x@y.z">Mail</a> <a href="https://elsewhere.example/">Out</a></body></html>',
  '/pricing': '<html><body><h2>Pricing</h2><p>Wedding collection 2400 dollars. Family session 350 dollars. A thirty percent retainer secures your date.</p><a href="/">Home</a></body></html>',
  '/about': '<html><body><p>Founded in 2015 by two friends who love light. We travel anywhere and reply within a day to every enquiry.</p></body></html>',
  '/to-metadata': null,
};
const site = http.createServer((req, res) => {
  if (req.url === '/to-metadata') { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); return res.end(); }
  const html = pages[req.url.split('?')[0]];
  if (html == null) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html);
}).listen(0);
const SITE = `http://127.0.0.1:${site.address().port}`;

const db = new Database(':memory:');
db.exec(`CREATE TABLE knowledge_documents (id TEXT PRIMARY KEY, workspace_id TEXT, document_name TEXT, file_path TEXT, file_type TEXT, extracted_text TEXT, memory_count INTEGER DEFAULT 0, processed INTEGER DEFAULT 0, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE ai_memories (id TEXT PRIMARY KEY, workspace_id TEXT, memory_type TEXT, key TEXT, value TEXT, confidence INTEGER, source TEXT, document_id TEXT, created_at TIMESTAMP, updated_at TIMESTAMP);`);
let n = 0; let aiOn = true; let allowed = true;
const app = express(); app.use(express.json());
crawler(app, db, {
  auth: (req, res, next) => { req.workspaceId = 'ws1'; next(); },
  requirePerm: () => (req, res, next) => (allowed ? next() : res.status(403).json({ error: 'permission_denied' })),
  generateId: () => `id${++n}`,
  aiAvailable: () => aiOn,
  // Stand-in for the AI: "learn" any line mentioning dollars.
  extractMemoriesFromText: async (text) => text.split('\n').filter((l) => /dollars/.test(l)).flatMap((l) => l.split('.').filter((x) => /dollars/.test(x)).map((x) => ({ memory_type: 'pricing', key: x.trim().split(' ').slice(0, 2).join(' '), value: x.trim(), confidence: 90 }))),
});
const api = http.createServer(app).listen(0);
const post = async (body) => { const r = await fetch(`http://127.0.0.1:${api.address().port}/api/knowledge/crawl`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const doc = (id) => db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(id);
const waitDone = async (id) => { for (let i = 0; i < 60 && doc(id).processed === 0; i++) await sleep(100); return doc(id); };

(async () => {
  try {
    console.log('\n[1] The route exists and crawls the site');
    let r = await post({ url: SITE });
    ok(r.status === 201 && r.body.document, `crawl accepted (${r.status})`);
    const d = await waitDone(r.body.document.id);
    ok(d.processed === 1, 'finished successfully');
    const mems = db.prepare('SELECT * FROM ai_memories WHERE document_id = ?').all(d.id);
    ok(mems.length === 2 && mems.every((m) => /dollars/.test(m.value)), `learned the pricing facts from a sub-page (${mems.length})`);
    ok(/Read 3 pages/.test(d.extracted_text), `plain summary: "${d.extracted_text}"`);

    console.log('\n[2] Plain-language refusals');
    r = await post({ url: 'not a website' });
    ok(r.status === 400 && /doesn’t look like a website address/.test(r.body.error), 'nonsense input is explained');
    aiOn = false; r = await post({ url: SITE }); aiOn = true;
    ok(r.status === 503 && /AI isn’t set up/.test(r.body.error), 'no AI configured is explained');
    allowed = false; r = await post({ url: SITE }); allowed = true;
    ok(r.status === 403, 'a member without settings permission cannot start a crawl');
    r = await post({ url: `${SITE}/missing` });
    const miss = await waitDone(r.body.document.id);
    ok(miss.processed === 2 && /doesn’t exist \(404\)/.test(miss.extracted_text), `a 404 says so: "${miss.extracted_text}"`);

    console.log('\n[3] SSRF: internal addresses are never fetched');
    for (const u of ['http://10.0.0.5', 'http://169.254.169.254/latest/meta-data', 'http://192.168.1.1', 'http://[fd00::1]/', 'http://user:pw@example.com']) {
      r = await post({ url: u });
      ok(r.status === 400, `refused up front: ${u}`);
    }
    r = await post({ url: `${SITE}/to-metadata` });
    const red = await waitDone(r.body.document.id);
    ok(red.processed === 2 && /can’t be read/.test(red.extracted_text), 'a redirect to the cloud metadata address is blocked');
    ok(crawler.isPrivateIp('172.20.1.1') && crawler.isPrivateIp('100.64.0.1') && crawler.isPrivateIp('::ffff:10.0.0.1') && !crawler.isPrivateIp('8.8.8.8'), 'private ranges classified correctly');
  } catch (e) { fail++; console.error('  ✗ crashed:', e.stack); }
  site.close(); api.close();
  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
