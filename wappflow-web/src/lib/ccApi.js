'use client';
// Command Center API client. Separate identity from the normal app: platform admins
// authenticate with their own token (cc_token, JWT aud "command-center"), stored apart
// from the workspace `token` so the two sessions never collide.
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

const cc = axios.create({ baseURL: API_URL });

cc.interceptors.request.use((c) => {
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem('cc_token');
    // Don't clobber an explicitly-set Authorization (e.g. the elevated step-up token
    // the SQL console passes for /cc/db/query).
    if (t && !c.headers.Authorization) c.headers.Authorization = `Bearer ${t}`;
  }
  return c;
});

cc.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && typeof window !== 'undefined' && !location.pathname.endsWith('/control/login')) {
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_admin');
      location.href = '/control/login';
    }
    return Promise.reject(e);
  }
);

export const ccAuth = {
  login: (email, password) => cc.post('/cc/login', { email, password }),
  me: () => cc.get('/cc/me'),
  stepUp: (password) => cc.post('/cc/step-up', { password }),
};

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
  sqlQuery: (sql, elevatedToken) => cc.post('/cc/db/query', { sql }, elevatedToken ? { headers: { Authorization: `Bearer ${elevatedToken}` } } : undefined),
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
};

// ── small shared formatters ──
export const fmtBytes = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(1)} ${u[i]}`;
};
export const fmtMoney = (n) => `$${(Number(n) || 0).toLocaleString()}`;
export const fmtNum = (n) => (Number(n) || 0).toLocaleString();

export default cc;
