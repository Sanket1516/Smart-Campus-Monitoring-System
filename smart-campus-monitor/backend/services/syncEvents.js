const { EventEmitter } = require('events');

// In-process hooks between the push server and the sync service.
//   templateStored   { studentId, terminalSN, fingerIndex }
const syncEvents = new EventEmitter();

module.exports = syncEvents;
