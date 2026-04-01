const cron = require('node-cron');
const { processExpiredApprovals } = require('../controllers/hostellerController');

let hostellerExpiryJob;

const startHostellerJobs = () => {
  if (hostellerExpiryJob) {
    return;
  }

  hostellerExpiryJob = cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        await processExpiredApprovals();
      } catch (error) {
        console.error('Hosteller expiry job failed:', error.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );
};

module.exports = {
  startHostellerJobs,
};
