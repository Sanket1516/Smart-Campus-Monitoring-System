/**
 * HTTP client for the internal pyzk sidecar (ZK TCP 4370). The sidecar is the only
 * component that opens port 4370 on terminals. Responses may contain templates
 * (base64) — never log response bodies.
 */
const createHttpSidecar = ({ url, secret, timeoutMs = 60000, fetchImpl = globalThis.fetch }) => {
  if (!url) throw new Error('SIDECAR_URL is not configured');
  if (!secret) throw new Error('SIDECAR_SECRET is not configured');

  const request = async (method, path, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${url}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Sidecar-Secret': secret,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_error) {
        data = null;
      }
      if (!response.ok) {
        const detail = data?.detail || data?.error || `HTTP ${response.status}`;
        const error = new Error(`Sidecar ${method} ${path.split('?')[0]} failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(`Sidecar ${method} ${path.split('?')[0]} timed out after ${timeoutMs} ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const ipPath = (ip) => `/terminals/${encodeURIComponent(ip)}`;

  return {
    kind: 'http',
    info: (ip) => request('GET', `${ipPath(ip)}/info`),
    getUsers: (ip) => request('GET', `${ipPath(ip)}/users`),
    getTemplates: (ip, { userId } = {}) =>
      request('GET', `${ipPath(ip)}/templates${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`),
    upsertUser: (ip, user) => request('POST', `${ipPath(ip)}/users`, user),
    upsertUsersBatch: (ip, users) => request('POST', `${ipPath(ip)}/users/batch`, { users }),
    deleteUser: (ip, userId) => request('DELETE', `${ipPath(ip)}/users/${encodeURIComponent(userId)}`),
    enroll: (ip, { userId, fingerIndex }) =>
      request('POST', `${ipPath(ip)}/enroll`, { user_id: String(userId), fid: Number(fingerIndex) }),
    backup: (ip) => request('POST', `${ipPath(ip)}/backup`),
    capabilities: () => request('GET', '/capabilities'),
    getAttendance: (ip, { since } = {}) =>
      request('GET', `${ipPath(ip)}/attendance${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  };
};

module.exports = { createHttpSidecar };
