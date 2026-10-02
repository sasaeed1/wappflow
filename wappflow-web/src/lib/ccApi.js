'use client';
// Command Center API client. Separate identity from the normal app: platform admins
// authenticate with their own token (cc_token, JWT aud "command-center"), stored apart
// from the workspace `token` so the two sessions never collide.
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

const cc = axios.create({ baseURL: API_URL });

// ── Step-up, in one place ────────────────────────────────────────────────────
// High-risk routes answer 403 { need_step_up } until the admin re-confirms with
// password + authenticator code. ControlShell registers the dialog that collects
// those; this client then retries the original request with the 5-minute
// elevated token, and keeps using it until it expires. No page handles step-up
// on its own.
let elevated = { token: null, exp: 0 };
let stepUpHandler = null;
export const setStepUpHandler = (fn) => { stepUpHandler = fn; };
export const setElevatedToken = (token, seconds = 300) => { elevated = { token, exp: Date.now() + (seconds - 10) * 1000 }; };
export const isElevated = () => !!elevated.token && elevated.exp > Date.now();

cc.interceptors.request.use((c) => {
  if (typeof window !== 'undefined' && !c.headers.Authorization) {
    const t = isElevated() && !c.noElevate ? elevated.token : localStorage.getItem('cc_token');
    if (t) c.headers.Authorization = `Bearer ${t}`;
  }
  return c;
});

const NO_LOGOUT_ON_401 = ['/cc/step-up', '/cc/login', '/cc/login/mfa', '/cc/mfa/setup', '/cc/mfa/enable', '/cc/mfa/recovery-codes'];
cc.interceptors.response.use(
  (r) => r,
  async (e) => {
    const cfg = e.config || {};
    if (e.response?.status === 403 && e.response.data?.need_step_up && !cfg._stepped && stepUpHandler) {
      const token = await stepUpHandler(e.response.data.error);
      if (token) {
        setElevatedToken(token);
        return cc({ ...cfg, _stepped: true, headers: { ...cfg.headers, Authorization: `Bearer ${token}` } });
      }
    }
    if (e.response?.status === 401 && typeof window !== 'undefined'
        && !NO_LOGOUT_ON_401.some((u) => (cfg.url || '').endsWith(u))
        && !location.pathname.endsWith('/control/login')) {
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_admin');
      location.href = '/control/login';
    }
    return Promise.reject(e);
  }
);

export const ccAuth = {
  login: (email, password) => cc.post('/cc/login', { email, password }),
  loginMfa: (mfa_token, code) => cc.post('/cc/login/mfa', { mfa_token, code }),
  mfaSetup: (mfa_token) => cc.post('/cc/mfa/setup', { mfa_token }),
  mfaEnable: (mfa_token, code) => cc.post('/cc/mfa/enable', { mfa_token, code }),
  me: () => cc.get('/cc/me'),
  logout: () => cc.post('/cc/logout'),
  stepUp: (password, code) => cc.post('/cc/step-up', { password, code }, { noElevate: true }),
  newRecoveryCodes: (code) => cc.post('/cc/mfa/recovery-codes', { code }),
};

// Downloads go through the authorised client and a blob — never a URL carrying a
// token (that put admin credentials into browser history and server logs).
export async function ccDownload(path, params = {}, fallbackName = 'export') {
  const r = await cc.get(path, { params, responseType: 'blob' });
  const cd = r.headers['content-disposition'] || '';
  const name = (/filename="?([^";]+)"?/.exec(cd) || [])[1] || fallbackName;
  const url = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// The live event stream: a 60-second ticket, never the session token, in the URL.
export async function ccEventStreamUrl() {
  const r = await cc.post('/cc/events/stream-ticket');
  return `${API_URL}/cc/events/stream?ticket=${encodeURIComponent(r.data.ticket)}`;
}

export const ccApi = {
  overview: () => cc.get('/cc/overview'),
  workspaces: (params) => cc.get('/cc/workspaces', { params }),
  workspace: (id) => cc.get(`/cc/workspaces/${id}`),
  suspend: (id, reason) => cc.post(`/cc/workspaces/${id}/suspend`, { reason }),
  restore: (id) => cc.post(`/cc/workspaces/${id}/restore`),
  addNote: (id, body) => cc.post(`/cc/workspaces/${id}/notes`, { body }),
  impersonate: (id, mode) => cc.post(`/cc/workspaces/${id}/impersonate`, { mode }),
  plans: () => cc.get('/cc/plans'),
  createPlan: (d) => cc.post('/cc/plans', d),
  updatePlan: (key, d) => cc.put(`/cc/plans/${key}`, d),
  setWorkspacePlan: (id, plan) => cc.post(`/cc/workspaces/${id}/plan`, { plan }),
  flags: () => cc.get('/cc/flags'),
  createFlag: (d) => cc.post('/cc/flags', d),
  updateFlag: (key, d) => cc.put(`/cc/flags/${key}`, d),
  assignFlag: (key, d) => cc.post(`/cc/flags/${key}/assign`, d),
  overrides: (id) => cc.get(`/cc/workspaces/${id}/overrides`),
  addOverride: (id, d) => cc.post(`/cc/workspaces/${id}/overrides`, d),
  delOverride: (id) => cc.delete(`/cc/overrides/${id}`),
  grace: (id, d) => cc.post(`/cc/workspaces/${id}/grace`, d),
  setModule: (id, mod, enabled) => cc.post(`/cc/workspaces/${id}/modules/${mod}`, { enabled }),
  events: (params) => cc.get('/cc/events', { params }),
  audit: (params) => cc.get('/cc/audit', { params }),
  auditOne: (id) => cc.get(`/cc/audit/${id}`),
  search: (q) => cc.get('/cc/search', { params: { q } }),
  ai: () => cc.get('/cc/ai'),
  health: (sort) => cc.get('/cc/health', { params: { sort } }),
  adoption: () => cc.get('/cc/adoption'),
  runRollup: () => cc.post('/cc/rollup/run'),
  inbox: () => cc.get('/cc/inbox'),
  dismissInbox: (id) => cc.post(`/cc/inbox/${id}/dismiss`),
  // DB Explorer + read-only SQL console
  dbTables: () => cc.get('/cc/db/tables'),
  dbTable: (name, params) => cc.get(`/cc/db/tables/${encodeURIComponent(name)}`, { params }),
  sqlQuery: (sql) => cc.post('/cc/db/query', { sql }),
  // Support ops
  tickets: (params) => cc.get('/cc/tickets', { params }),
  createTicket: (d) => cc.post('/cc/tickets', d),
  ticket: (id) => cc.get(`/cc/tickets/${id}`),
  updateTicket: (id, d) => cc.put(`/cc/tickets/${id}`, d),
  ticketComment: (id, d) => cc.post(`/cc/tickets/${id}/comment`, d),
  supportStats: () => cc.get('/cc/support/stats'),
  // Time Machine
  timeMachine: (params) => cc.get('/cc/timemachine', { params }),
  // Report engine
  reports: () => cc.get('/cc/reports'),
  createReport: (d) => cc.post('/cc/reports', d),
  deleteReport: (id) => cc.delete(`/cc/reports/${id}`),
  runReport: (id) => cc.post(`/cc/reports/${id}/run`),
  config: (ns) => cc.get(`/cc/config/${ns}`),
  setConfig: (ns, d) => cc.put(`/cc/config/${ns}`, d),
  // Desktop fleet management (Phase 7)
  desktopFleet: () => cc.get('/cc/desktop/fleet'),
  setDesktopPolicy: (d) => cc.post('/cc/desktop/policy', d),
  // Storage dashboard (Phase 10)
  storageOverview: () => cc.get('/cc/storage/overview'),
  storageWorkspaces: () => cc.get('/cc/storage/workspaces'),
  storageWorkspace: (id) => cc.get(`/cc/storage/workspace/${id}`),
  storageByPlan: () => cc.get('/cc/storage/by-plan'),
  storageFastestGrowing: () => cc.get('/cc/storage/fastest-growing'),
  // PROP-005
  deleteNote: (noteId) => cc.delete(`/cc/notes/${noteId}`),
  pinNote: (noteId, pinned) => cc.patch(`/cc/notes/${noteId}`, { pinned }),
  usage: (id, days = 30) => cc.get(`/cc/workspaces/${id}/usage`, { params: { days } }),
  platformUsage: (days = 30) => cc.get('/cc/usage/platform', { params: { days } }),
  views: (surface) => cc.get(`/cc/views/${surface}`),
  saveView: (surface, name, query) => cc.post(`/cc/views/${surface}`, { name, query }),
  deleteView: (id) => cc.delete(`/cc/views/${id}`),
  endGrace: (graceId) => cc.post(`/cc/grace/${graceId}/end`),
  bulk: (action, workspace_ids, params = {}) => cc.post('/cc/bulk', { action, workspace_ids, params }),
  clonePlan: (key, d) => cc.post(`/cc/plans/${key}/clone`, d),
  killFlag: (key, reason) => cc.post(`/cc/flags/${key}/kill`, { reason }),
  impersonations: () => cc.get('/cc/impersonations'),
  endImpersonation: (id) => cc.post(`/cc/impersonations/${id}/end`),
  // Billing
  billingOverview: () => cc.get('/cc/billing/overview'),
  subscriptions: (status) => cc.get('/cc/billing/subscriptions', { params: { status } }),
  wsBilling: (id) => cc.get(`/cc/workspaces/${id}/billing`),
  saveSubscription: (id, d) => cc.put(`/cc/workspaces/${id}/subscription`, d),
  subscriptionAction: (id, action, reason) => cc.post(`/cc/workspaces/${id}/subscription/${action}`, { reason }),
  billingEntry: (id, d) => cc.post(`/cc/workspaces/${id}/billing/entries`, d),
  runBilling: () => cc.post('/cc/billing/run'),
  // System
  system: () => cc.get('/cc/system'),
  // Admins & security
  admins: () => cc.get('/cc/admins'),
  inviteAdmin: (d) => cc.post('/cc/admins', d),
  updateAdmin: (id, d) => cc.patch(`/cc/admins/${id}`, d),
  resetAdmin2fa: (id) => cc.post(`/cc/admins/${id}/reset-2fa`),
  resetAdminPassword: (id) => cc.post(`/cc/admins/${id}/reset-password`),
  signOutAdmin: (id) => cc.post(`/cc/admins/${id}/sign-out`),
  changeMyPassword: (current, next) => cc.post('/cc/me/password', { current, next }),
  myActivity: () => cc.get('/cc/me/activity'),
  // Message explorer
  searchMessages: (params) => cc.get('/cc/messages/search', { params }),
  thread: (leadId) => cc.get(`/cc/messages/thread/${leadId}`),
};

// ── small shared formatters ──
export const fmtBytes = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(1)} ${u[i]}`;
};
export const fmtMoney = (n, cents = false) => `$${(Number(n) || 0).toLocaleString('en-US', cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
// SQLite timestamps are UTC without a zone marker; parse them as UTC.
export const fmtWhen = (v) => { if (!v) return '—'; const s = String(v); const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); return isNaN(d) ? s : d.toLocaleString(); };
export const fmtAgo = (v) => { if (!v) return 'never'; const s = String(v); const t = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').getTime(); const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 48) return `${h} h ago`; return `${Math.round(h / 24)} days ago`; };
export const fmtNum = (n) => (Number(n) || 0).toLocaleString();

export default cc;
