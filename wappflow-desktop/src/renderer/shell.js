'use strict';

// Renderer shell: auth gate, module switching, and the "one login" bridge that
// injects the workspace token into the cloud web app loaded in the <webview>.

const W = window.wappflow;

const MODULES = [
  { sec: 'Workspace' },
  { id: 'dashboard', label: 'Dashboard', icon: '▦', route: '/dashboard', cloud: true },
  { id: 'leads', label: 'Leads & Inbox', icon: '☷', route: '/leads-list', cloud: true },
  { id: 'clients', label: 'Clients', icon: '❏', route: '/clients', cloud: true },
  { sec: 'Studio' },
  { id: 'studio', label: 'Media Studio', icon: '◆', route: '/studio', cloud: true },
  { id: 'localai', label: 'Local AI', icon: '✦', cloud: false, badge: 'NEW' },
  { sec: 'Business' },
  { id: 'contracts', label: 'Contracts', icon: '✎', route: '/contracts', cloud: true },
  { id: 'booking', label: 'Booking', icon: '▤', route: '/bookings', cloud: true },
  { id: 'reports', label: 'Analytics', icon: '◷', route: '/reports', cloud: true },
];

let session = null;
let active = null;
let authInjected = false;

const $ = (id) => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle('active', on);

async function boot() {
  const info = await W.app.info();
  $('l-api').value = info.api || '';
  session = await W.auth.status();
  if (session && session.user) { renderApp(); } else { show('login', true); }
  W.auth.onChanged(async () => { session = await W.auth.status(); if (session) renderApp(); });
  wireLogin();
  wireWebview();
}

function wireLogin() {
  const submit = async () => {
    const email = $('l-email').value.trim();
    const password = $('l-pass').value;
    const api = $('l-api').value.trim();
    if (!email || !password) { $('l-err').textContent = 'Email and password required.'; return; }
    $('l-submit').disabled = true; $('l-err').textContent = '';
    try {
      const res = await W.auth.login({ email, password, api });
      if (res && res.ok) { session = res.session; show('login', false); renderApp(); }
      else { $('l-err').textContent = (res && res.error) || 'Sign in failed.'; }
    } catch (e) { $('l-err').textContent = String(e && e.message || e); }
    finally { $('l-submit').disabled = false; }
  };
  $('l-submit').onclick = submit;
  $('l-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function renderApp() {
  show('login', false);
  $('ws-name').textContent = (session.workspace && session.workspace.name) || (session.user && session.user.email) || 'Workspace';
  $('logout').onclick = async () => { await W.auth.logout(); session = null; authInjected = false; location.reload(); };

  const nav = $('nav'); nav.innerHTML = '';
  for (const m of MODULES) {
    if (m.sec) { const h = document.createElement('div'); h.className = 'sb-sec'; h.textContent = m.sec; nav.appendChild(h); continue; }
    const b = document.createElement('button');
    b.className = 'nav-item'; b.dataset.id = m.id;
    b.innerHTML = `<span class="ico">${m.icon}</span><span>${m.label}</span>${m.badge ? `<span class="badge">${m.badge}</span>` : ''}`;
    b.onclick = () => openModule(m);
    nav.appendChild(b);
  }
  openModule(MODULES.find(m => m.id === 'dashboard'));
}

function openModule(m) {
  if (!m) return;
  active = m.id;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.id === m.id));
  const wv = $('cloud');
  if (m.cloud) {
    show('local-ai', false);
    wv.classList.add('active');
    const url = (session.web || '').replace(/\/$/, '') + m.route;
    if (wv.getAttribute('src') !== url) wv.setAttribute('src', url);
  } else {
    wv.classList.remove('active');
    show('local-ai', true);
    if (window.LocalAI) window.LocalAI.activate();
  }
}

// One-login bridge: the cloud web app reads localStorage 'token'/'user'. Inject
// the desktop session into the webview's storage, then reload once so it boots
// authenticated — no second sign-in.
function wireWebview() {
  const wv = $('cloud');
  wv.addEventListener('dom-ready', async () => {
    if (!session || !session.token) return;
    try {
      const has = await wv.executeJavaScript("try{localStorage.getItem('token')}catch(e){null}");
      if (!has) {
        const t = JSON.stringify(session.token);
        const u = JSON.stringify(JSON.stringify(session.user || {}));
        const w = JSON.stringify(JSON.stringify(session.workspace || {}));
        await wv.executeJavaScript(`try{localStorage.setItem('token',${t});localStorage.setItem('user',${u});localStorage.setItem('workspace',${w});}catch(e){}`);
        if (!authInjected) { authInjected = true; wv.reload(); }
      }
    } catch {}
  });
}

document.addEventListener('DOMContentLoaded', boot);
