import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineDownload,
  HiOutlineExclamationCircle,
  HiOutlineRefresh,
  HiOutlineX,
} from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  approveHostellerRequestApi,
  getActiveHostellerRequestsApi,
  getHostellerRequestsApi,
  rejectHostellerRequestApi,
} from '../services/api';

const tabs = [
  { id: 'pending', label: 'Pending Requests' },
  { id: 'active', label: 'Active Approvals' },
  { id: 'history', label: 'History' },
];

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'N/A';

const formatRelative = (value) => {
  if (!value) return 'N/A';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff} min ago`;
  return `${Math.floor(diff / 60)} hr ago`;
};

const buildCountdown = (deadline) => {
  if (!deadline) return { label: 'N/A', urgent: false, expired: false };
  const diff = new Date(deadline).getTime() - Date.now();
  const minutes = Math.floor(Math.abs(diff) / 60000);
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  const label = `${diff >= 0 ? '' : '-'}${hours}h ${remMinutes}m`;
  return {
    label,
    urgent: diff >= 0 && minutes < 15,
    expired: diff < 0,
  };
};

const downloadCsv = (rows) => {
  const headers = ['Student', 'SAP ID', 'Hostel', 'Status', 'Reason', 'Requested Exit', 'Expected Return', 'Created At'];
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.student?.name || '',
        row.student?.sapId || '',
        row.hostel?.name || '',
        row.status || '',
        `"${(row.reason || '').replace(/"/g, '""')}"`,
        row.requestedExitTime ? new Date(row.requestedExitTime).toISOString() : '',
        row.expectedReturnTime ? new Date(row.expectedReturnTime).toISOString() : '',
        row.createdAt ? new Date(row.createdAt).toISOString() : '',
      ].join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'hosteller-history.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function WardenPortal() {
  const { admin } = useAuth();
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [historyRequests, setHistoryRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [historyFilter, setHistoryFilter] = useState({
    hostel: 'all',
    status: 'all',
    student: '',
    date: '',
  });
  const [lateAlerts, setLateAlerts] = useState([]);
  const [, setTick] = useState(0);

  const loadPortal = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [pendingRes, activeRes, historyRes] = await Promise.all([
        getHostellerRequestsApi({ status: 'pending' }),
        getActiveHostellerRequestsApi(),
        getHostellerRequestsApi(),
      ]);

      setPendingRequests(pendingRes.data.requests || []);
      setActiveRequests(activeRes.data.requests || []);
      setHistoryRequests(historyRes.data.requests || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load warden portal');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick((current) => current + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;

    const handleNewRequest = (payload) => {
      setPendingRequests((current) => [
        {
          _id: `live-${Date.now()}-${Math.random()}`,
          student: {
            name: payload.studentName,
            sapId: payload.sapId,
            roomNumber: payload.roomNumber,
          },
          hostel: {
            _id: payload.hostelId,
            name: payload.hostelName,
          },
          reason: payload.reason,
          requestedExitTime: payload.requestedExitTime,
          expectedReturnTime: payload.expectedReturnTime,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    };

    const handleLateReturn = (payload) => {
      setLateAlerts((current) => [
        {
          id: `late-${Date.now()}-${Math.random()}`,
          ...payload,
        },
        ...current,
      ].slice(0, 10));
      toast.error(`${payload.studentName} is ${payload.minutesLate} minutes late`);
    };

    socket.on('warden:new_request', handleNewRequest);
    socket.on('warden:late_return', handleLateReturn);

    return () => {
      socket.off('warden:new_request', handleNewRequest);
      socket.off('warden:late_return', handleLateReturn);
    };
  }, [socket]);

  const filteredHistory = useMemo(
    () =>
      historyRequests.filter((request) => {
        const matchesHostel =
          historyFilter.hostel === 'all' || request.hostel?._id === historyFilter.hostel;
        const matchesStatus =
          historyFilter.status === 'all' || request.status === historyFilter.status;
        const matchesStudent =
          !historyFilter.student ||
          request.student?.name?.toLowerCase().includes(historyFilter.student.toLowerCase()) ||
          request.student?.sapId?.toLowerCase().includes(historyFilter.student.toLowerCase());
        const matchesDate =
          !historyFilter.date ||
          (request.createdAt &&
            new Date(request.createdAt).toISOString().slice(0, 10) === historyFilter.date);
        return matchesHostel && matchesStatus && matchesStudent && matchesDate;
      }),
    [historyRequests, historyFilter]
  );

  const hostelOptions = useMemo(
    () =>
      [...new Map(historyRequests.map((request) => [request.hostel?._id, request.hostel])).values()].filter(Boolean),
    [historyRequests]
  );

  const approveRequest = async (requestId) => {
    try {
      await approveHostellerRequestApi(requestId);
      toast.success('Request approved');
      loadPortal({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to approve request');
    }
  };

  const bulkApprove = async () => {
    if (!pendingRequests.length) return;

    for (const request of pendingRequests) {
      if (!String(request._id).startsWith('live-')) {
        await approveRequest(request._id);
      }
    }
  };

  const submitReject = async (e) => {
    e.preventDefault();

    if (!rejectingRequest) return;

    try {
      await rejectHostellerRequestApi(rejectingRequest._id, { rejectionReason });
      toast.success('Request rejected');
      setRejectingRequest(null);
      setRejectionReason('');
      loadPortal({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject request');
    }
  };

  const groupedActive = useMemo(() => {
    return activeRequests.reduce((acc, request) => {
      const key = request.hostel?.name || 'Unknown Hostel';
      if (!acc[key]) acc[key] = [];
      acc[key].push(request);
      return acc;
    }, {});
  }, [activeRequests]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!['warden', 'admin'].includes(admin?.role || '')) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        Only wardens and admins can access the warden portal.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Warden Portal</h1>
          <p className="text-sm text-gray-500">Review hosteller exit requests, track active approvals, and monitor late returns.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => loadPortal({ silent: true })}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <HiOutlineRefresh className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {activeTab === 'pending' && pendingRequests.length > 0 && (
            <button
              type="button"
              onClick={bulkApprove}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <HiOutlineCheck className="h-5 w-5" />
              Bulk Approve
            </button>
          )}
          {activeTab === 'history' && (
            <button
              type="button"
              onClick={() => downloadCsv(filteredHistory)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <HiOutlineDownload className="h-5 w-5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {lateAlerts.length > 0 && (
        <div className="space-y-3">
          {lateAlerts.map((alert) => (
            <div key={alert.id} className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-4 text-yellow-900">
              <p className="font-semibold">{alert.studentName} is {alert.minutesLate} minutes late</p>
              <p className="text-sm">{alert.hostelName} • approved until {formatDateTime(alert.approvedUntil)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
              activeTab === tab.id
                ? 'bg-primary-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              No pending requests right now.
            </div>
          ) : (
            pendingRequests.map((request) => {
              const urgent =
                request.requestedExitTime &&
                new Date(request.requestedExitTime).getTime() - Date.now() <= 30 * 60 * 1000;

              return (
                <article key={request._id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-gray-800">
                          {request.student?.name} ({request.student?.sapId})
                        </h2>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {request.hostel?.name}
                        </span>
                        {urgent && (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                            Urgent
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Room {request.student?.roomNumber || '-'} • submitted {formatRelative(request.createdAt)}
                      </p>
                    </div>
                    {!String(request._id).startsWith('live-') && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => approveRequest(request._id)}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          <HiOutlineCheck className="h-4 w-4" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingRequest(request)}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                          <HiOutlineX className="h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-700 md:grid-cols-3">
                    <p><span className="font-semibold">Reason:</span> {request.reason}</p>
                    <p><span className="font-semibold">Exit:</span> {request.requestedExitTime ? formatDateTime(request.requestedExitTime) : 'Immediate'}</p>
                    <p><span className="font-semibold">Return:</span> {formatDateTime(request.expectedReturnTime)}</p>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'active' && (
        <div className="space-y-6">
          {Object.keys(groupedActive).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              No active approvals currently outside campus.
            </div>
          ) : (
            Object.entries(groupedActive).map(([hostelName, requests]) => (
              <section key={hostelName} className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-800">{hostelName}</h2>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {requests.map((request) => {
                    const countdown = buildCountdown(request.accessValidUntil);

                    return (
                      <article
                        key={request._id}
                        className={`rounded-2xl border p-5 shadow-sm ${
                          countdown.urgent || countdown.expired
                            ? 'border-red-200 bg-red-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800">
                              {request.student?.name} ({request.student?.sapId})
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                              Room {request.student?.roomNumber || '-'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-lg font-bold ${countdown.urgent || countdown.expired ? 'text-red-700' : 'text-emerald-700'}`}>
                              {countdown.label}
                            </p>
                            <p className="text-xs text-gray-500">until {formatDateTime(request.accessValidUntil)}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-5 md:grid-cols-4">
            <select
              value={historyFilter.hostel}
              onChange={(e) => setHistoryFilter((current) => ({ ...current, hostel: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Hostels</option>
              {hostelOptions.map((hostel) => (
                <option key={hostel._id} value={hostel._id}>
                  {hostel.name}
                </option>
              ))}
            </select>
            <select
              value={historyFilter.status}
              onChange={(e) => setHistoryFilter((current) => ({ ...current, status: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="completed">Completed</option>
            </select>
            <input
              type="text"
              value={historyFilter.student}
              onChange={(e) => setHistoryFilter((current) => ({ ...current, student: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Search by student"
            />
            <input
              type="date"
              value={historyFilter.date}
              onChange={(e) => setHistoryFilter((current) => ({ ...current, date: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Student</th>
                    <th className="px-4 py-3 text-left font-medium">Hostel</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Reason</th>
                    <th className="px-4 py-3 text-left font-medium">Exit</th>
                    <th className="px-4 py-3 text-left font-medium">Return</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        No history found for current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((request) => (
                      <tr key={request._id}>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {request.student?.name} ({request.student?.sapId})
                        </td>
                        <td className="px-4 py-3">{request.hostel?.name}</td>
                        <td className="px-4 py-3">{request.status}</td>
                        <td className="px-4 py-3">{request.reason}</td>
                        <td className="px-4 py-3">{request.requestedExitTime ? formatDateTime(request.requestedExitTime) : 'Immediate'}</td>
                        <td className="px-4 py-3">{formatDateTime(request.expectedReturnTime)}</td>
                        <td className="px-4 py-3">{formatDateTime(request.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-800">Reject Request</h2>
            <p className="mt-1 text-sm text-gray-500">
              Provide a rejection reason for {rejectingRequest.student?.name}.
            </p>
            <form onSubmit={submitReject} className="mt-5 space-y-4">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Rejection reason"
                required
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-medium text-white hover:bg-red-700"
                >
                  Reject Request
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectingRequest(null);
                    setRejectionReason('');
                  }}
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
