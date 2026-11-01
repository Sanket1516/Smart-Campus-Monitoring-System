const ExcelJS = require('exceljs');
const { COLUMNS } = require('./columns');

// Spreadsheet formula injection: a text cell that starts with = + - @ (or tab/CR) can run as a formula in
// Excel/Sheets when someone re-opens a generated report. Neutralise it with a leading apostrophe.
const safeCell = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
};

const REPORT_TYPES = ['summary', 'enrolled', 'failed', 'invalid', 'duplicates', 'existing', 'skipped', 'all'];

const STATUS_LABEL = {
  valid: 'Valid',
  invalid: 'Invalid',
  duplicate_in_file: 'Duplicate in file',
  existing: 'Already enrolled',
};

const matchers = {
  enrolled: (row) => row.outcome === 'enrolled',
  failed: (row) => row.outcome === 'failed',
  invalid: (row) => row.status === 'invalid',
  duplicates: (row) => row.status === 'duplicate_in_file',
  existing: (row) => row.status === 'existing',
  skipped: (row) => row.outcome === 'skipped',
  all: () => true,
  summary: () => true,
};

const issueText = (row) => (row.issues || []).map((issue) => `${issue.severity === 'warning' ? 'Warning' : 'Error'}${issue.field ? ` (${issue.field})` : ''}: ${issue.message}`).join('; ');

const buildReport = async (job, type = 'summary') => {
  const kind = REPORT_TYPES.includes(type) ? type : 'summary';
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart Campus Monitor';

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 38 }, { width: 18 }];
  const { totals, progress } = job;
  [
    ['BULK ENROLLMENT SUMMARY', ''],
    ['File', job.fileName],
    ['Status', job.status],
    ['Started', job.startedAt ? job.startedAt.toISOString() : ''],
    ['Finished', job.finishedAt ? job.finishedAt.toISOString() : ''],
    ['', ''],
    ['Total records in Excel', totals.rows],
    ['Blank rows ignored', totals.blankRows],
    ['Valid records (new students)', totals.valid],
    ['Invalid records', totals.invalid],
    ['Duplicate records inside the file', totals.duplicateInFile],
    ['Already enrolled (existing in database)', totals.existing],
    ['', ''],
    ['Successfully enrolled', progress.enrolled],
    ['Failed during insertion', progress.failed],
    ['Skipped', progress.skipped],
  ].forEach(([label, value]) => summary.addRow([safeCell(label), safeCell(value)]));
  summary.getRow(1).font = { bold: true, size: 14 };

  {
    const rowsSheet = workbook.addWorksheet(kind === 'summary' ? 'All rows' : kind);
    const fieldHeaders = COLUMNS.map((column) => column.header);
    rowsSheet.addRow(['Excel row', ...fieldHeaders, 'Validation', 'Outcome', 'Details']).font = { bold: true };
    job.rows
      .filter(matchers[kind] || matchers.all)
      .forEach((row) => {
        const source = row.raw || row.data || {};
        rowsSheet.addRow([
          row.rowNumber,
          ...COLUMNS.map((column) => safeCell(source[column.key] ?? '')),
          STATUS_LABEL[row.status] || row.status,
          row.outcome || '',
          safeCell([issueText(row), row.outcomeMessage].filter(Boolean).join(' | ')),
        ]);
      });
    rowsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return { workbook, kind };
};

module.exports = { buildReport, safeCell, REPORT_TYPES };
