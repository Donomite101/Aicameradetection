import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAuthTokens, setAuthTokens, clearAuthTokens } from '@/store/auth';

const API_URL = import.meta.env.VITE_API_URL || 'https://sterility-upheld-attic.ngrok-free.dev';
const API_PREFIX = '/api/v1';

export const api = axios.create({
  baseURL: `${API_URL}${API_PREFIX}`,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
  timeout: 30000,
});

// Request interceptor to add auth token and sanitize query params
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.headers['ngrok-skip-browser-warning'] = 'true';
    const tokens = getAuthTokens();
    if (tokens?.accessToken) {
      config.headers.Authorization = `Bearer ${tokens.accessToken}`;
    }

    if (config.params && typeof config.params === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(config.params)) {
        if (val !== '' && val !== null && val !== undefined) {
          sanitized[key] = val;
        }
      }
      config.params = sanitized;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const tokens = getAuthTokens();
        if (!tokens?.refreshToken) throw new Error('No refresh token');

        const response = await axios.post(`${API_URL}${API_PREFIX}/auth/refresh`, {
          refreshToken: tokens.refreshToken,
        });

        const { accessToken, refreshToken } = response.data;
        setAuthTokens({ accessToken, refreshToken });

        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        clearAuthTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// API endpoints
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; fullName: string; role?: string; centreId?: string }) =>
    api.post('/auth/register', data),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
  logout: () => api.post('/auth/logout'),
};

export const centresApi = {
  list: (params?: Record<string, unknown>) => api.get('/centres', { params }),
  get: (id: string) => api.get(`/centres/${id}`),
  create: (data: Record<string, unknown>) => api.post('/centres', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/centres/${id}`, data),
  delete: (id: string) => api.delete(`/centres/${id}`),
  stats: (id: string) => api.get(`/centres/${id}/stats`),
  cameras: {
    list: (centreId: string) => api.get(`/centres/${centreId}/cameras`),
    add: (centreId: string, data: Record<string, unknown>) => api.post(`/centres/${centreId}/cameras`, data),
    update: (centreId: string, cameraId: string, data: Record<string, unknown>) =>
      api.patch(`/centres/${centreId}/cameras/${cameraId}`, data),
    delete: (centreId: string, cameraId: string) => api.delete(`/centres/${centreId}/cameras/${cameraId}`),
  },
  inventory: {
    list: (centreId: string) => api.get(`/centres/${centreId}/inventory`),
    add: (centreId: string, data: Record<string, unknown>) => api.post(`/centres/${centreId}/inventory`, data),
    update: (centreId: string, itemId: string, data: Record<string, unknown>) =>
      api.patch(`/centres/${centreId}/inventory/${itemId}`, data),
    delete: (centreId: string, itemId: string) => api.delete(`/centres/${centreId}/inventory/${itemId}`),
  },
};

export const attendanceApi = {
  list: (params?: Record<string, unknown>) => api.get('/attendance', { params }),
  get: (id: string) => api.get(`/attendance/${id}`),
  submit: (data: Record<string, unknown>) => api.post('/attendance', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/attendance/${id}`, data),
  summary: (centreId: string, params?: Record<string, unknown>) =>
    api.get(`/attendance/centre/${centreId}/summary`, { params }),
  discrepancies: (centreId: string) => api.get(`/attendance/centre/${centreId}/discrepancies`),
};

export const infrastructureApi = {
  checks: (params?: Record<string, unknown>) => api.get('/infrastructure/checks', { params }),
  getCheck: (id: string) => api.get(`/infrastructure/checks/${id}`),
  centreStatus: (centreId: string) => api.get(`/infrastructure/centre/${centreId}/status`),
  compliance: (centreId: string, params?: Record<string, unknown>) =>
    api.get(`/infrastructure/centre/${centreId}/compliance`, { params }),
};

export const alertsApi = {
  list: (params?: Record<string, unknown>) => api.get('/alerts', { params }),
  get: (id: string) => api.get(`/alerts/${id}`),
  acknowledge: (id: string) => api.post(`/alerts/${id}/acknowledge`),
  resolve: (id: string) => api.post(`/alerts/${id}/resolve`),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/alerts/${id}`, data),
  stats: (params?: Record<string, unknown>) => api.get('/alerts/stats', { params }),
};

export const dashboardApi = {
  summary: (params?: Record<string, unknown>) => api.get('/dashboard/summary', { params }),
  centresMap: (params?: Record<string, unknown>) => api.get('/dashboard/centres/map', { params }),
  attendanceTrends: (params?: Record<string, unknown>) => api.get('/dashboard/attendance/trends', { params }),
  infrastructureCompliance: (params?: Record<string, unknown>) =>
    api.get('/dashboard/infrastructure/compliance', { params }),
};