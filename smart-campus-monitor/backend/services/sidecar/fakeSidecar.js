/**
 * In-memory fake of the pyzk sidecar for tests and local development
 * (SIDECAR_FAKE=true). Mirrors the HTTP sidecar's response shapes.
 */
const crypto = require('crypto');

const sha = (b64) => crypto.createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

const createFakeSidecar = ({ terminals = {} } = {}) => {
  const devices = new Map();
  const calls = [];

  const device = (ip) => {
    if (!devices.has(ip)) {
      const seed = terminals[ip] || {};
      devices.set(ip, {
        serial: seed.serial || `FAKE${devices.size + 1}`,
        firmware: seed.firmware || 'fake-fw',
        algorithm: seed.algorithm || '10',
        offline: Boolean(seed.offline),
        users: new Map(), // user_id -> {uid, user_id, name, privilege}
        attendance: [], // {user_id, timestamp, status, punch}
        templates: new Map(), // `${user_id}:${fid}` -> {fid, valid, template}
      });
    }
    const d = devices.get(ip);
    if (d.offline) throw new Error(`Sidecar: terminal ${ip} unreachable (timeout)`);
    return d;
  };

  const nextUid = (d, userId) => {
    const existing = d.users.get(String(userId));
    if (existing) return existing.uid;
    const used = new Set(Array.from(d.users.values()).map((u) => u.uid));
    const preferred = Number(userId);
    if (preferred > 0 && preferred < 65535 && !used.has(preferred)) return preferred;
    let uid = 1;
    while (used.has(uid)) uid += 1;
    return uid;
  };

  const upsert = (ip, { user_id, name = '', privilege = 0, templates = [] }) => {
    const d = device(ip);
    const uid = nextUid(d, user_id);
    d.users.set(String(user_id), { uid, user_id: String(user_id), name, privilege });
    templates.forEach((t) => {
      d.templates.set(`${user_id}:${t.fid}`, { fid: Number(t.fid), valid: Number(t.valid ?? 1), template: t.template });
    });
    return { uid, user_id: String(user_id), templates_written: templates.length, refreshed: true };
  };

  const api = {
    kind: 'fake',
    calls,
    devices,
    setOffline(ip, offline) {
      if (!devices.has(ip)) device(ip);
      devices.get(ip).offline = offline;
    },
    async info(ip) {
      calls.push(['info', ip]);
      const d = device(ip);
      return { serial: d.serial, firmware: d.firmware, algorithm: d.algorithm, users: d.users.size, fingers: d.templates.size };
    },
    async getUsers(ip) {
      calls.push(['getUsers', ip]);
      return { users: Array.from(device(ip).users.values()) };
    },
    async getTemplates(ip, { userId } = {}) {
      calls.push(['getTemplates', ip, userId]);
      const d = device(ip);
      const out = [];
      d.templates.forEach((value, key) => {
        const [uid] = key.split(':');
        if (userId && uid !== String(userId)) return;
        out.push({
          user_id: uid,
          fid: value.fid,
          valid: value.valid,
          size: Buffer.from(value.template, 'base64').length,
          template: value.template,
          sha256: sha(value.template),
        });
      });
      return { templates: out };
    },
    async upsertUser(ip, user) {
      calls.push(['upsertUser', ip, user.user_id]);
      return upsert(ip, user);
    },
    async upsertUsersBatch(ip, users) {
      calls.push(['upsertUsersBatch', ip, users.length]);
      return { results: users.map((u) => upsert(ip, u)) };
    },
    async deleteUser(ip, userId) {
      calls.push(['deleteUser', ip, userId]);
      const d = device(ip);
      const existed = d.users.delete(String(userId));
      Array.from(d.templates.keys())
        .filter((key) => key.startsWith(`${userId}:`))
        .forEach((key) => d.templates.delete(key));
      return { deleted: existed, refreshed: true };
    },
    async enroll(ip, { userId, fingerIndex }) {
      calls.push(['enroll', ip, userId, fingerIndex]);
      device(ip);
      return { ok: false, detail: 'fake sidecar cannot capture fingers' };
    },
    addPunch(ip, record) {
      device(ip).attendance.push(record);
    },
    async capabilities() {
      return { operations: {}, forbidden: ['clear_data'], simulated: true };
    },
    async getAttendance(ip, { since } = {}) {
      calls.push(['getAttendance', ip, since]);
      return { records: device(ip).attendance.filter((r) => !since || r.timestamp > since) };
    },
    async backup(ip) {
      calls.push(['backup', ip]);
      const d = device(ip);
      return { file: `fake-backup-${d.serial}.json`, users: d.users.size, templates: d.templates.size };
    },
  };
  return api;
};

module.exports = { createFakeSidecar };
