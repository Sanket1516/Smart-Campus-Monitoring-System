import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('admin');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const loginApi = (data) => api.post('/auth/login', data);
export const getMeApi = () => api.get('/auth/me');

// Scan
export const processScanApi = (sapId) => api.post('/scan', { sapId });

// Students
export const getStudentsApi = (params) => api.get('/students', { params });
export const getStudentApi = (sapId) => api.get(`/students/${sapId}`);
export const createStudentApi = (data) => api.post('/students', data);
export const updateStudentApi = (sapId, data) => api.put(`/students/${sapId}`, data);
export const deleteStudentApi = (sapId) => api.delete(`/students/${sapId}`);

// Logs
export const getLogsApi = (params) => api.get('/logs', { params });
export const getUnauthorizedLogsApi = (params) => api.get('/logs/unauthorized', { params });
export const resolveUnauthorizedApi = (id, notes) =>
  api.put(`/logs/unauthorized/${id}/resolve`, { notes });

// Dashboard
export const getDashboardApi = (date) => api.get('/dashboard', { params: date ? { date } : {} });
export const getHourlyApi = (date) => api.get('/dashboard/hourly', { params: { date } });
export const getHostellerStatusApi = () => api.get('/dashboard/hostellers');

// Notify
export const sendNotifyApi = (data) => api.post('/notify', data);

// Visitors
export const createVisitorEntryApi = (data) => api.post('/visitors', data);
export const getVisitorEntriesApi = (params) => api.get('/visitors', { params });

export default api;
