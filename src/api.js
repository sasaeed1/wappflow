import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://10.0.2.2:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const auth = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  logout: async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
  },
  getUser: async () => {
    const user = await AsyncStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },
  saveAuth: async (token, user) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
  },
};

export const leads = {
  getAll: (status) => api.get('/leads', { params: { status } }),
  getOne: (id) => api.get(`/leads/${id}`),
  update: (id, data) => api.patch(`/leads/${id}`, data),
  addNote: (id, content) => api.post(`/leads/${id}/notes`, { content }),
  addReminder: (id, data) => api.post(`/leads/${id}/reminders`, data),
  updateReminder: (leadId, reminderId, data) =>
    api.patch(`/leads/${leadId}/reminders/${reminderId}`, data),
};

export const analytics = {
  getStats: () => api.get('/analytics'),
};

export default api;