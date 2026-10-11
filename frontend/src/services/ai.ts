import { api, API_BASE } from '@/services/api';

/**
 * The AI service runs on the backend computer. The web app never talks to it directly: it goes through the
 * backend (/api/v1/ai/*), so this works from any computer that can open the app, and needs a login.
 */

let cachedTicket: { value: string; expires: number } | null = null;

/** The video and snapshot images are loaded by <img>, which cannot send a login header: they use a 5-minute ticket. */
async function streamTicket(): Promise<string> {
  if (cachedTicket && cachedTicket.expires > Date.now() + 30_000) return cachedTicket.value;
  const res: any = await api.get('/ai/ticket');
  cachedTicket = { value: res.ticket, expires: Date.now() + (res.expiresInSeconds ?? 300) * 1000 };
  return cachedTicket.value;
}

export const aiApi = {
  status: () => api.get('/ai/status', { timeout: 5000 }),
  history: (limit = 30) => api.get('/ai/history', { params: { limit }, timeout: 5000 }),
  setMode: (mode: 'webcam' | 'phone') => api.post('/ai/mode', { mode }, { timeout: 15000 }),
  start: () => api.post('/ai/start', {}, { timeout: 25000 }),
  stop: () => api.post('/ai/stop', {}, { timeout: 25000 }),
  /** Live annotated video (laptop webcam). */
  videoUrl: async () => `${API_BASE}/ai/video_feed?ticket=${await streamTicket()}`,
  /** Latest annotated photo (phone). The timestamp stops the browser reusing the previous picture. */
  snapshotUrl: async () => `${API_BASE}/ai/snapshot?ticket=${await streamTicket()}&t=${Date.now()}`,
};
