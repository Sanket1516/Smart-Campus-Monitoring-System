/**
 * Lease lock stored on the TerminalConfig document: at most one sidecar pull/push job
 * per terminal, across processes and restarts (an expired lease is reclaimable).
 */
const crypto = require('crypto');
const TerminalConfig = require('../../models/TerminalConfig');

const acquireTerminalLock = async (terminalSN, { ttlMs = 30 * 60 * 1000, owner } = {}) => {
  const token = owner || crypto.randomUUID();
  const now = new Date();
  const result = await TerminalConfig.updateOne(
    { deviceSN: terminalSN, $or: [{ pullLockUntil: null }, { pullLockUntil: { $lte: now } }] },
    { $set: { pullLockUntil: new Date(now.getTime() + ttlMs), pullLockOwner: token } }
  );
  return result.modifiedCount === 1 ? token : null;
};

const releaseTerminalLock = async (terminalSN, token) =>
  TerminalConfig.updateOne(
    { deviceSN: terminalSN, pullLockOwner: token },
    { $set: { pullLockUntil: null, pullLockOwner: '' } }
  );

const withTerminalLock = async (terminalSN, fn, options) => {
  const token = await acquireTerminalLock(terminalSN, options);
  if (!token) {
    const error = new Error(`Terminal ${terminalSN} is busy with another sync job`);
    error.statusCode = 409;
    throw error;
  }
  try {
    return await fn();
  } finally {
    await releaseTerminalLock(terminalSN, token);
  }
};

/** Simple in-process concurrency limiter (global cap on sidecar jobs). */
const createLimiter = (max) => {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= max || !waiting.length) return;
    active += 1;
    const { fn, resolve, reject } = waiting.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      waiting.push({ fn, resolve, reject });
      next();
    });
};

module.exports = { acquireTerminalLock, releaseTerminalLock, withTerminalLock, createLimiter };
