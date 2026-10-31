const cron = require('node-cron');
const { getSyncConfig } = require('../config/terminalSync');
const { sweepTimeouts } = require('../services/sync/commandQueue');
const { runReconciliation } = require('../services/sync/reconciliation');
const { resumeBulkJobs } = require('../services/sync/bulkLoader');
const { expireEnrollments } = require('../services/enrollment/enrollmentService');
const { runPullCycle } = require('../services/sync/pullExecutor');

let sweepTimer = null;
let reconcileTask = null;
let pullTimer = null;
let pullRunning = false;

const startSyncJobs = () => {
  const config = getSyncConfig();

  if (!sweepTimer) {
    sweepTimer = setInterval(async () => {
      try {
        const result = await sweepTimeouts();
        if (result.requeued || result.failed) {
          console.log(`[sync] ack timeout sweep: requeued=${result.requeued} failed=${result.failed}`);
        }
        const expired = await expireEnrollments();
        if (expired) console.log(`[sync] ${expired} enrolment session(s) timed out`);
      } catch (error) {
        console.error('[sync] sweep failed:', error.message);
      }
    }, config.queue.sweepIntervalSeconds * 1000);
  }

  if (config.reconcile.enabled && !reconcileTask) {
    reconcileTask = cron.schedule(
      config.reconcile.cron,
      async () => {
        try {
          const summary = await runReconciliation({ actor: 'system' });
          console.log('[sync] nightly reconciliation:', JSON.stringify(summary));
        } catch (error) {
          console.error('[sync] nightly reconciliation failed:', error.message);
        }
      },
      { timezone: config.reconcile.timezone }
    );
  }

  if (!pullTimer) {
    pullTimer = setInterval(async () => {
      if (pullRunning) return;
      pullRunning = true;
      try {
        await runPullCycle();
      } catch (error) {
        console.error('[sync] pull cycle failed:', error.message);
      } finally {
        pullRunning = false;
      }
    }, config.pull.pollSeconds * 1000);
  }

  resumeBulkJobs()
    .then((count) => count && console.log(`[sync] resumed ${count} bulk load job(s)`))
    .catch((error) => console.error('[sync] resume bulk jobs failed:', error.message));
};

const stopSyncJobs = () => {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
  if (reconcileTask) reconcileTask.stop();
  if (pullTimer) clearInterval(pullTimer);
  pullTimer = null;
  reconcileTask = null;
};

module.exports = { startSyncJobs, stopSyncJobs };
