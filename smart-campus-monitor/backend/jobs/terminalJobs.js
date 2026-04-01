const cron = require('node-cron');
const TerminalConfig = require('../models/TerminalConfig');
const { emitTerminalOffline } = require('../services/socketService');

let terminalOfflineInterval;
let midnightResetJob;

const startTerminalOfflineMonitor = () => {
  if (terminalOfflineInterval) {
    return;
  }

  terminalOfflineInterval = setInterval(async () => {
    try {
      const offlineThreshold = new Date(Date.now() - 2 * 60 * 1000);
      const offlineTerminals = await TerminalConfig.find({
        isOnline: true,
        lastSeen: { $lt: offlineThreshold },
      }).lean();

      if (!offlineTerminals.length) {
        return;
      }

      offlineTerminals.forEach((terminal) => {
        emitTerminalOffline({
          gateName: terminal.gateName,
          gateNumber: terminal.gateNumber,
          terminalNumber: terminal.terminalNumber,
          terminalLabel: terminal.terminalLabel,
          machineNumber: terminal.machineNumber,
          deviceSN: terminal.deviceSN,
          lastSeen: terminal.lastSeen,
        });
      });

      await TerminalConfig.updateMany(
        {
          _id: { $in: offlineTerminals.map((terminal) => terminal._id) },
        },
        {
          $set: { isOnline: false },
        }
      );
    } catch (error) {
      console.error('Terminal offline monitor failed:', error.message);
    }
  }, 60 * 1000);
};

const startTerminalMidnightResetJob = () => {
  if (midnightResetJob) {
    return;
  }

  midnightResetJob = cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        await TerminalConfig.updateMany({}, { $set: { scansToday: 0 } });
      } catch (error) {
        console.error('Terminal midnight reset failed:', error.message);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );
};

const startTerminalJobs = () => {
  startTerminalOfflineMonitor();
  startTerminalMidnightResetJob();
};

module.exports = {
  startTerminalJobs,
};
