const { requeueTimedOut } = require('../services/commandQueueService');

let requeueInterval;

// Sent commands with no ack go back to pending after COMMAND_ACK_TIMEOUT_MS,
// or fail after COMMAND_MAX_ATTEMPTS.
const startCommandRequeueSweep = () => {
  if (requeueInterval) {
    return;
  }

  requeueInterval = setInterval(async () => {
    try {
      const { requeued, failed } = await requeueTimedOut();

      if (requeued || failed) {
        console.info(`Command sweep: ${requeued} requeued, ${failed} failed`);
      }
    } catch (error) {
      console.error('Command requeue sweep failed:', error.message);
    }
  }, 60 * 1000);
};

const startSyncJobs = () => {
  startCommandRequeueSweep();
};

module.exports = {
  startSyncJobs,
};
