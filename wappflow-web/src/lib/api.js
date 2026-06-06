import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    const isAuthPage = typeof window !== 'undefined' &&
      ['/login', '/signup', '/accept-invite'].some(p => window.location.pathname.startsWith(p));
    if (err.response?.status === 401 && typeof window !== 'undefined' && !isAuthPage) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  google: (data) => api.post('/auth/google', data),
  changePassword: (data) => api.put('/auth/password', data),
};

export const profileAPI = {
  get: () => api.get('/profile'),
  update: (data) => api.put('/profile', data),
  uploadAvatar: (formData) => api.post('/profile/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const leadsAPI = {
  getAll: (params) => api.get('/leads', { params }),
  getById: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  updateStatus: (id, data) => api.put(`/leads/${id}/status`, data),
  deleteLead: (id) => api.delete(`/leads/${id}`),
  restore: (id) => api.post(`/leads/${id}/restore`),
  permanentDelete: (id) => api.delete(`/leads/${id}/permanent`),
  getTrash: () => api.get('/leads/trash'),
  bulkUpload: (leads) => api.post('/leads/bulk-upload', { leads }),
  bulkAssign: (lead_ids, assigned_to) => api.post('/leads/bulk-assign', { lead_ids, assigned_to }),
  roundRobin: (lead_ids, user_ids) => api.post('/leads/round-robin', { lead_ids, ...(user_ids ? { user_ids } : {}) }),
  bulkTrash: (lead_ids) => api.post('/leads/bulk-trash', { lead_ids }),

  // Messages
  getMessages: (id, platform) => api.get(`/leads/${id}/messages`, { params: platform ? { platform } : {} }),
  sendMessage: (id, body, platform) => api.post(`/leads/${id}/messages`, { body, platform }),
  sendMedia: (id, formData) => api.post(`/leads/${id}/messages/media`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  sendVoice: (id, formData) => api.post(`/leads/${id}/messages/voice`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  syncMessages: (id) => api.post(`/leads/${id}/messages/sync`),

  // Notes
  addNote: (id, content) => api.post(`/leads/${id}/notes`, { content }),
  deleteNote: (noteId) => api.delete(`/notes/${noteId}`),

  // Reminders
  addReminder: (id, data) => api.post(`/leads/${id}/reminders`, data),
  toggleReminder: (id) => api.put(`/reminders/${id}/toggle`),

  // History
  getHistory: (id) => api.get(`/leads/${id}/history`),

  // Invoices
  getInvoices: (leadId) => api.get(`/leads/${leadId}/invoices`),

  // Email workflows
  getEmailWorkflows: (id) => api.get(`/leads/${id}/email-workflows`),
  createEmailWorkflow: (id, data) => api.post(`/leads/${id}/email-workflows`, data),
};

export const tagsAPI = {
  getAll: () => api.get('/tags'),
  create: (data) => api.post('/tags', data),
  update: (id, data) => api.put(`/tags/${id}`, data),
  delete: (id) => api.delete(`/tags/${id}`),
  assign: (leadId, tagId) => api.post(`/leads/${leadId}/tags/${tagId}`),
  remove: (leadId, tagId) => api.delete(`/leads/${leadId}/tags/${tagId}`),
};

export const presetsAPI = {
  getAll: () => api.get('/presets'),
  create: (data) => api.post('/presets', data),
  update: (id, data) => api.put(`/presets/${id}`, data),
  delete: (id) => api.delete(`/presets/${id}`),
};

export const analyticsAPI = {
  get: () => api.get('/analytics'),
  getReports: (periodOrParams) => {
    // Backwards-compatible: accepts either '30' (period in days) or { period, start_date, end_date }
    const params = typeof periodOrParams === 'string' || typeof periodOrParams === 'number'
      ? { period: periodOrParams }
      : periodOrParams;
    return api.get('/reports/overview', { params });
  },
};

export const settingsAPI = {
  getCompany: () => api.get('/settings/company'),
  updateCompany: (data) => api.put('/settings/company', data),
  uploadLogo: (formData) => api.post('/settings/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getEmailSmtp: () => api.get('/settings/email-smtp'),
  updateEmailSmtp: (data) => api.put('/settings/email-smtp', data),
  testEmailSmtp: () => api.post('/settings/email-smtp/test'),
};

export const leadEmailsAPI = {
  getAll: (leadId) => api.get(`/leads/${leadId}/emails`),
  send: (leadId, data) => api.post(`/leads/${leadId}/email`, data),
  pollNow: () => api.post('/settings/email-imap/poll-now'),
};

export const teamAPI = {
  getAll: () => api.get('/team'),
  create: (data) => api.post('/team', data),
  update: (id, data) => api.put(`/team/${id}`, data),
  delete: (id) => api.delete(`/team/${id}`),
};

export const workspaceAPI = {
  get: () => api.get('/workspace'),
  update: (data) => api.put('/workspace', data),
  invite: (data) => api.post('/workspace/invite', data),
  updateMember: (id, data) => api.put(`/workspace/members/${id}`, data),
  removeMember: (id) => api.delete(`/workspace/members/${id}`),
  getRolePermissions: () => api.get('/workspace/role-permissions'),
  updateRolePermissions: (role, permissions) => api.put('/workspace/role-permissions', { role, permissions }),
  getPlan: () => api.get('/workspace/plan'),
};

// Cross-app SSO — mints a Flux session token. Server gates it by plan tier.
export const ssoAPI = {
  mintFluxToken: () => api.post('/sso/flux-token'),
};

// Lost reasons — workspace-scoped list used by settings + leads/[id].
// Backend endpoints land in a follow-up; clients tolerate 404s gracefully.
export const lostReasonsAPI = {
  getAll: () => api.get('/lost-reasons'),
  create: (text) => api.post('/lost-reasons', { text }),
  delete: (id) => api.delete(`/lost-reasons/${id}`),
};

export const inviteAPI = {
  getInfo: (token) => api.get(`/auth/invite-info/${token}`),
  accept: (data) => api.post('/auth/accept-invite', data),
};

export const remindersAPI = {
  getUpcoming: () => api.get('/reminders/upcoming'),
};

export const invoicesAPI = {
  getAll: () => api.get('/invoices'),
  getById: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  delete: (id) => api.delete(`/invoices/${id}`),
};

export const emailTemplatesAPI = {
  getAll: () => api.get('/email-templates'),
  create: (data) => api.post('/email-templates', data),
  update: (id, data) => api.put(`/email-templates/${id}`, data),
  delete: (id) => api.delete(`/email-templates/${id}`),
};

export const emailWorkflowsAPI = {
  updateStatus: (id, status) => api.put(`/email-workflows/${id}/status`, { status }),
};

export const autoReplyAPI = {
  getAll: () => api.get('/auto-reply'),
  create: (data) => api.post('/auto-reply', data),
  update: (id, data) => api.put(`/auto-reply/${id}`, data),
  delete: (id) => api.delete(`/auto-reply/${id}`),
};

export const auditAPI = {
  getLogs: (params) => api.get('/audit-logs', { params }),
};

export const platformAccountsAPI = {
  getAll: (platform) => api.get('/platform-accounts', { params: platform ? { platform } : {} }),
  create: (data) => api.post('/platform-accounts', data),
  update: (id, data) => api.put(`/platform-accounts/${id}`, data),
  delete: (id) => api.delete(`/platform-accounts/${id}`),
};

// WhatsApp groups — create from selected leads, edit name/desc/icon
export const whatsappGroupsAPI = {
  readyAccounts: () => api.get('/whatsapp/ready-accounts'),
  create: (data) => api.post('/whatsapp/groups', data),
  update: (groupId, formData) => api.patch(`/whatsapp/groups/${encodeURIComponent(groupId)}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const planAPI = {
  get: () => api.get('/workspace/plan'),
  update: (data) => api.put('/workspace/plan', data),
};

export const leadChannelsAPI = {
  getAll: (leadId) => api.get(`/leads/${leadId}/channels`),
  add: (leadId, data) => api.post(`/leads/${leadId}/channels`, data),
  remove: (leadId, channelId) => api.delete(`/leads/${leadId}/channels/${channelId}`),
};

export const leadRelationsAPI = {
  getSuggested: (leadId) => api.get(`/leads/${leadId}/related`),
  link: (data) => api.post('/lead-relations', data),
  unlink: (id) => api.delete(`/lead-relations/${id}`),
};

export const timelineAPI = {
  get: (leadId) => api.get(`/leads/${leadId}/timeline`),
};

export const messageQueueAPI = {
  getAll: () => api.get('/message-queue'),
  retry: (id) => api.post(`/message-queue/${id}/retry`),
};

export const aiAPI = {
  status: () => api.get('/ai/status'),
  sentiment: (text) => api.post('/ai/sentiment', { text }),
  rewrite: (text, tone) => api.post('/ai/rewrite', { text, tone }),
  translate: (text, target_lang) => api.post('/ai/translate', { text, target_lang }),
  shorten: (text) => api.post('/ai/shorten', { text }),
  getProfile: () => api.get('/ai/profile'),
  updateProfile: (data) => api.put('/ai/profile', data),
};

export const chatAPI = {
  getChannels: () => api.get('/chat/channels'),
  createChannel: (data) => api.post('/chat/channels', data),
  deleteChannel: (id) => api.delete(`/chat/channels/${id}`),
  getMessages: (channelId, params) => api.get(`/chat/channels/${channelId}/messages`, { params }),
  sendMessage: (channelId, data) => api.post(`/chat/channels/${channelId}/messages`, data),
  sendMedia: (channelId, formData) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return fetch(`${BASE_URL}/api/chat/channels/${channelId}/messages/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(r => r.json());
  },
  deleteMessage: (id) => api.delete(`/chat/messages/${id}`),
  react: (messageId, emoji) => api.post(`/chat/messages/${messageId}/react`, { emoji }),
};

export const integrationsAPI = {
  status:                () => api.get('/integrations/status'),
  saveCalendly:          (url) => api.put('/integrations/calendly', { url }),
  connectGoogleCalendar: (code) => api.post('/integrations/google-calendar/connect', { code }),
  disconnectGoogleCalendar: () => api.delete('/integrations/google-calendar'),
};

export const meetingsAPI = {
  create: (leadId, data) => api.post(`/leads/${leadId}/meetings`, data),
  list:   (leadId)       => api.get(`/leads/${leadId}/meetings`),
};

// Media Studio — projects, library, galleries. Image/thumb URLs come back as
// /uploads/... paths served by the API host, so prefix them with BASE_URL.
export const mediaAPI = {
  overview:        ()            => api.get('/media/overview'),
  listProjects:    (params)      => api.get('/media/projects', { params }),
  createProject:   (data)        => api.post('/media/projects', data),
  getProject:      (id)          => api.get(`/media/projects/${id}`),
  updateProject:   (id, data)    => api.put(`/media/projects/${id}`, data),
  archiveProject:  (id)          => api.delete(`/media/projects/${id}`),
  listAssets:      (id, params)  => api.get(`/media/projects/${id}/assets`, { params }),
  uploadAssets:    (id, formData)=> api.post(`/media/projects/${id}/assets`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAsset:     (id)          => api.delete(`/media/assets/${id}`),
  // culling — the human decision layer
  cullAsset:       (id, data)    => api.put(`/media/assets/${id}/cull`, data),
  bulkCull:        (projectId, asset_ids, decision) => api.post(`/media/projects/${projectId}/cull/bulk`, { asset_ids, decision }),
  cullSummary:     (projectId)   => api.get(`/media/projects/${projectId}/cull/summary`),
  // galleries
  listGalleries:   (projectId)   => api.get(`/media/projects/${projectId}/galleries`),
  createGallery:   (projectId, data) => api.post(`/media/projects/${projectId}/galleries`, data),
  createGalleryFromCull: (projectId, data) => api.post(`/media/projects/${projectId}/galleries/from-cull`, data),
  getGallery:      (id)          => api.get(`/media/galleries/${id}`),
  updateGallery:   (id, data)    => api.put(`/media/galleries/${id}`, data),
  addGalleryAssets:(id, asset_ids) => api.post(`/media/galleries/${id}/assets`, { asset_ids }),
  publishGallery:  (id, data)    => api.post(`/media/galleries/${id}/publish`, data || {}),
  unpublishGallery:(id)          => api.post(`/media/galleries/${id}/unpublish`),
  exportGallery:   (id, variant) => api.post(`/media/galleries/${id}/export`, { variant }),
  getExport:       (id)          => api.get(`/media/exports/${id}`),
  // proofing / selection
  createProofing:  (galleryId, data) => api.post(`/media/galleries/${galleryId}/proofing`, data),
  getProofing:     (setId)       => api.get(`/media/proofing/${setId}`),
  proofingRequestChanges: (setId, note) => api.post(`/media/proofing/${setId}/request-changes`, { note }),
  proofingApprove: (setId)       => api.post(`/media/proofing/${setId}/approve`),
  // albums
  listAlbums:       (projectId)        => api.get(`/media/projects/${projectId}/albums`),
  createAlbum:      (projectId, data)  => api.post(`/media/projects/${projectId}/albums`, data),
  getAlbum:         (id)               => api.get(`/media/albums/${id}`),
  deleteAlbum:      (id)               => api.delete(`/media/albums/${id}`),
  addAlbumPage:     (id, data)         => api.post(`/media/albums/${id}/pages`, data),
  updateAlbumPage:  (id, pageId, data) => api.put(`/media/albums/${id}/pages/${pageId}`, data),
  deleteAlbumPage:  (id, pageId)       => api.delete(`/media/albums/${id}/pages/${pageId}`),
  reorderAlbumPages:(id, page_ids)     => api.put(`/media/albums/${id}/pages/order`, { page_ids }),
  autofillAlbum:    (id, decision)     => api.post(`/media/albums/${id}/autofill`, { decision }),
  exportAlbum:      (id)               => api.post(`/media/albums/${id}/export`),
  // video clips
  listVideos:    (projectId)         => api.get(`/media/projects/${projectId}/videos`),
  setAssetMeta:  (id, data)          => api.put(`/media/assets/${id}/meta`, data),
  listClips:     (assetId)           => api.get(`/media/assets/${assetId}/clips`),
  addClip:       (assetId, data)     => api.post(`/media/assets/${assetId}/clips`, data),
  updateClip:    (clipId, data)      => api.put(`/media/clips/${clipId}`, data),
  deleteClip:    (clipId)            => api.delete(`/media/clips/${clipId}`),
  reorderClips:  (assetId, clip_ids) => api.put(`/media/assets/${assetId}/clips/order`, { clip_ids }),
};

// Resolve an API-relative media path (/uploads/...) to an absolute URL.
export function mediaUrl(p) {
  if (!p) return '';
  return /^https?:\/\//.test(p) ? p : `${BASE_URL}${p}`;
}

// Returns a human-friendly representation of `phone`. For real phone numbers
// the raw value (minus WhatsApp suffixes) is returned. For platform user IDs
// (Instagram/Facebook sender IDs are 13–17 digit integers, NOT phone numbers)
// we collapse to a short label — never leak the raw numeric ID to the UI.
export function displayPhone(phone, platform) {
  if (!phone) return '';
  // Strip WhatsApp JID suffixes
  const stripped = String(phone).replace(/@(lid|c\.us|s\.whatsapp\.net)$/, '').trim();
  if (!stripped) return '';

  // Heuristic for "this is a platform user ID, not a real phone":
  //  - pure digits
  //  - 13 or more digits (real intl phone numbers are 7–15 digits, mostly 10–13)
  //  - OR doesn't start with + and is ≥14 digits
  const digitsOnly = stripped.replace(/\D/g, '');
  const isPlatformId = /^\d{13,}$/.test(stripped) || (digitsOnly.length >= 14 && !stripped.startsWith('+'));
  if (isPlatformId) {
    const p = (platform || '').toLowerCase();
    if (p === 'instagram') return 'Instagram user';
    if (p === 'facebook')  return 'Facebook user';
    if (p === 'website')   return 'Website visitor';
    return 'No phone';
  }
  // Real phone — ensure leading + for visual clarity
  if (/^\d+$/.test(stripped) && stripped.length >= 7 && stripped.length <= 15) {
    return '+' + stripped;
  }
  // Already-formatted phone (e.g. "+923001234567" or "(555) 555-1234")
  if (/^\+?[\d\s\-().]+$/.test(stripped) && digitsOnly.length >= 7 && digitsOnly.length <= 15) {
    return stripped.startsWith('+') ? stripped : ('+' + digitsOnly);
  }
  // Non-phone identifiers (web-form-001, @username, etc.) — surface platform context
  const p = (platform || '').toLowerCase();
  if (p === 'website')   return 'Website visitor';
  if (p === 'instagram') return stripped.startsWith('@') ? stripped : 'Instagram user';
  if (p === 'facebook')  return 'Facebook user';
  return stripped;
}

// Returns a short platform + account label, e.g. "WhatsApp · Admissions Team"
// Used as a small chip on lead cards across dashboard / leads list / lead profile.
export function platformLabel(platform, accountNickname) {
  const labels = {
    whatsapp:  'WhatsApp',
    instagram: 'Instagram',
    facebook:  'Facebook',
    website:   'Website',
    email:     'Email',
    phone:     'Phone',
  };
  const name = labels[(platform || '').toLowerCase()] || (platform ? platform[0].toUpperCase() + platform.slice(1) : 'Unknown');
  return accountNickname ? `${name} · ${accountNickname}` : name;
}

export const PLATFORM_COLORS = {
  whatsapp:  '#25d366',
  instagram: '#e1306c',
  facebook:  '#1877f2',
  website:   '#6366f1',
  email:     '#f59e0b',
  phone:     '#8b5cf6',
};

export function formatCurrency(amount, symbol = '$', position = 'before') {
  const num = parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return position === 'after' ? `${num}${symbol}` : `${symbol}${num}`;
}

export default api;
