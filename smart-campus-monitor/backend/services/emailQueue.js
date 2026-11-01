// Persistent FIFO email queue. Every email is stored first, then one worker sends them strictly one
// at a time in the order they were queued. A temporary failure is retried (later emails wait, so order
// is kept); only a permanently bad recipient or too many failures sets a job aside as `failed`.
const EmailJob = require('../models/EmailJob');

const RETRY_DELAYS_MS = [5000, 15000, 45000, 120000, 300000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const GAP_MS = Number(process.env.EMAIL_SEND_GAP_MS || 400); // gentle pacing keeps Gmail from throttling bursts
const POLL_MS = 10000;

let running = false;
let again = false;
let pollTimer = null;
let wakeTimer = null;

const sendNow = (job) =>
  require('./notification').sendEmail({
    to: job.to,
    subject: job.subject,
    text: job.text,
    html: job.html,
    attachments: job.attachments,
  });

// Sends the oldest due job. Returns false when there is nothing to send right now.
const processOne = async () => {
  const oldest = await EmailJob.findOne({ status: 'pending' }).sort({ createdAt: 1, _id: 1 });
  if (!oldest || oldest.nextAttemptAt > new Date()) return false; // the oldest waits for its retry: nobody overtakes it

  const job = await EmailJob.findOneAndUpdate(
    { _id: oldest._id, status: 'pending' },
    { $set: { status: 'sending' }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!job) return true;

  const result = await sendNow(job);
  if (result.success) {
    Object.assign(job, { status: 'sent', messageId: result.messageId, sentAt: new Date(), lastError: undefined });
  } else if (result.permanent || job.attempts >= MAX_ATTEMPTS) {
    // A failed job is set aside, so one bad address cannot block everyone behind it.
    Object.assign(job, { status: 'failed', lastError: result.error });
    console.error(`Email job ${job._id} FAILED for good (to=${job.to}): ${result.error}`);
  } else {
    const delay = RETRY_DELAYS_MS[job.attempts - 1];
    Object.assign(job, { status: 'pending', lastError: result.error, nextAttemptAt: new Date(Date.now() + delay) });
    console.warn(`Email job ${job._id} will retry in ${delay / 1000}s (attempt ${job.attempts}): ${result.error}`);
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(kick, delay + 50);
  }
  await job.save();
  return true;
};

const drain = async () => {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      // eslint-disable-next-line no-await-in-loop
      while (await processOne()) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    } while (again);
  } catch (error) {
    console.error('Email queue error:', error.message);
  } finally {
    running = false;
  }
};

function kick() {
  void drain();
}

/** Store an email and start sending. Resolves as soon as it is safely queued. */
const enqueue = async ({ to, subject, text, html, attachments, meta }) => {
  const job = await EmailJob.create({ to, subject, text, html, attachments: attachments || [], meta });
  console.log(`Email queued: job=${job._id} to=${to} subject="${subject}"`);
  kick();
  return job;
};

/** Resolves with the finished job (sent or failed for good), or null on timeout. */
const waitFor = async ({ _id }, timeoutMs = 10 * 60 * 1000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const job = await EmailJob.findById(_id).lean();
    if (job && (job.status === 'sent' || job.status === 'failed')) return job;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
};

/** Call once after MongoDB connects: recover jobs a crash left half-sent, then keep draining. */
const start = async () => {
  const stuck = await EmailJob.updateMany({ status: 'sending' }, { $set: { status: 'pending', nextAttemptAt: new Date() } });
  const pending = await EmailJob.countDocuments({ status: 'pending' });
  console.log(`Email queue started: ${pending} pending (${stuck.modifiedCount || 0} recovered after restart)`);
  kick();
  pollTimer = setInterval(kick, POLL_MS);
  pollTimer.unref?.();
};

const stop = () => {
  clearInterval(pollTimer);
  clearTimeout(wakeTimer);
};

module.exports = { enqueue, waitFor, start, stop, kick };
