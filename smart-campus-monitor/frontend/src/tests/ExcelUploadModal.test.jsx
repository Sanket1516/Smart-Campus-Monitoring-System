import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import ExcelUploadModal from '../components/ExcelUploadModal';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  downloadBulkTemplateApi: vi.fn(),
  validateBulkUploadApi: vi.fn(),
  getBulkStatusApi: vi.fn(),
  getBulkRowsApi: vi.fn(),
  confirmBulkApi: vi.fn(),
  cancelBulkApi: vi.fn(),
  downloadBulkReportApi: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

const xlsx = (name = 'students.xlsx', size = 2048) => {
  const file = new File(['x'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const job = (overrides = {}) => ({
  id: 'job1',
  fileName: 'students.xlsx',
  fileSize: 2048,
  status: 'awaiting_confirmation',
  phase: 'Awaiting confirmation',
  totals: { rows: 6, blankRows: 1, valid: 3, invalid: 1, duplicateInFile: 1, existing: 1 },
  unknownColumns: [],
  progress: { total: 3, processed: 0, enrolled: 0, failed: 0, skipped: 0 },
  error: '',
  ...overrides,
});

const row = (rowNumber, status, extra = {}) => ({
  rowNumber, status, outcome: '', outcomeMessage: '', issues: [], conflict: false,
  sapId: `7100000000${rowNumber}`, name: `Student ${rowNumber}`, ...extra,
});

const ALL_ROWS = [
  row(2, 'valid'),
  row(3, 'invalid', { issues: [{ severity: 'error', field: 'email', message: 'Invalid email address "bad"' }] }),
  row(4, 'duplicate_in_file', { issues: [{ severity: 'error', field: 'sapId', message: 'SAP ID already appears in row 2 of this file' }] }),
  row(5, 'existing', { issues: [{ severity: 'error', field: 'sapId', message: 'SAP ID is already enrolled. The existing record is NOT overwritten' }] }),
];

const setup = async (props = {}) => {
  const utils = render(<ExcelUploadModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} pollMs={5} {...props} />);
  return utils;
};

const chooseFile = (file) => fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

const reachReview = async (jobData = job()) => {
  api.validateBulkUploadApi.mockResolvedValue({ data: jobData });
  api.getBulkRowsApi.mockResolvedValue({ data: { rows: ALL_ROWS, total: 4, page: 1, pages: 1 } });
  const utils = await setup();
  chooseFile(xlsx());
  fireEvent.click(screen.getByRole('button', { name: /validate file/i }));
  await screen.findByText(/ready to enroll/i);
  return utils;
};

beforeEach(() => {
  vi.clearAllMocks();
  window.URL.createObjectURL = vi.fn(() => 'blob:test');
  window.URL.revokeObjectURL = vi.fn();
});

describe('Bulk enrollment modal', () => {
  it('shows the five workflow stages and the upload instructions', async () => {
    await setup();
    const steps = screen.getByRole('list', { name: /bulk enrollment steps/i });
    ['Upload', 'Validate', 'Review', 'Enroll', 'Report'].forEach((label) => expect(within(steps).getByText(label)).toBeInTheDocument());
    expect(within(steps).getByText('Upload').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(/nothing is saved until you review/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument();
  });

  it('downloads the official template from the server', async () => {
    api.downloadBulkTemplateApi.mockResolvedValue({ data: new Blob(['x']) });
    await setup();
    fireEvent.click(screen.getByRole('button', { name: /download template/i }));
    await waitFor(() => expect(api.downloadBulkTemplateApi).toHaveBeenCalled());
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it.each([
    ['students.csv', 100, /only \.xlsx/i],
    ['students.xls', 100, /old \.xls/i],
    ['students.xlsx', 0, /empty/i],
    ['students.xlsx', 6 * 1024 * 1024, /limit is/i],
  ])('rejects %s (%i bytes) before uploading', async (name, size, message) => {
    await setup();
    chooseFile(xlsx(name, size));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: /validate file/i })).not.toBeInTheDocument();
    expect(api.validateBulkUploadApi).not.toHaveBeenCalled();
  });

  it('accepts a dropped file', async () => {
    await setup();
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [xlsx('dropped.xlsx')] } });
    expect(await screen.findByText('dropped.xlsx')).toBeInTheDocument();
  });

  it('shows the server message and stays on the upload step when validation fails', async () => {
    api.validateBulkUploadApi.mockRejectedValue({ response: { data: { message: 'Missing required column(s): email.' } } });
    await setup();
    chooseFile(xlsx());
    fireEvent.click(screen.getByRole('button', { name: /validate file/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Missing required column(s): email.');
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument();
  });

  it('shows real upload progress while the file is being sent', async () => {
    let report;
    api.validateBulkUploadApi.mockImplementation((_form, onProgress) => new Promise((resolve) => { report = { onProgress, resolve }; }));
    api.getBulkRowsApi.mockResolvedValue({ data: { rows: [], total: 0, pages: 1 } });
    await setup();
    chooseFile(xlsx());
    fireEvent.click(screen.getByRole('button', { name: /validate file/i }));
    await waitFor(() => expect(report).toBeDefined());
    report.onProgress({ loaded: 25, total: 100 });
    expect(await screen.findByText(/uploading… 25%/i)).toBeInTheDocument();
    report.resolve({ data: job() });
    await screen.findByText(/ready to enroll/i);
  });

  it('shows the preview: counts, every status badge and row-level errors with the Excel row number', async () => {
    await reachReview();
    expect(screen.getByTestId('stat-Total rows')).toHaveTextContent('6');
    expect(screen.getByTestId('stat-Ready to enroll')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-Invalid')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-Duplicates in file')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-Already enrolled')).toHaveTextContent('1');
    expect(screen.getByText(/1 blank row\(s\) ignored/)).toBeInTheDocument();
    const invalid = screen.getByTestId('row-3');
    expect(within(invalid).getByText('3')).toBeInTheDocument();
    expect(invalid).toHaveTextContent('Invalid email address "bad"');
    expect(screen.getByTestId('row-4')).toHaveTextContent('Duplicate in file');
    expect(screen.getByTestId('row-5')).toHaveTextContent('NOT overwritten');
    expect(api.confirmBulkApi).not.toHaveBeenCalled(); // viewing the preview saves nothing
  });

  it('filters and searches through the server', async () => {
    await reachReview();
    api.getBulkRowsApi.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Invalid' }));
    await waitFor(() => expect(api.getBulkRowsApi).toHaveBeenCalledWith('job1', expect.objectContaining({ filter: 'invalid', page: 1 })));
    fireEvent.change(screen.getByLabelText(/search rows/i), { target: { value: '7100' } });
    await waitFor(() => expect(api.getBulkRowsApi).toHaveBeenCalledWith('job1', expect.objectContaining({ search: '7100' })));
  });

  it('needs an explicit confirmation before anything is enrolled', async () => {
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: /enroll 3 students/i }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(/3 new student records are saved now/i);
    expect(dialog).toHaveTextContent(/3 other row\(s\) will be skipped/i);
    expect(api.confirmBulkApi).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /go back/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.confirmBulkApi).not.toHaveBeenCalled();
  });

  it('disables enrollment when there is nothing valid to enroll', async () => {
    await reachReview(job({ totals: { rows: 2, blankRows: 0, valid: 0, invalid: 2, duplicateInFile: 0, existing: 0 } }));
    expect(screen.getByRole('button', { name: /enroll 0 students/i })).toBeDisabled();
    expect(screen.getByText(/nothing to enroll/i)).toBeInTheDocument();
  });

  it('discarding the upload cancels it on the server and returns to the start', async () => {
    api.cancelBulkApi.mockResolvedValue({ data: {} });
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: /discard and start over/i }));
    await waitFor(() => expect(api.cancelBulkApi).toHaveBeenCalledWith('job1'));
    expect(await screen.findByRole('button', { name: /download template/i })).toBeInTheDocument();
  });

  it('runs the whole workflow: confirm, real progress from the server, final report and downloads', async () => {
    api.confirmBulkApi.mockResolvedValue({ data: job({ status: 'processing', phase: 'Starting enrollment' }) });
    api.getBulkStatusApi
      .mockResolvedValueOnce({ data: job({ status: 'processing', phase: 'Enrolling students (1/4)', progress: { total: 4, processed: 1, enrolled: 1, failed: 0, skipped: 0 } }) })
      .mockResolvedValueOnce({ data: job({ status: 'processing', phase: 'Enrolling students (3/4)', progress: { total: 4, processed: 3, enrolled: 2, failed: 1, skipped: 0 } }) })
      .mockResolvedValue({
        data: job({
          status: 'completed_with_errors', phase: 'Completed with errors',
          progress: { total: 4, processed: 4, enrolled: 3, failed: 1, skipped: 0 },
        }),
      });
    api.downloadBulkReportApi.mockResolvedValue({ data: new Blob(['x']) });
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: /enroll 3 students/i }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /yes, enroll them/i }));

    // 04 Enroll: the bar follows the server's counters (25% -> 75%), not a timer.
    const bar = await screen.findByRole('progressbar', { name: /enrollment progress/i });
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '25'));
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '75'));
    expect(screen.getByText(/3 of 4 processed/i)).toBeInTheDocument();

    // 05 Report
    expect(await screen.findByText('Completed with errors', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByTestId('stat-Enrolled')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-Failed to save')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: /failed records/i }));
    await waitFor(() => expect(api.downloadBulkReportApi).toHaveBeenCalledWith('job1', 'failed'));
    fireEvent.click(screen.getByRole('button', { name: /full summary/i }));
    await waitFor(() => expect(api.downloadBulkReportApi).toHaveBeenCalledWith('job1', 'summary'));
  });

  it('refreshes the student list when the enrollment finishes', async () => {
    const onSuccess = vi.fn();
    api.validateBulkUploadApi.mockResolvedValue({ data: job() });
    api.getBulkRowsApi.mockResolvedValue({ data: { rows: ALL_ROWS, total: 4, pages: 1 } });
    api.confirmBulkApi.mockResolvedValue({ data: job({ status: 'processing' }) });
    api.getBulkStatusApi.mockResolvedValue({ data: job({ status: 'completed', phase: 'Enrollment completed', progress: { total: 3, processed: 3, enrolled: 3, failed: 0, skipped: 0 } }) });
    render(<ExcelUploadModal isOpen onClose={vi.fn()} onSuccess={onSuccess} pollMs={5} />);
    chooseFile(xlsx());
    fireEvent.click(screen.getByRole('button', { name: /validate file/i }));
    await screen.findByText(/ready to enroll/i);
    fireEvent.click(screen.getByRole('button', { name: /enroll 3 students/i }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /yes, enroll them/i }));
    expect(await screen.findByText('Enrollment completed', { selector: 'p' })).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('reports a refused confirmation (for example a double click) instead of pretending it worked', async () => {
    api.confirmBulkApi.mockRejectedValue({ response: { data: { message: 'This upload is already processing and cannot be confirmed again.' } } });
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: /enroll 3 students/i }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /yes, enroll them/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already processing/i);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows a failed run honestly', async () => {
    api.confirmBulkApi.mockResolvedValue({ data: job({ status: 'processing' }) });
    api.getBulkStatusApi.mockResolvedValue({ data: job({ status: 'failed', phase: 'Enrollment failed', error: 'Enrollment was interrupted.', progress: { total: 3, processed: 3, enrolled: 0, failed: 3, skipped: 0 } }) });
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: /enroll 3 students/i }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /yes, enroll them/i }));
    expect(await screen.findByText('Enrollment failed', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Enrollment was interrupted.')).toBeInTheDocument();
    expect(screen.getByTestId('stat-Enrolled')).toHaveTextContent('0');
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ExcelUploadModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
