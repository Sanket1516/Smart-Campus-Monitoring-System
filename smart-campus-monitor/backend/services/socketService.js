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

const emit = (eventName, payload) => {
  if (!ioInstance) {
    return false;
  }

  ioInstance.emit(eventName, payload);
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
