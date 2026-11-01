import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiOutlineX,
  HiOutlineUpload,
  HiOutlineDownload,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineDocumentText,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  downloadBulkTemplateApi,
  validateBulkUploadApi,
  getBulkStatusApi,
  getBulkRowsApi,
  confirmBulkApi,
  cancelBulkApi,
  downloadBulkReportApi,
} from '../services/api';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // the server enforces its own limit too
const PAGE_SIZE = 25;

const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'validate', label: 'Validate' },
  { id: 'review', label: 'Review' },
  { id: 'enroll', label: 'Enroll' },
  { id: 'report', label: 'Report' },
];

const STATUS_BADGE = {
  valid: { label: 'Ready', className: 'bg-emerald-100 text-emerald-800' },
  invalid: { label: 'Invalid', className: 'bg-red-100 text-red-800' },
  duplicate_in_file: { label: 'Duplicate in file', className: 'bg-amber-100 text-amber-800' },
  existing: { label: 'Already enrolled', className: 'bg-sky-100 text-sky-800' },
};

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'valid', label: 'Ready' },
  { id: 'invalid', label: 'Invalid' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'existing', label: 'Already enrolled' },
];

const OUTCOME_FILTERS = [
  { id: '', label: 'All' },
  { id: 'enrolled', label: 'Enrolled' },
  { id: 'failed', label: 'Failed' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'invalid', label: 'Invalid' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'existing', label: 'Already enrolled' },
];

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const saveBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Blob error responses carry JSON text; surface the server's own message when there is one.
const errorMessage = async (error, fallback) => {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).message || fallback;
    } catch (_e) {
      return fallback;
    }
  }
  return data?.message || fallback;
};

function Stepper({ current }) {
  const index = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Bulk enrollment steps">
      {STEPS.map((step, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        return (
          <li key={step.id} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${
                state === 'current' ? 'bg-primary-600 text-white' : state === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className={state === 'current' ? 'font-semibold text-gray-900' : 'text-gray-500'}>{step.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 text-gray-300" aria-hidden="true">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-50 text-gray-900',
    green: 'bg-emerald-50 text-emerald-800',
    red: 'bg-red-50 text-red-800',
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-sky-50 text-sky-800',
  };
  return (
    <div className={`rounded-lg px-4 py-3 ${tones[tone]}`}>
      <div className="text-2xl font-bold" data-testid={`stat-${label}`}>{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide opacity-75">{label}</div>
    </div>
  );
}

function RowsTable({ rows, showOutcome }) {
  if (!rows.length) return <p className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">No rows match this filter.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Excel row</th>
            <th className="px-3 py-2">SAP ID</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">{showOutcome ? 'Result / issues' : 'Issues'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row) => {
            const badge = STATUS_BADGE[row.status] || STATUS_BADGE.invalid;
            return (
              <tr key={row.rowNumber} data-testid={`row-${row.rowNumber}`}>
                <td className="px-3 py-2 font-mono text-gray-700">{row.rowNumber}</td>
                <td className="px-3 py-2 font-mono">{row.sapId || '-'}</td>
                <td className="px-3 py-2">{row.name || '-'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                  {row.outcome && <span className="ml-1 text-xs font-semibold text-gray-600">{row.outcome}</span>}
                </td>
                <td className="px-3 py-2 text-gray-700">
                  {row.outcomeMessage && <div className="text-red-700">{row.outcomeMessage}</div>}
                  {row.issues.length === 0 && !row.outcomeMessage && <span className="text-gray-400">None</span>}
                  {row.issues.map((issue, i) => (
                    <div key={i} className={issue.severity === 'warning' ? 'text-amber-700' : 'text-red-700'}>
                      {issue.severity === 'warning' ? 'Warning: ' : ''}{issue.message}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ExcelUploadModal({ isOpen, onClose, onSuccess, pollMs = 800 }) {
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [uploadPercent, setUploadPercent] = useState(null);
  const [job, setJob] = useState(null);
  const [rows, setRows] = useState({ rows: [], total: 0, pages: 1 });
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setError('');
    setUploadPercent(null);
    setJob(null);
    setRows({ rows: [], total: 0, pages: 1 });
    setFilter('');
    setSearch('');
    setPage(1);
    setConfirming(false);
    setBusy(false);
  }, []);

  // Rows for the review / report tables.
  useEffect(() => {
    if (!job?.id || (step !== 'review' && step !== 'report')) return undefined;
    let cancelled = false;
    getBulkRowsApi(job.id, { filter, search, page, limit: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) setRows(res.data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the rows. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, step, filter, search, page, job?.status]);

  // Real progress while the server enrolls in batches.
  useEffect(() => {
    if (step !== 'enroll' || !job?.id) return undefined;
    let stopped = false;
    let timer;
    const poll = async () => {
      try {
        const { data } = await getBulkStatusApi(job.id);
        if (stopped || !mounted.current) return;
        setJob(data);
        if (data.status !== 'processing') {
          setFilter('');
          setPage(1);
          setStep('report');
          onSuccess?.();
          return;
        }
      } catch (_e) {
        if (!stopped && mounted.current) setError('Lost contact with the server; still trying…');
      }
      if (!stopped) timer = setTimeout(poll, pollMs);
    };
    timer = setTimeout(poll, pollMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [step, job?.id, pollMs, onSuccess]);

  const pickFile = (candidate) => {
    setError('');
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null);
      setError(candidate.name.toLowerCase().endsWith('.xls')
        ? 'Old .xls files are not supported. Open it in Excel and save it as .xlsx.'
        : 'Only .xlsx files are allowed.');
      return;
    }
    if (candidate.size === 0) {
      setFile(null);
      setError('That file is empty.');
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setFile(null);
      setError(`That file is ${formatSize(candidate.size)}. The limit is ${formatSize(MAX_FILE_BYTES)}.`);
      return;
    }
    setFile(candidate);
  };

  const downloadTemplate = async () => {
    try {
      const res = await downloadBulkTemplateApi();
      saveBlob(res.data, 'student-enrollment-template.xlsx');
    } catch (e) {
      toast.error(await errorMessage(e, 'Could not download the template'));
    }
  };

  const validateFile = async () => {
    if (!file) return;
    setError('');
    setStep('validate');
    setUploadPercent(0);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await validateBulkUploadApi(formData, (event) => {
        if (event.total) setUploadPercent(Math.round((event.loaded / event.total) * 100));
      });
      if (!mounted.current) return;
      setJob(data);
      setFilter('');
      setSearch('');
      setPage(1);
      setStep('review');
    } catch (e) {
      if (!mounted.current) return;
      setError(await errorMessage(e, 'The file could not be validated.'));
      setStep('upload');
    }
  };

  const downloadReport = async (type) => {
    try {
      const res = await downloadBulkReportApi(job.id, type);
      saveBlob(res.data, `bulk-enrollment-${type}.xlsx`);
    } catch (e) {
      toast.error(await errorMessage(e, 'Could not download the report'));
    }
  };

  const confirmEnrollment = async () => {
    setBusy(true);
    try {
      const { data } = await confirmBulkApi(job.id);
      setJob(data);
      setConfirming(false);
      setError('');
      setStep('enroll');
    } catch (e) {
      setConfirming(false);
      setError(await errorMessage(e, 'Could not start the enrollment.'));
    } finally {
      setBusy(false);
    }
  };

  const discardUpload = async () => {
    try {
      if (job?.id && job.status === 'awaiting_confirmation') await cancelBulkApi(job.id);
    } catch (_e) {
      // Nothing was saved either way; just leave the workflow.
    }
    reset();
  };

  const handleClose = () => {
    if (step === 'review' && job?.status === 'awaiting_confirmation') cancelBulkApi(job.id).catch(() => {});
    reset();
    onClose();
  };

  if (!isOpen) return null;

  const totals = job?.totals;
  const progress = job?.progress;
  const percent = progress?.total ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Bulk student enrollment">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-6 py-4">
          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Bulk student enrollment</h2>
              <p className="mt-1 text-sm text-gray-500">Nothing is saved until you review the preview and confirm.</p>
            </div>
            <Stepper current={step} />
          </div>
          <button onClick={handleClose} className="text-gray-500 transition hover:text-gray-700" aria-label="Close">
            <HiOutlineX className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 01 Upload */}
          {step === 'upload' && (
            <>
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">How it works</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Download the official template and fill one student per row (delete the grey sample row).</li>
                  <li>Upload it here. Every row is checked and duplicates are found, but nothing is saved yet.</li>
                  <li>Review the preview, then confirm to enroll the valid students.</li>
                </ol>
                <button type="button" onClick={downloadTemplate} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 font-medium text-blue-800 hover:bg-blue-100">
                  <HiOutlineDownload className="h-5 w-5" /> Download template
                </button>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
                className={`rounded-lg border-2 border-dashed p-8 text-center transition ${dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
                data-testid="dropzone"
              >
                <HiOutlineUpload className="mx-auto h-10 w-10 text-gray-400" />
                <p className="mt-2 text-gray-700">Drag and drop your Excel file here, or</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  aria-label="Choose Excel file"
                  data-testid="file-input"
                  onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
                />
                <button type="button" onClick={() => inputRef.current?.click()} className="mt-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50">
                  Browse file
                </button>
                <p className="mt-2 text-xs text-gray-500">.xlsx only, up to {formatSize(MAX_FILE_BYTES)}</p>
              </div>

              {file && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <HiOutlineDocumentText className="h-8 w-8 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800">{file.name}</p>
                      <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={validateFile} className="shrink-0 rounded-lg bg-primary-600 px-5 py-2 font-semibold text-white hover:bg-primary-700">
                    Validate file
                  </button>
                </div>
              )}
            </>
          )}

          {/* 02 Validate */}
          {step === 'validate' && (
            <div className="py-10 text-center" role="status" aria-live="polite">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
              <p className="mt-4 font-semibold text-gray-800">{file?.name}</p>
              {uploadPercent !== null && uploadPercent < 100 ? (
                <p className="text-sm text-gray-600">Uploading… {uploadPercent}%</p>
              ) : (
                <p className="text-sm text-gray-600">Reading the workbook, validating every row and checking for duplicates…</p>
              )}
            </div>
          )}

          {/* 03 Review */}
          {step === 'review' && totals && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">{job.fileName}</span> · {formatSize(job.fileSize)}</p>
                {totals.blankRows > 0 && <p className="text-xs text-gray-500">{totals.blankRows} blank row(s) ignored</p>}
              </div>
              {job.unknownColumns?.length > 0 && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Ignored unknown column(s): {job.unknownColumns.join(', ')}</p>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Total rows" value={totals.rows} />
                <Stat label="Ready to enroll" value={totals.valid} tone="green" />
                <Stat label="Invalid" value={totals.invalid} tone="red" />
                <Stat label="Duplicates in file" value={totals.duplicateInFile} tone="amber" />
                <Stat label="Already enrolled" value={totals.existing} tone="blue" />
              </div>
              {totals.valid === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">There are no new valid students in this file, so there is nothing to enroll. Fix the rows below and upload again.</p>}

              <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map((item) => (
                  <button
                    key={item.id || 'all'}
                    type="button"
                    onClick={() => { setFilter(item.id); setPage(1); }}
                    aria-pressed={filter === item.id}
                    className={`rounded-full px-3 py-1 text-sm ${filter === item.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {item.label}
                  </button>
                ))}
                <input
                  type="search"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search SAP ID, name or email"
                  aria-label="Search rows"
                  className="ml-auto min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm md:max-w-xs"
                />
              </div>

              <RowsTable rows={rows.rows} />
              {rows.pages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{rows.total} rows · page {page} of {rows.pages}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
                    <button type="button" disabled={page >= rows.pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={discardUpload} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">Discard and start over</button>
                  {totals.invalid + totals.duplicateInFile + totals.existing > 0 && (
                    <button type="button" onClick={() => downloadReport('all')} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">
                      <HiOutlineDownload className="h-5 w-5" /> Download problem report
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={totals.valid === 0}
                  onClick={() => setConfirming(true)}
                  className="rounded-lg bg-primary-600 px-6 py-2 font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Enroll {totals.valid} student{totals.valid === 1 ? '' : 's'}
                </button>
              </div>

              {confirming && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-40 p-4">
                  <div role="alertdialog" aria-modal="true" aria-label="Confirm enrollment" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                    <h3 className="text-lg font-bold text-gray-900">Enroll {totals.valid} student{totals.valid === 1 ? '' : 's'}?</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      {totals.valid} new student record{totals.valid === 1 ? ' is' : 's are'} saved now.
                      {totals.invalid + totals.duplicateInFile + totals.existing > 0 &&
                        ` ${totals.invalid + totals.duplicateInFile + totals.existing} other row(s) will be skipped and listed in the report.`}
                      {' '}Existing students are never overwritten.
                    </p>
                    <div className="mt-5 flex justify-end gap-2">
                      <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">Go back</button>
                      <button type="button" onClick={confirmEnrollment} disabled={busy} className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
                        {busy ? 'Starting…' : 'Yes, enroll them'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 04 Enroll */}
          {step === 'enroll' && progress && (
            <div className="space-y-4 py-4" role="status" aria-live="polite">
              <div>
                <p className="font-semibold text-gray-800">{job.phase}</p>
                <p className="text-sm text-gray-500">{job.fileName} · {formatSize(job.fileSize)}</p>
              </div>
              <div className="h-4 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-primary-600 transition-all"
                  style={{ width: `${percent}%` }}
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Enrollment progress"
                />
              </div>
              <p className="text-sm text-gray-600">{progress.processed} of {progress.total} processed · {percent}%</p>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Enrolled" value={progress.enrolled} tone="green" />
                <Stat label="Failed" value={progress.failed} tone="red" />
                <Stat label="Skipped" value={progress.skipped} tone="amber" />
              </div>
              <p className="text-xs text-gray-500">You can keep this window open; the enrollment also continues if you close it.</p>
            </div>
          )}

          {/* 05 Report */}
          {step === 'report' && job && progress && (
            <>
              <div
                className={`flex items-start gap-3 rounded-lg p-4 ${
                  job.status === 'completed' ? 'bg-emerald-50 text-emerald-900' : job.status === 'failed' ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'
                }`}
                role="status"
              >
                {job.status === 'completed' ? <HiOutlineCheckCircle className="h-7 w-7 shrink-0" /> : <HiOutlineExclamationCircle className="h-7 w-7 shrink-0" />}
                <div>
                  <p className="font-bold">{job.phase}</p>
                  <p className="text-sm">
                    {progress.enrolled} student{progress.enrolled === 1 ? '' : 's'} enrolled
                    {job.status !== 'completed' && ', some rows need attention (see the report)'}.
                  </p>
                  {job.error && <p className="mt-1 text-sm">{job.error}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                <Stat label="Total rows" value={totals.rows} />
                <Stat label="Enrolled" value={progress.enrolled} tone="green" />
                <Stat label="Failed to save" value={progress.failed} tone="red" />
                <Stat label="Skipped" value={progress.skipped} tone="amber" />
                <Stat label="Invalid" value={totals.invalid} tone="red" />
                <Stat label="Duplicates in file" value={totals.duplicateInFile} tone="amber" />
                <Stat label="Already enrolled" value={totals.existing} tone="blue" />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ['summary', 'Full summary'],
                  ['enrolled', 'Enrolled students'],
                  ['failed', 'Failed records'],
                  ['invalid', 'Invalid records'],
                  ['duplicates', 'Duplicates'],
                  ['existing', 'Already enrolled'],
                ].map(([type, label]) => (
                  <button key={type} type="button" onClick={() => downloadReport(type)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <HiOutlineDownload className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {OUTCOME_FILTERS.map((item) => (
                  <button
                    key={item.id || 'all'}
                    type="button"
                    onClick={() => { setFilter(item.id); setPage(1); }}
                    aria-pressed={filter === item.id}
                    className={`rounded-full px-3 py-1 text-sm ${filter === item.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <RowsTable rows={rows.rows} showOutcome />
              {rows.pages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{rows.total} rows · page {page} of {rows.pages}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
                    <button type="button" disabled={page >= rows.pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t pt-4">
                <button type="button" onClick={reset} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">Upload another file</button>
                <button type="button" onClick={handleClose} className="rounded-lg bg-primary-600 px-5 py-2 font-semibold text-white hover:bg-primary-700">Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
