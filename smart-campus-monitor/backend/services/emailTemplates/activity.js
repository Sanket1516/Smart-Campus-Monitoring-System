/**
 * Today's campus activity from real EntryLog rows.
 *
 * Logs come in two shapes: one row per event (gate scanner) or one row holding both
 * entryTime and exitTime (terminal toggle). Both are flattened into a time-ordered event list,
 * then paired entry -> exit. Only complete, adjacent pairs are ever used for durations.
 */
const { formatDuration, formatTime, NA } = require('./helpers');

const flatten = (logs) => {
  const events = [];
  for (const log of logs || []) {
    if (log.entryTime) events.push({ type: 'entry', at: new Date(log.entryTime) });
    if (log.exitTime) events.push({ type: 'exit', at: new Date(log.exitTime) });
  }
  return events
    .filter((e) => !Number.isNaN(e.at.getTime()))
    .sort((a, b) => a.at - b.at || (a.type === 'entry' ? -1 : 1));
};

const sameInstant = (a, b) => Math.abs(a - b) < 1500;

/**
 * @param logs     today's EntryLog rows for the student
 * @param current  { type: 'entry'|'exit', at: Date } — the event being notified
 */
const computeActivity = (logs, current, timeZone) => {
  const events = flatten(logs);
  if (!events.some((e) => e.type === current.type && sameInstant(e.at, current.at))) {
    events.push({ type: current.type, at: current.at });
    events.sort((a, b) => a.at - b.at);
  }

  const sessions = [];
  let open = null;
  let orphans = 0;
  let currentSession = null;
  for (const e of events) {
    if (e.type === 'entry') {
      if (open) orphans += 1; // entry with no exit before the next entry
      open = e;
    } else if (open) {
      const session = { in: open.at, out: e.at, ms: e.at - open.at };
      sessions.push(session);
      if (current.type === 'exit' && sameInstant(e.at, current.at)) currentSession = session;
      open = null;
    } else {
      orphans += 1; // exit with no matching entry
    }
  }

  const entries = events.filter((e) => e.type === 'entry');
  const exits = events.filter((e) => e.type === 'exit');
  const last = events[events.length - 1];
  const completedMs = sessions.reduce((sum, s) => sum + s.ms, 0);

  let timeOnCampus;
  if (sessions.length) timeOnCampus = formatDuration(completedMs);
  else timeOnCampus = current.type === 'entry' ? 'Visit in progress' : NA;

  return {
    firstEntry: entries.length ? formatTime(entries[0].at, timeZone) : NA,
    lastExit: exits.length ? formatTime(exits[exits.length - 1].at, timeZone) : 'Not exited yet',
    timeOnCampus,
    // Exit email only: the visit that this exit closes, never an unmatched pair.
    visitDuration: currentSession ? formatDuration(currentSession.ms) : NA,
    visitCount: sessions.length + (open ? 1 : 0),
    excludesUnmatched: orphans > 0,
    status: last && last.type === 'entry' ? 'Inside Campus' : 'Outside Campus',
  };
};

module.exports = { computeActivity, flatten };
