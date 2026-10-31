const path = require('path');
const fs = require('fs');
const EntryLog = require('../../models/EntryLog');
const { getSystemConfiguration } = require('../configService');
const { buildContext } = require('./context');
const { render } = require('./render');

const PNG_DIR = path.join(__dirname, 'assets', 'png');

const dateKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const attachmentsFor = (icons) =>
  icons
    .filter((name) => fs.existsSync(path.join(PNG_DIR, `${name}.png`)))
    .map((name) => ({
      filename: `${name}.png`,
      path: path.join(PNG_DIR, `${name}.png`),
      cid: `${name}@campus`,
      contentDisposition: 'inline',
    }));

/**
 * Build the parent email for one entry/exit event from live backend data.
 * @param event optional { source: 'terminal'|'sap_scan', verifyMode, terminal, log }
 */
const composeParentEmail = async ({ student, action, timestamp, event = {} }) => {
  const config = await getSystemConfiguration();
  const timeZone = config.timezone || 'Asia/Kolkata';
  const at = new Date(timestamp);

  // Same-day logs for this student; the event log's own date wins so the pairing matches how it was stored.
  const dates = new Set([dateKey(at, timeZone)]);
  if (event.log?.date) dates.add(event.log.date);
  const logs = await EntryLog.find({ sapId: student.sapId, date: { $in: [...dates] } })
    .sort({ createdAt: 1 })
    .lean();

  const ctx = buildContext({
    student,
    action,
    timestamp: at,
    event,
    logs,
    branding: { collegeName: config.collegeName, collegeLogo: config.collegeLogo, timezone: timeZone },
  });
  const rendered = render(ctx);
  return { ...rendered, attachments: attachmentsFor(rendered.icons), context: ctx };
};

module.exports = { composeParentEmail, attachmentsFor, PNG_DIR };
