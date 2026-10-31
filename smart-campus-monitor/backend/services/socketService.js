let ioInstance = null;

const EVENTS = {
  scanLive: 'scan:live',
  scanBlocked: 'scan:blocked',
  scanUnauthorized: 'scan:unauthorized',
  scanWardenRequired: 'scan:warden_required',
  terminalOffline: 'terminal:offline',
  terminalOnline: 'terminal:online',
  wardenNewRequest: 'warden:new_request',
  wardenLateReturn: 'warden:late_return',
  hostelWardenChanged: 'hostel:warden_changed',
  unknownTerminal: 'unknown:terminal',
  settingsUpdated: 'settings:updated',
  syncCommand: 'sync:command',
  syncStudent: 'sync:student',
  syncTerminal: 'sync:terminal',
  syncAlert: 'sync:alert',
  syncReconcile: 'sync:reconcile',
};

const setIo = (io) => {
  ioInstance = io;
  return ioInstance;
};

const getIo = () => ioInstance;

// Authenticated staff sockets join STAFF_ROOM; anonymous sockets (public live screen)
// join PUBLIC_ROOM and only ever receive anonymised `public:activity` events.
const STAFF_ROOM = 'staff';
const PUBLIC_ROOM = 'public';

const PUBLIC_EVENT_TYPES = {
  'scan:live': (payload) => (payload?.type === 'exit' ? 'exit' : 'entry'),
  'scan:blocked': () => 'blocked',
  'scan:unauthorized': () => 'unauthorized',
  'terminal:online': () => 'terminal_online',
  'terminal:offline': () => 'terminal_offline',
};

/** Strip everything that could identify a student. */
const toPublicActivity = (eventName, payload = {}) => ({
  eventType: PUBLIC_EVENT_TYPES[eventName](payload),
  gateName: payload.gateName || '',
  gateNumber: payload.gateNumber ?? null,
  terminalNumber: payload.terminalNumber ?? null,
  terminalLabel: payload.terminalLabel || '',
  machineNumber: payload.machineNumber ?? null,
  time: payload.time || new Date().toISOString(),
});

const emit = (eventName, payload) => {
  if (!ioInstance) {
    return false;
  }

  ioInstance.to(STAFF_ROOM).emit(eventName, payload);

  if (PUBLIC_EVENT_TYPES[eventName]) {
    ioInstance.to(PUBLIC_ROOM).emit('public:activity', toPublicActivity(eventName, payload));
  }
  return true;
};

const emitToWarden = (wardenId, eventName, payload) => {
  if (!ioInstance || !wardenId) {
    return false;
  }

  ioInstance.to(`warden:${wardenId}`).emit(eventName, payload);
  return true;
};

const emitScanLive = (payload) => emit(EVENTS.scanLive, payload);
const emitScanBlocked = (payload) => emit(EVENTS.scanBlocked, payload);
const emitScanUnauthorized = (payload) => emit(EVENTS.scanUnauthorized, payload);
const emitWardenRequired = (payload) => emit(EVENTS.scanWardenRequired, payload);
const emitTerminalOffline = (payload) => emit(EVENTS.terminalOffline, payload);
const emitTerminalOnline = (payload) => emit(EVENTS.terminalOnline, payload);
const emitWardenNewRequest = (wardenId, payload) =>
  emitToWarden(wardenId, EVENTS.wardenNewRequest, payload);
const emitWardenLateReturn = (wardenId, payload) =>
  emitToWarden(wardenId, EVENTS.wardenLateReturn, payload);
const emitHostelWardenChanged = (payload) => emit(EVENTS.hostelWardenChanged, payload);
const emitUnknownTerminal = (payload) => emit(EVENTS.unknownTerminal, payload);
const emitSettingsUpdated = (payload) => emit(EVENTS.settingsUpdated, payload);
const emitSyncCommand = (payload) => emit(EVENTS.syncCommand, payload);
const emitSyncStudent = (payload) => emit(EVENTS.syncStudent, payload);
const emitSyncTerminal = (payload) => emit(EVENTS.syncTerminal, payload);
const emitSyncAlert = (payload) => emit(EVENTS.syncAlert, payload);
const emitSyncReconcile = (payload) => emit(EVENTS.syncReconcile, payload);

module.exports = {
  STAFF_ROOM,
  PUBLIC_ROOM,
  toPublicActivity,
  EVENTS,
  setIo,
  getIo,
  emitScanLive,
  emitScanBlocked,
  emitScanUnauthorized,
  emitWardenRequired,
  emitTerminalOffline,
  emitTerminalOnline,
  emitWardenNewRequest,
  emitWardenLateReturn,
  emitHostelWardenChanged,
  emitUnknownTerminal,
  emitSettingsUpdated,
  emitSyncCommand,
  emitSyncStudent,
  emitSyncTerminal,
  emitSyncAlert,
  emitSyncReconcile,
};
