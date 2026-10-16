'use strict';
// Renders post-001.png (1080×1350 @2x) — "Converging Signal".
// Usage: node build-post-001.js <fonts dir> <out dir>
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const FONTS = process.argv[2];
const OUT = process.argv[3] || __dirname;
const W = 1080, H = 1350, M = 72;

// Deterministic: the same marks every render.
let seed = 0x5eed01;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

const IND = [99, 102, 241], VIO = [139, 92, 246], PNK = [236, 72, 153];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const ramp = (t) => (t < 0.5 ? mix(IND, VIO, t * 2) : mix(VIO, PNK, (t - 0.5) * 2));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// ── Composition anchors ──────────────────────────────────────────────────────
const GATE = { x: 540, y: 560, s: 104 };
const FIELD = { top: 176, bottom: 430 };
const CLUSTERS = [
  { name: 'WHATSAPP', cx: 252, col: IND },
  { name: 'INSTAGRAM', cx: 540, col: VIO },
  { name: 'FACEBOOK', cx: 828, col: PNK },
];
const RAIL_Y = 690, GRID_TOP = 724, STEP = 15;
const STAGES = [
  { name: 'LEAD', n: 30 }, { name: 'BOOKED', n: 21 }, { name: 'SIGNED', n: 15 },
  { name: 'GALLERY', n: 12 }, { name: 'PAID', n: 9 },
];
const COLX = [216, 378, 540, 702, 864];

// ── Scatter field: three loose clusters, one per channel ─────────────────────
const marks = [];
for (const c of CLUSTERS) {
  for (let i = 0; i < 52; i++) {
    const x = Math.max(M + 8, Math.min(W - M - 8, c.cx + gauss() * 120));
    const y = FIELD.top + Math.pow(rnd(), 0.85) * (FIELD.bottom - FIELD.top);
    const r = 1.6 + rnd() * 1.9;
    // keep the gate's approach clear of collisions
    if (Math.hypot(x - GATE.x, y - GATE.y) < 120) continue;
    if (marks.some((m) => Math.hypot(m.x - x, m.y - y) < m.r + r + 5)) continue;
    marks.push({ x: +x.toFixed(1), y: +y.toFixed(1), r: +r.toFixed(2), col: c.col });
  }
}

const gateTop = GATE.y - GATE.s / 2;
const filaments = marks.map((m) => {
  const c1y = m.y + (gateTop - m.y) * 0.62;
  return `<path d="M${m.x} ${m.y} C ${m.x} ${c1y.toFixed(1)}, ${GATE.x} ${(gateTop - 70).toFixed(1)}, ${GATE.x} ${(gateTop - 2).toFixed(1)}" stroke="${rgb(m.col, 0.16)}" stroke-width="0.7" fill="none"/>`;
}).join('');
const dots = marks.map((m) => `<circle cx="${m.x}" cy="${m.y}" r="${m.r}" fill="${rgb(m.col, 0.92)}"/>`).join('');

// ── Ordered register: the same marks, counted into stages ────────────────────
let grid = '', ticks = '', labels = '';
STAGES.forEach((st, i) => {
  const col = ramp(i / (STAGES.length - 1));
  const x0 = COLX[i] - STEP;
  for (let k = 0; k < st.n; k++) {
    const gx = x0 + (k % 3) * STEP, gy = GRID_TOP + Math.floor(k / 3) * STEP;
    grid += `<rect x="${gx - 3.5}" y="${gy - 3.5}" width="7" height="7" rx="2" fill="${rgb(col, 0.95)}"/>`;
  }
  ticks += `<line x1="${COLX[i]}" y1="${RAIL_Y}" x2="${COLX[i]}" y2="${GRID_TOP - 14}" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`;
  ticks += `<circle cx="${COLX[i]}" cy="${RAIL_Y}" r="2.6" fill="${rgb(col)}"/>`;
  labels += `<text x="${COLX[i]}" y="${GRID_TOP + 10 * STEP + 26}" class="mono" text-anchor="middle">${st.name}</text>`;
  labels += `<text x="${COLX[i]}" y="${GRID_TOP + 10 * STEP + 46}" class="mono dim" text-anchor="middle">${String(i + 1).padStart(2, '0')}</text>`;
});

const BOLT = 'M13 2 3 14h9l-1 8 10-12h-9l1-8z';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:WFSerif;src:url('file://${FONTS}/InstrumentSerif-Italic.ttf')}
@font-face{font-family:Sans;src:url('file://${FONTS}/InstrumentSans-Regular.ttf')}
@font-face{font-family:SansB;src:url('file://${FONTS}/InstrumentSans-Bold.ttf')}
@font-face{font-family:Mono;src:url('file://${FONTS}/GeistMono-Regular.ttf')}
html,body{margin:0;background:#08080f}
svg{display:block}
.mono{font-family:Mono;font-size:12px;letter-spacing:2.6px;fill:rgba(236,236,245,0.62)}
.dim{fill:rgba(236,236,245,0.30)}
</style></head><body>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="sky" cx="50%" cy="22%" r="70%"><stop offset="0" stop-color="#151431"/><stop offset="1" stop-color="#08080f"/></radialGradient>
  <radialGradient id="bloom" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${rgb(VIO, 0.42)}"/><stop offset="0.55" stop-color="${rgb(IND, 0.10)}"/><stop offset="1" stop-color="${rgb(IND, 0)}"/></radialGradient>
  <linearGradient id="gate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rgb(IND)}"/><stop offset="0.5" stop-color="${rgb(VIO)}"/><stop offset="1" stop-color="${rgb(PNK)}"/></linearGradient>
  <linearGradient id="rail" gradientUnits="userSpaceOnUse" x1="${COLX[0]}" y1="0" x2="${COLX[COLX.length - 1]}" y2="0"><stop offset="0" stop-color="${rgb(IND, 0.55)}"/><stop offset="0.5" stop-color="${rgb(VIO, 0.55)}"/><stop offset="1" stop-color="${rgb(PNK, 0.55)}"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>

<!-- plate header -->
<text x="${M}" y="96" class="mono">FIG. 001 — INBOUND</text>
<text x="${W - M}" y="96" class="mono" text-anchor="end">WAPPFLOW / FIELD NOTES</text>
<line x1="${M}" y1="116" x2="${W - M}" y2="116" stroke="rgba(255,255,255,0.10)"/>
${CLUSTERS.map((c) => `<text x="${c.cx}" y="152" class="mono dim" text-anchor="middle">${c.name}</text>`).join('')}

<!-- scatter → gate -->
${filaments}
${dots}
<circle cx="${GATE.x}" cy="${GATE.y}" r="190" fill="url(#bloom)"/>
<rect x="${GATE.x - GATE.s / 2}" y="${GATE.y - GATE.s / 2}" width="${GATE.s}" height="${GATE.s}" rx="28" fill="url(#gate)"/>
<rect x="${GATE.x - GATE.s / 2 + 0.5}" y="${GATE.y - GATE.s / 2 + 0.5}" width="${GATE.s - 1}" height="${GATE.s - 1}" rx="27.5" fill="none" stroke="rgba(255,255,255,0.22)"/>
<g transform="translate(${GATE.x - 26} ${GATE.y - 26}) scale(${52 / 24})"><path d="${BOLT}" fill="#fff"/></g>

<!-- gate → rail → register -->
<line x1="${GATE.x}" y1="${GATE.y + GATE.s / 2}" x2="${GATE.x}" y2="${RAIL_Y}" stroke="rgba(255,255,255,0.22)"/>
<line x1="${COLX[0]}" y1="${RAIL_Y}" x2="${COLX[COLX.length - 1]}" y2="${RAIL_Y}" stroke="url(#rail)" stroke-width="1.2"/>
${ticks}
${grid}
${labels}

<!-- the one sentence -->
<text x="${W / 2}" y="1062" text-anchor="middle" style="font-family:WFSerif;font-size:88px;fill:#f4f2ff;letter-spacing:-0.5px">Every chat, one flow.</text>
<text x="${W / 2}" y="1112" text-anchor="middle" style="font-family:Sans;font-size:23px;fill:rgba(226,224,240,0.66);letter-spacing:0.2px">From first message to final invoice — your whole studio in one place.</text>

<!-- signature -->
<line x1="${M}" y1="1196" x2="${W - M}" y2="1196" stroke="rgba(255,255,255,0.10)"/>
<text x="${M}" y="1268" class="mono dim">N° 001</text>
<g transform="translate(${W / 2 - 92} 1240)">
  <rect width="38" height="38" rx="10" fill="url(#gate)"/>
  <g transform="translate(8 8) scale(${22 / 24})"><path d="${BOLT}" fill="#fff"/></g>
  <text x="52" y="28" style="font-family:SansB;font-size:29px;fill:#f4f2ff;letter-spacing:-0.4px">WappFlow</text>
</g>
<text x="${W - M}" y="1268" class="mono dim" text-anchor="end">WAPPFLOW.REMOTEOPS.CO</text>
</svg></body></html>`;

(async () => {
  const htmlPath = path.join(OUT, 'post-001.html');
  fs.writeFileSync(htmlPath, html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await p.goto('file://' + htmlPath);
  // SVG text requests fonts lazily; load each face explicitly before the shot.
  await p.evaluate(async () => { for (const f of ['88px WFSerif', '23px Sans', '29px SansB', '12px Mono']) await document.fonts.load(f); await document.fonts.ready; });
  const loaded = await p.evaluate(() => ['WFSerif', 'Sans', 'SansB', 'Mono'].map((f) => f + ':' + document.fonts.check(`12px ${f}`)));
  console.log(loaded.join(' '));
  await p.waitForTimeout(300);
  // Nothing may touch the margins or each other: report every text box.
  const boxes = await p.evaluate(() => [...document.querySelectorAll('text')].map((t) => { const r = t.getBBox(); return { t: t.textContent, x: Math.round(r.x), r: Math.round(r.x + r.width), y: Math.round(r.y), b: Math.round(r.y + r.height) }; }));
  console.log(JSON.stringify(boxes.filter((b) => b.x < 72 || b.r > 1008)));
  console.log('marks:', (html.match(/<circle cx/g) || []).length);
  await p.screenshot({ path: path.join(OUT, 'post-001.png'), clip: { x: 0, y: 0, width: W, height: H } });
  await b.close();
  fs.unlinkSync(htmlPath);
})().catch((e) => { console.error(e); process.exit(1); });
