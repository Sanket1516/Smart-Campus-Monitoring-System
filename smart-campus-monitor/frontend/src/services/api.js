import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: apiBaseUrl,
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
export const getStaffApi = () => api.get('/auth/staff');
export const registerStaffApi = (data) => api.post('/auth/register', data);
export const updateStaffApi = (id, data) => api.put(`/auth/staff/${id}`, data);
export const deactivateStaffApi = (id) => api.delete(`/auth/staff/${id}`);
export const getAlertsApi = (params) => api.get('/alerts', { params });
export const markAlertsReadApi = (alertIds) => api.post('/alerts/read', { alertIds });

// Scan
export const processScanApi = (sapId) => api.post('/scan', { sapId });

// Students
export const getStudentsApi = (params) => api.get('/students', { params });
export const getStudentApi = (sapId) => api.get(`/students/${sapId}`);
export const createStudentApi = (data) => api.post('/students', data);
export const updateStudentApi = (sapId, data) => api.put(`/students/${sapId}`, data);
export const deleteStudentApi = (sapId) => api.delete(`/students/${sapId}`);
export const uploadStudentsExcelApi = (formData) => api.post('/students/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});

// Logs
export const getLogsApi = (params) => api.get('/logs', { params });
export const getUnauthorizedLogsApi = (params) => api.get('/logs/unauthorized', { params });
export const resolveUnauthorizedApi = (id, notes) =>
  api.put(`/logs/unauthorized/${id}/resolve`, { notes });

// Dashboard
export const getDashboardApi = (params) => api.get('/dashboard', { params });
export const getHourlyApi = (params) => api.get('/dashboard/hourly', { params });
export const getHostellerStatusApi = () => api.get('/dashboard/hostellers');
export const getAttendanceStatusApi = (params) => api.get('/dashboard/attendance', { params });
export const getSettingApi = (key) => api.get(`/settings/${key}`);
export const updateSettingApi = (key, value) => api.put(`/settings/${key}`, { value });
export const getAuditLogsApi = (params) => api.get('/settings/audit', { params });
export const sendSettingsTestEmailApi = (data) => api.post('/settings/test-email', data);

// Notify
export const sendNotifyApi = (data) => api.post('/notify', data);

// Visitors
export const createVisitorEntryApi = (data) => api.post('/visitors', data);
export const getVisitorEntriesApi = (params) => api.get('/visitors', { params });

// Terminals
export const getTerminalsApi = () => api.get('/terminals');
export const getTerminalStatusApi = () => api.get('/terminals/status');
export const createTerminalApi = (data) => api.post('/terminals', data);
export const updateTerminalApi = (machineNumber, data) =>
  api.put(`/terminals/${machineNumber}`, data);
export const deleteTerminalApi = (machineNumber) =>
  api.delete(`/terminals/${machineNumber}`);
export const getTerminalLogsApi = (machineNumber, params) =>
  api.get(`/terminals/${machineNumber}/logs`, { params });

// Hostels
export const getHostelsApi = () => api.get('/hostels');
export const getHostelApi = (id) => api.get(`/hostels/${id}`);
export const createHostelApi = (data) => api.post('/hostels', data);
export const updateHostelApi = (id, data) => api.put(`/hostels/${id}`, data);
export const deleteHostelApi = (id) => api.delete(`/hostels/${id}`);
export const getHostelStudentsApi = (id) => api.get(`/hostels/${id}/students`);

// Enrollment
export const initiateEnrollmentApi = (studentId, data) =>
  api.post(`/enrollment/initiate/${studentId}`, data);
export const confirmEnrollmentApi = (studentId, data) =>
  api.post(`/enrollment/confirm/${studentId}`, data);
export const updateEnrollmentTypeApi = (studentId, data) =>
  api.put(`/enrollment/update-type/${studentId}`, data);
export const getEnrollmentStatsApi = () => api.get('/enrollment/stats');

// Access control
export const blockStudentApi = (studentId, data) => api.post(`/access/block/${studentId}`, data);
export const blockStudentsByTypeApi = (data) => api.post('/access/block-bulk', data);
export const unblockStudentApi = (studentId, data) =>
  api.post(`/access/unblock/${studentId}`, data);
export const unblockStudentsByTypeApi = (data) => api.post('/access/unblock-bulk', data);
export const getBlockedStudentsApi = (params) => api.get('/access/blocked', { params });
export const getAccessLogsApi = (studentId) => api.get(`/access/log/${studentId}`);

// Hosteller requests
export const createHostellerRequestApi = (data) => api.post('/hosteller/request', data);
export const getHostellerRequestsApi = (params) => api.get('/hosteller/requests', { params });
export const approveHostellerRequestApi = (requestId) =>
  api.post(`/hosteller/approve/${requestId}`);
export const rejectHostellerRequestApi = (requestId, data) =>
  api.post(`/hosteller/reject/${requestId}`, data);
export const getActiveHostellerRequestsApi = () => api.get('/hosteller/active');
export const getStudentHostellerHistoryApi = (studentId) =>
  api.get(`/hosteller/history/${studentId}`);
export const getHostelHostellerRequestsApi = (hostelId) =>
  api.get(`/hosteller/hostel/${hostelId}`);
export const getPublicHostellerStatusApi = (sapId) => api.get(`/hosteller/public/${sapId}`);
export const getPublicLiveDashboardApi = () => api.get('/live');
export const aiQueryApi = (message) => api.post('/ai-query', { message });

export default api;

// Terminal sync (ADMS push + sidecar)
export const getSyncOverviewApi = () => api.get('/sync/overview');
export const getSyncTerminalsApi = () => api.get('/sync/terminals');
export const updateSyncTerminalApi = (sn, data) => api.patch(`/sync/terminals/${sn}`, data);
export const resyncTerminalApi = (sn, mode = 'auto') => api.post(`/sync/terminals/${sn}/resync`, { mode });
export const probeTerminalApi = (sn) => api.post(`/sync/terminals/${sn}/probe`);
export const backupTerminalApi = (sn) => api.post(`/sync/terminals/${sn}/backup`);
export const getSyncGroupsApi = () => api.get('/sync/groups');
export const getStudentSyncApi = (id) => api.get(`/sync/students/${id}`);
export const setStudentGroupsApi = (id, targetTerminalGroups) =>
  api.patch(`/sync/students/${id}/groups`, { targetTerminalGroups });
export const resyncStudentApi = (id) => api.post(`/sync/students/${id}/resync`);
export const recordConsentApi = (id, data) => api.post(`/sync/students/${id}/consent`, data);
export const withdrawConsentApi = (id, reason) => api.delete(`/sync/students/${id}/consent`, { data: { reason } });
export const eraseBiometricsApi = (id, confirmSapId, reason) =>
  api.post(`/sync/students/${id}/erase`, { confirmSapId, reason });
export const getEnrollmentMethodsApi = () => api.get('/sync/enrollment/methods');
export const startSyncEnrollmentApi = (id, data) => api.post(`/sync/students/${id}/enrollment/start`, data);
export const fetchEnrollmentTemplateApi = (id) => api.post(`/sync/students/${id}/enrollment/fetch`, {});
export const getSyncEnrollmentStatusApi = (id) => api.get(`/sync/students/${id}/enrollment`);
export const getSyncCommandsApi = (params) => api.get('/sync/commands', { params });
export const retrySyncCommandsApi = (data) => api.post('/sync/commands/retry', data);
export const cancelSyncCommandApi = (id) => api.post(`/sync/commands/${id}/cancel`);
export const getReconciliationReportsApi = (params) => api.get('/sync/reconciliation', { params });
export const runReconciliationApi = (data) => api.post('/sync/reconciliation/run', data || {});
export const getBiometricAuditApi = (params) => api.get('/sync/audit', { params });
export const getSyncJobsApi = () => api.get('/sync/jobs');
export const getPublicBrandingApi = () => api.get('/live/branding');
