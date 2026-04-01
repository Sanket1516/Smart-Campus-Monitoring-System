const cron = require('node-cron');
const TerminalConfig = require('../models/TerminalConfig');

let terminalOfflineInterval;
let midnightResetJob;

const startTerminalOfflineMonitor = () => {
  if (terminalOfflineInterval) {
    return;
  }

  terminalOfflineInterval = setInterval(async () => {
    try {
      const offlineThreshold = new Date(Date.now() - 2 * 60 * 1000);

      await TerminalConfig.updateMany(
        {
          isOnline: true,
          lastSeen: { $lt: offlineThreshold },
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
