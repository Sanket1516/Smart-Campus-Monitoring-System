/**
 * Test / preview fixtures. These are NOT used at runtime — production emails are built from live data.
 * Times are fixed so the activity maths is deterministic.
 */
const IST = (hhmm, day = '2026-10-30') => new Date(`${day}T${hhmm}:00+05:30`);

const dayScholar = { name: 'Neha Kapoor', sapId: '70552000101', department: 'pharmacy', year: 3, category: 'dayscholars', studentType: 'day_scholar' };
const hosteller = { name: 'Kabir Malhotra', sapId: '70552000103', department: 'computer science', year: 3, category: 'hostellers', studentType: 'hosteller' };

const gate1 = { gateName: 'Main Gate', gateNumber: 1, terminalNumber: 1, terminalLabel: 'Entry Terminal', location: 'Main Entrance, North Campus' };
const gate2 = { gateName: 'Main Gate', gateNumber: 1, terminalNumber: 2, terminalLabel: 'Exit Terminal', location: 'Main Entrance, North Campus' };

const branding = { collegeName: 'Mukesh Patel School of Technology Management and Engineering', collegeLogo: '', timezone: 'Asia/Kolkata' };
const env = {
  ADMIN_CONTACT_PHONE: '+91 22 4233 5000',
  SUPPORT_EMAIL: 'support@example.edu',
  PARENT_PORTAL_URL: 'https://parents.example.edu',
};

const base = (extra) => ({ branding, ...extra });
const entryLog = (at, extra = {}) => ({ entryTime: at, exitTime: null, status: 'entered', ...extra });
const exitLog = (at, extra = {}) => ({ entryTime: null, exitTime: at, status: 'exited', ...extra });
const toggled = (inAt, outAt) => ({ entryTime: inAt, exitTime: outAt, status: 'exited' });

const SCENARIOS = [
  {
    id: '01-dayscholar-entry-biometric',
    title: 'Day scholar enters (fingerprint)',
    env,
    input: base({ student: dayScholar, action: 'entry', timestamp: IST('08:45'), event: { source: 'terminal', verifyMode: 1, terminal: gate1 }, logs: [entryLog(IST('08:45'))] }),
  },
  {
    id: '02-dayscholar-exit-biometric',
    title: 'Day scholar exits after 8h 10m (toggle row)',
    env,
    input: base({ student: dayScholar, action: 'exit', timestamp: IST('16:55'), event: { source: 'terminal', verifyMode: 1, terminal: gate2 }, logs: [toggled(IST('08:45'), IST('16:55'))] }),
  },
  {
    id: '03-hosteller-entry-biometric',
    title: 'Hosteller enters',
    env,
    input: base({ student: hosteller, action: 'entry', timestamp: IST('18:20'), event: { source: 'terminal', verifyMode: 1, terminal: gate1 }, logs: [entryLog(IST('18:20'))] }),
  },
  {
    id: '04-hosteller-exit-biometric',
    title: 'Hosteller exits (per-event rows)',
    env,
    input: base({ student: hosteller, action: 'exit', timestamp: IST('13:05'), event: { source: 'terminal', verifyMode: 1, terminal: gate2 }, logs: [entryLog(IST('09:10')), exitLog(IST('13:05'))] }),
  },
  {
    id: '05-missing-photo-department-gate',
    title: 'Missing photo, department and gate info',
    env: {},
    input: base({ student: { name: 'Aarav Sharma', sapId: '70552000002', category: 'dayscholars' }, action: 'entry', timestamp: IST('09:00'), event: {}, logs: [entryLog(IST('09:00'))] }),
  },
  {
    id: '06-manual-sap-entry',
    title: 'Manual SAP ID verification (never labelled biometric)',
    env,
    input: base({ student: dayScholar, action: 'entry', timestamp: IST('09:30'), event: { source: 'sap_scan' }, logs: [entryLog(IST('09:30'))] }),
  },
  {
    id: '07-unknown-terminal-method',
    title: 'Terminal scan with unreported verification method',
    env,
    input: base({ student: dayScholar, action: 'entry', timestamp: IST('09:30'), event: { source: 'terminal', terminal: gate1 }, logs: [entryLog(IST('09:30'))] }),
  },
  {
    id: '08-exit-missing-entry',
    title: 'Exit with no previous entry record',
    env,
    input: base({ student: dayScholar, action: 'exit', timestamp: IST('15:00'), event: { source: 'terminal', verifyMode: 1, terminal: gate2 }, logs: [exitLog(IST('15:00'))] }),
  },
  {
    id: '09-multiple-visits-exit',
    title: 'Multiple entry/exit events — third exit',
    env,
    input: base({
      student: hosteller,
      action: 'exit',
      timestamp: IST('17:30'),
      event: { source: 'terminal', verifyMode: 1, terminal: gate2 },
      logs: [entryLog(IST('08:00')), exitLog(IST('10:30')), entryLog(IST('12:00')), exitLog(IST('13:15')), entryLog(IST('15:00')), exitLog(IST('17:30'))],
    }),
  },
  {
    id: '10-multiple-visits-reentry',
    title: 'Re-entry after earlier visit',
    env,
    input: base({ student: hosteller, action: 'entry', timestamp: IST('15:00'), event: { source: 'terminal', verifyMode: 1, terminal: gate1 }, logs: [entryLog(IST('08:00')), exitLog(IST('10:30')), entryLog(IST('15:00'))] }),
  },
  {
    id: '11-long-name',
    title: 'Very long student name + hostile characters',
    env,
    input: base({
      student: { ...dayScholar, name: 'Venkata Subramanian Ramachandran Iyer-Krishnamurthy <script>alert(1)</script> & Sons' },
      action: 'entry',
      timestamp: IST('09:05'),
      event: { source: 'terminal', verifyMode: 15, terminal: gate1 },
      logs: [entryLog(IST('09:05'))],
    }),
  },
  {
    id: '12-pin-card-verification',
    title: 'PIN verification at terminal (not biometric)',
    env,
    input: base({ student: dayScholar, action: 'entry', timestamp: IST('09:05'), event: { source: 'terminal', verifyMode: 0, terminal: gate1 }, logs: [entryLog(IST('09:05'))] }),
  },
];

module.exports = { SCENARIOS };
