'use strict';

// Workspace auth — the desktop uses the SAME workspace JWT as the web app
// (POST /api/auth/login → { token, user, workspace }). Token is long-lived and
// carries only { userId }; the server resolves the workspace from it. We persist
// the session encrypted via Electron safeStorage so it survives restarts and the
// renderer can inject it into the cloud webview (one login).

const fs = require('fs');
const axios = require('axios');
const config = require('./config');

let session = null;       // { token, user, workspace, web, api }
let servers = null;       // { web, api } override

function loadServers() {
  if (servers) return servers;
  servers = { web: config.DEFAULT_WEB_URL, api: config.DEFAULT_API_URL };
  try {
    const raw = fs.readFileSync(config.configFile(), 'utf8');
    const c = JSON.parse(raw);
    if (c.web) servers.web = c.web;
    if (c.api) servers.api = c.api;
  } catch {}
  return servers;
}

function getServer() { return loadServers(); }

function setServer({ web, api } = {}) {
  const s = loadServers();
  if (web) s.web = web.replace(/\/$/, '');
  if (api) s.api = api.replace(/\/$/, '');
  // derive web from api if only api given (host without /api)
  if (api && !web) { try { s.web = api.replace(/\/?api\/?$/, ''); } catch {} }
  try { fs.mkdirSync(require('path').dirname(config.configFile()), { recursive: true }); } catch {}
  try { fs.writeFileSync(config.configFile(), JSON.stringify(s), 'utf8'); } catch {}
  return s;
}

// ── encrypted session persistence ───────────────────────────────────────────
function persist() {
  try {
    const { safeStorage } = require('electron');
    const json = JSON.stringify(session);
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8');
    fs.mkdirSync(require('path').dirname(config.sessionFile()), { recursive: true });
    fs.writeFileSync(config.sessionFile(), data);
  } catch (e) { /* best-effort */ }
}

function restore() {
  if (session) return session;
  try {
    const data = fs.readFileSync(config.sessionFile());
    const { safeStorage } = require('electron');
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8');
    session = JSON.parse(json);
  } catch { session = null; }
  return session;
}

function getSession() {
  const s = restore();
  if (!s || !s.token) return null;
  return s; // includes token so the renderer can inject it into the cloud webview
}

async function login({ email, password, api }) {
  const srv = api ? setServer({ api }) : loadServers();
  try {
    const res = await axios.post(`${srv.api.replace(/\/$/, '')}/auth/login`, { email, password }, { timeout: 20000 });
    const d = res.data || {};
    if (!d.token) return { ok: false, error: 'No token returned' };
    session = { token: d.token, user: d.user || null, workspace: d.workspace || null, web: srv.web, api: srv.api };
    persist();
    return { ok: true, session };
  } catch (e) {
    const msg = e.response && e.response.data && e.response.data.error ? e.response.data.error : (e.message || 'Login failed');
    return { ok: false, error: msg };
  }
}

// Deep-link / SSO token handoff seam (wappflow://auth?token=...)
async function adoptToken(token) {
  const srv = loadServers();
  session = { token, user: null, workspace: null, web: srv.web, api: srv.api };
  try {
    const me = await axios.get(`${srv.api.replace(/\/$/, '')}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
    session.user = me.data.user || null;
    session.workspace = me.data.workspace || null;
  } catch {}
  persist();
  return session;
}

function logout() {
  session = null;
  try { fs.unlinkSync(config.sessionFile()); } catch {}
  return { ok: true };
}

// Auth header for API clients (null if not signed in).
function authHeader() {
  const s = getSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

module.exports = { getServer, setServer, getSession, login, logout, adoptToken, authHeader };
