import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineClock,
  HiOutlineHome,
  HiOutlineSearch,
  HiOutlineUser,
} from 'react-icons/hi';
import {
  createHostellerRequestApi,
  getPublicHostellerStatusApi,
} from '../services/api';

const reasons = [
  'Medical',
  'Family Visit',
  'Personal Work',
  'Emergency',
  'Other',
];

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'N/A';

export default function StudentExitRequest() {
  const [sapId, setSapId] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({
    reason: 'Medical',
    reasonDetail: '',
    requestedExitTime: '',
    expectedReturnTime: '',
  });

  const lookupStudent = async () => {
    if (!sapId.trim()) {
      toast.error('Enter SAP ID');
      return;
    }

    setSearching(true);
    try {
      const res = await getPublicHostellerStatusApi(sapId.trim());
      setProfile(res.data.student);
      setStatus(res.data.latestRequest);
    } catch (error) {
      setProfile(null);
      setStatus(null);
      toast.error(error.response?.data?.message || 'Failed to find student');
    } finally {
      setSearching(false);
    }
  };

  const submitRequest = async (e) => {
    e.preventDefault();

    if (status && ['pending', 'approved'].includes(status.status)) {
      toast.error('An active request already exists');
      return;
    }

    setSubmitting(true);

    try {
      const finalReason = form.reason === 'Other' && form.reasonDetail.trim()
        ? `Other - ${form.reasonDetail.trim()}`
        : form.reason === 'Other'
        ? 'Other'
        : form.reasonDetail.trim()
        ? `${form.reason} - ${form.reasonDetail.trim()}`
        : form.reason;

      const res = await createHostellerRequestApi({
        sapId: sapId.trim(),
        reason: finalReason,
        requestedExitTime: form.requestedExitTime || undefined,
        expectedReturnTime: form.expectedReturnTime,
      });

      setStatus(res.data.request);
      toast.success('Exit request submitted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-amber-50 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Hosteller Exit Request</h1>
          <p className="mt-2 text-sm text-gray-600">
            Submit an exit request using your SAP ID. Your hostel and warden details will be auto-loaded.
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={sapId}
                onChange={(e) => setSapId(e.target.value)}
                placeholder="Enter SAP ID"
                className="w-full rounded-2xl border border-gray-300 py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              type="button"
              onClick={lookupStudent}
              disabled={searching}
              className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {searching ? 'Searching...' : 'Find Student'}
            </button>
          </div>
        </div>

        {profile && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,1.1fr]">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-800">Student Details</h2>
              <div className="mt-5 space-y-4 text-sm text-gray-700">
                <div className="flex items-center gap-3">
                  <HiOutlineUser className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-900">{profile.name}</p>
                    <p>{profile.sapId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <HiOutlineHome className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-900">{profile.hostel?.name || 'No hostel assigned'}</p>
                    <p>Room {profile.roomNumber || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <HiOutlineClock className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-900">{profile.warden?.name || 'No warden assigned'}</p>
                    <p>{profile.warden?.email || 'No email available'}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-800">Submit Exit Request</h2>
              <form onSubmit={submitRequest} className="mt-5 space-y-4">
                <select
                  value={form.reason}
                  onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
                  className="w-full rounded-2xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {reasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={3}
                  value={form.reasonDetail}
                  onChange={(e) => setForm((current) => ({ ...current, reasonDetail: e.target.value }))}
                  placeholder="Additional details"
                  className="w-full rounded-2xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600">Requested Exit Time</label>
                    <input
                      type="datetime-local"
                      value={form.requestedExitTime}
                      onChange={(e) => setForm((current) => ({ ...current, requestedExitTime: e.target.value }))}
                      className="w-full rounded-2xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600">Expected Return Time</label>
                    <input
                      type="datetime-local"
                      value={form.expectedReturnTime}
                      onChange={(e) => setForm((current) => ({ ...current, expectedReturnTime: e.target.value }))}
                      className="w-full rounded-2xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting || (status && ['pending', 'approved'].includes(status.status))}
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </form>
            </section>
          </div>
        )}

        {status && (
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800">Latest Request Status</h2>
            <div className="mt-5 grid grid-cols-1 gap-4 text-sm text-gray-700 md:grid-cols-2">
              <p><span className="font-semibold text-gray-900">Status:</span> {status.status}</p>
              <p><span className="font-semibold text-gray-900">Reason:</span> {status.reason}</p>
              <p><span className="font-semibold text-gray-900">Expected Return:</span> {formatDateTime(status.expectedReturnTime)}</p>
              <p><span className="font-semibold text-gray-900">Submitted:</span> {formatDateTime(status.createdAt)}</p>
              {status.rejectionReason && (
                <p className="md:col-span-2"><span className="font-semibold text-gray-900">Rejection Reason:</span> {status.rejectionReason}</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
