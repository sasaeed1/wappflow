'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Knowledge base: learn from a website.
//
//  The Knowledge page's "Crawl Website" button posts to /api/knowledge/crawl.
//  The route was added in f55e27e and lost in 4b3ada5, so for months the button
//  answered "not found" and nothing happened. Restored here as its own module,
//  with the guard a server-side fetch of a user-typed URL needs:
//
//  • SSRF: the server only ever connects to PUBLIC addresses. Every hostname is
//    resolved at connect time by safeLookup and refused if it points at a
//    private, loopback, link-local or otherwise internal address (the API
//    itself, the cloud metadata service, the LAN). Redirects are followed by
//    hand so each hop is checked the same way.
//  • Bounded: same site only, 40 pages, depth 3, 2 MB per page, 12 s per page,
//    one crawl at a time per workspace.
//  • Honest outcome: the document row says what happened in plain words
//    (couldn't open the site, read N pages but found nothing, AI not set up…).
// ════════════════════════════════════════════════════════════════════════════
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');

const MAX_PAGES = 40;
const MAX_DEPTH = 3;
const PAGE_TIMEOUT = 12000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

// Tests serve a site on 127.0.0.1; only loopback is allowed, only in test mode,
// so redirect-to-internal checks still run against every other private range.
const TEST_LOOPBACK = process.env.NODE_ENV === 'test' && process.env.CRAWL_ALLOW_LOOPBACK === '1';

/** Is this IP somewhere the server must never be made to connect to? */
function isPrivateIp(ip) {
  if (TEST_LOOPBACK && (ip === '127.0.0.1' || ip === '::1')) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true; // not an IP we understand → refuse
}

// Resolve, then refuse internal addresses. Used as the socket's lookup, so the
// address that is checked is the address that is connected to (no DNS rebinding).
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: net.isIPv6(addrs) ? 6 : 4 }];
    const bad = list.find((a) => isPrivateIp(a.address));
    if (!list.length || bad) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    const pick = list[0];
    if (options && options.all) return cb(null, list);
    cb(null, pick.address, pick.family);
  });
}

function normalizeUrl(input) {
  let u = String(input || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const p = new URL(u);
    if (!/^https?:$/.test(p.protocol) || !p.hostname.includes('.') && !net.isIP(p.hostname)) return null;
    if (p.username || p.password) return null;
    if (net.isIP(p.hostname) && isPrivateIp(p.hostname)) return null;
    return p;
  } catch { return null; }
}

/** GET one page. Resolves { html, finalUrl } or { error } (a plain-language reason code). */
function fetchPage(url, hops = 0) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch { return resolve({ error: 'bad_url' }); }
    if (net.isIP(u.hostname) && isPrivateIp(u.hostname)) return resolve({ error: 'blocked' });
    const mod = u.protocol === 'http:' ? http : https;
    const req = mod.request(u, {
      method: 'GET', lookup: safeLookup, timeout: PAGE_TIMEOUT,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WappFlowBot/1.0; +https://wappflow.app)', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
    }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (hops >= MAX_REDIRECTS) return resolve({ error: 'redirects' });
        let next; try { next = new URL(res.headers.location, u).toString(); } catch { return resolve({ error: 'bad_url' }); }
        return resolve(fetchPage(next, hops + 1));
      }
      if (code >= 400) { res.resume(); return resolve({ error: code === 403 || code === 401 ? 'forbidden' : code === 404 ? 'not_found' : 'http' }); }
      const ct = String(res.headers['content-type'] || '').toLowerCase();
      if (ct && !ct.includes('html')) { res.resume(); return resolve({ error: 'not_html' }); }
      let size = 0; const chunks = [];
      res.on('data', (c) => { size += c.length; if (size > MAX_BYTES) { req.destroy(); return; } chunks.push(c); });
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), finalUrl: u.toString() }));
      res.on('error', () => resolve({ error: 'network' }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', (e) => resolve({ error: e.code === 'EBLOCKED' ? 'blocked' : e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN' ? 'dns' : e.code === 'ETIMEDOUT' ? 'timeout' : String(e.code || '').startsWith('ERR_TLS') || /certificate/i.test(e.message) ? 'tls' : 'network' }));
    req.end();
  });
}

function htmlToText(html) {
  let t = html || '';
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<head[\s\S]*?<\/head>/gi, ' ');
  t = t.replace(/<\/(p|div|li|h[1-6]|tr|section|article)\s*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;|&rsquo;|&lsquo;/gi, "'").replace(/&[a-z]+;/gi, ' ');
  return t.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

function extractLinks(html, pageUrl, rootHost) {
  const links = new Set(); const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi; let m;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] || '').trim();
    if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
    let abs; try { abs = new URL(href, pageUrl); } catch { continue; }
    if (!/^https?:$/.test(abs.protocol) || abs.hostname.replace(/^www\./, '') !== rootHost) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|rar|mp4|mp3|avi|mov|css|js|ico|woff2?|ttf|xml|json)(\?|$)/i.test(abs.pathname)) continue;
    abs.hash = ''; links.add(abs.toString());
  }
  return [...links];
}

// What to tell the studio when the first page could not be read.
const REASON = {
  dns: 'We couldn’t find that website. Check the address is spelled correctly.',
  timeout: 'The website took too long to respond. Try again in a few minutes.',
  forbidden: 'The website blocked our reader. Some sites don’t allow automatic reading; try uploading a document instead.',
  not_found: 'That page doesn’t exist (404). Check the address.',
  not_html: 'That address isn’t a web page (it may be a file or an image).',
  tls: 'The website’s security certificate has a problem, so we couldn’t open it safely.',
  blocked: 'That address can’t be read. Enter a public website address.',
  redirects: 'The website kept redirecting us and never loaded.',
  http: 'The website returned an error. Try again later.',
  network: 'We couldn’t connect to the website. Check the address and try again.',
  bad_url: 'That doesn’t look like a website address. Try something like www.example.com.',
};

module.exports = function mountKnowledgeCrawler(app, db, deps) {
  const { auth, requirePerm, generateId, extractMemoriesFromText, aiAvailable = () => true } = deps;
  const running = new Set(); // workspace ids with a crawl in progress

  async function crawl(root, workspaceId, docId) {
    const rootHost = root.hostname.replace(/^www\./, '');
    const queue = [{ url: root.toString(), depth: 0 }];
    const visited = new Set(); const seenKeys = new Set(); const memories = [];
    let pages = 0, firstError = null, readable = 0;
    const canon = (u) => u.replace(/#.*$/, '').replace(/\/+$/, '');
    while (queue.length && pages < MAX_PAGES) {
      const { url, depth } = queue.shift();
      if (visited.has(canon(url))) continue;
      visited.add(canon(url));
      const r = await fetchPage(url);
      if (r.error) { if (!firstError) firstError = r.error; continue; }
      pages++;
      if (depth < MAX_DEPTH) for (const l of extractLinks(r.html, r.finalUrl, rootHost)) if (!visited.has(canon(l))) queue.push({ url: l, depth: depth + 1 });
      const text = htmlToText(r.html);
      if (text.length < 120) continue;
      readable++;
      let found = [];
      try { found = await extractMemoriesFromText(text, workspaceId); } catch { found = []; }
      for (const mem of found || []) {
        if (!mem || !mem.key || !mem.value) continue;
        const k = String(mem.key).toLowerCase().trim();
        if (seenKeys.has(k)) continue;
        seenKeys.add(k); memories.push(mem);
      }
      try { db.prepare('UPDATE knowledge_documents SET memory_count = ? WHERE id = ?').run(memories.length, docId); } catch {}
      await new Promise((r2) => setTimeout(r2, 200));
    }
    return { pages, readable, memories, firstError };
  }

  app.post('/api/knowledge/crawl', auth, requirePerm('manage_settings'), (req, res) => {
    const root = normalizeUrl(req.body && req.body.url);
    if (!root) return res.status(400).json({ error: REASON.bad_url });
    if (running.has(req.workspaceId)) return res.status(409).json({ error: 'A website is already being read. Wait for it to finish, then add another.' });
    if (!aiAvailable()) return res.status(503).json({ error: 'The AI isn’t set up on this server yet, so it can’t learn from websites. Ask your administrator to add an AI key.' });

    const docId = generateId();
    const domain = root.hostname.replace(/^www\./, '');
    db.prepare("INSERT INTO knowledge_documents (id, workspace_id, document_name, file_path, file_type, processed) VALUES (?, ?, ?, ?, 'website', 0)")
      .run(docId, req.workspaceId, domain, root.toString());
    res.status(201).json({ document: db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(docId), message: 'Reading the website now. This can take a few minutes.' });

    const workspaceId = req.workspaceId;
    running.add(workspaceId);
    setImmediate(async () => {
      try {
        const { pages, readable, memories, firstError } = await crawl(root, workspaceId, docId);
        const ins = db.prepare("INSERT OR REPLACE INTO ai_memories (id, workspace_id, memory_type, key, value, confidence, source, document_id) VALUES (?, ?, ?, ?, ?, ?, 'website', ?)");
        db.transaction(() => { for (const m of memories) ins.run(generateId(), workspaceId, m.memory_type || 'other', String(m.key).slice(0, 200), String(m.value).slice(0, 2000), m.confidence || 75, docId); })();
        let processed = 1, summary;
        if (!pages) { processed = 2; summary = REASON[firstError] || REASON.network; }
        else if (!readable) { processed = 2; summary = `We opened ${pages} page${pages > 1 ? 's' : ''} but they had almost no text to read. Sites built entirely with JavaScript can’t be read this way; try uploading a document instead.`; }
        else if (!memories.length) summary = `Read ${pages} page${pages > 1 ? 's' : ''} from ${domain} but didn’t find prices, services or policies to remember.`;
        else summary = `Read ${pages} page${pages > 1 ? 's' : ''} from ${domain} and learned ${memories.length} fact${memories.length > 1 ? 's' : ''}.`;
        db.prepare('UPDATE knowledge_documents SET memory_count = ?, extracted_text = ?, processed = ? WHERE id = ?').run(memories.length, summary, processed, docId);
      } catch (e) {
        console.error('Website crawl error:', e.message);
        try { db.prepare('UPDATE knowledge_documents SET processed = 2, extracted_text = ? WHERE id = ?').run('Something went wrong while reading the website. Please try again.', docId); } catch {}
      } finally { running.delete(workspaceId); }
    });
  });

  return { isPrivateIp, normalizeUrl, fetchPage };
};
module.exports.isPrivateIp = isPrivateIp;
module.exports.normalizeUrl = normalizeUrl;
