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
    if (err.response?.status === 401 && typeof window !== 'undefined') {
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

  // Messages
  getMessages: (id) => api.get(`/leads/${id}/messages`),
  sendMessage: (id, body) => api.post(`/leads/${id}/messages`, { body }),
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

export function displayPhone(phone) {
  if (!phone) return '';
  return phone.replace(/@(lid|c\.us|s\.whatsapp\.net)$/, '');
}

export function formatCurrency(amount, symbol = '$', position = 'before') {
  const num = parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return position === 'after' ? `${num}${symbol}` : `${symbol}${num}`;
}

export default api;
