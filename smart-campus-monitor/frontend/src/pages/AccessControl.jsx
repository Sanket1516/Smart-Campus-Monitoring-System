import { Fragment, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineBan,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineFilter,
  HiOutlineLockClosed,
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineShieldExclamation,
  HiOutlineUserRemove,
} from 'react-icons/hi';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  blockStudentApi,
  getAccessLogsApi,
  getBlockedStudentsApi,
  getHostelsApi,
  getStudentsApi,
  getTerminalStatusApi,
  getUnauthorizedLogsApi,
  unblockStudentApi,
} from '../services/api';

const blockReasons = [
  'Discipline Issue',
  'Fee Defaulter',
  'Exam Ban',
  'Suspension',
  'Other',
];

const tabs = [
  { id: 'blocked', label: 'Blocked Students' },
  { id: 'attempts', label: 'Unauthorized Attempts' },
];

const createBlockForm = () => ({
  studentId: '',
  reason: 'Discipline Issue',
  note: '',
});

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'N/A';

export default function AccessControl() {
  const { admin } = useAuth();
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState('blocked');
  const [summary, setSummary] = useState(null);
  const [blockedStudents, setBlockedStudents] = useState([]);
  const [students, setStudents] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [unauthorizedAttempts, setUnauthorizedAttempts] = useState([]);
  const [blockedAttempts, setBlockedAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [unblockingStudent, setUnblockingStudent] = useState(null);
  const [unblockReason, setUnblockReason] = useState('');
  const [historyStudentId, setHistoryStudentId] = useState(null);
  const [historyByStudent, setHistoryByStudent] = useState({});
  const [filters, setFilters] = useState({
    department: 'all',
    hostel: 'all',
    date: '',
  });
  const [search, setSearch] = useState('');
  const [blockForm, setBlockForm] = useState(createBlockForm());

  const searchableStudents = useMemo(
    () =>
      students.filter((student) => {
        if (!search.trim()) return true;
        const query = search.toLowerCase();
        return (
          student.name?.toLowerCase().includes(query) ||
          student.sapId?.toLowerCase().includes(query)
        );
      }),
    [students, search]
  );

  const filteredBlockedStudents = useMemo(
    () =>
      blockedStudents.filter((student) => {
        const matchesDepartment =
          filters.department === 'all' || student.department === filters.department;
        const matchesHostel =
          filters.hostel === 'all' || student.hostel?._id === filters.hostel;
        const matchesDate =
          !filters.date ||
          (student.blockedAt &&
            new Date(student.blockedAt).toISOString().slice(0, 10) === filters.date);

        return matchesDepartment && matchesHostel && matchesDate;
      }),
    [blockedStudents, filters]
  );

  const departmentOptions = useMemo(
    () => [...new Set(students.map((student) => student.department).filter(Boolean))].sort(),
    [students]
  );

  const loadAccessControl = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [blockedRes, studentsRes, hostelsRes, unauthorizedRes, terminalRes] = await Promise.all([
        getBlockedStudentsApi(),
        getStudentsApi({ limit: 500, page: 1 }),
        getHostelsApi(),
        getUnauthorizedLogsApi({ page: 1, limit: 25 }),
        getTerminalStatusApi(),
      ]);

      setBlockedStudents(blockedRes.data.blockedStudents || []);
      setSummary({
        ...blockedRes.data.summary,
        terminalsOnline:
          blockedRes.data.summary?.terminalsOnline ?? terminalRes.data.summary?.online ?? 0,
        terminalsOffline:
          blockedRes.data.summary?.terminalsOffline ?? terminalRes.data.summary?.offline ?? 0,
      });
      setStudents(studentsRes.data.students || []);
      setHostels(hostelsRes.data.hostels || []);
      setUnauthorizedAttempts(unauthorizedRes.data.logs || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load access control data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAccessControl();
  }, []);

  useEffect(() => {
    if (!socket) return undefined;

    const handleBlocked = (payload) => {
      setBlockedAttempts((current) => [
        {
          id: `blocked-${Date.now()}-${Math.random()}`,
          ...payload,
        },
        ...current,
      ].slice(0, 20));
      setSummary((current) =>
        current
          ? {
              ...current,
              blockedAttemptsToday: (current.blockedAttemptsToday || 0) + 1,
            }
          : current
      );
    };

    const handleUnauthorized = (payload) => {
      setUnauthorizedAttempts((current) => [
        {
          _id: `unauth-${Date.now()}-${Math.random()}`,
          gateName: payload.gateName,
          terminalNumber: payload.terminalNumber,
          terminalLabel: payload.terminalLabel,
          machineNumber: payload.machineNumber,
          timestamp: payload.time,
          attemptNumber: payload.attemptNumber,
        },
        ...current,
      ].slice(0, 25));
      setSummary((current) =>
        current
          ? {
              ...current,
              unauthorizedToday: (current.unauthorizedToday || 0) + 1,
            }
          : current
      );
    };

    socket.on('scan:blocked', handleBlocked);
    socket.on('scan:unauthorized', handleUnauthorized);

    return () => {
      socket.off('scan:blocked', handleBlocked);
      socket.off('scan:unauthorized', handleUnauthorized);
    };
  }, [socket]);

  const loadHistory = async (studentId) => {
    if (historyByStudent[studentId]) {
      setHistoryStudentId((current) => (current === studentId ? null : studentId));
      return;
    }

    try {
      const res = await getAccessLogsApi(studentId);
      setHistoryByStudent((current) => ({
        ...current,
        [studentId]: res.data.logs || [],
      }));
      setHistoryStudentId(studentId);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load access history');
    }
  };

  const submitBlock = async (e) => {
    e.preventDefault();

    if (!blockForm.studentId) {
      toast.error('Select a student to block');
      return;
    }

    setSaving(true);

    try {
      const res = await blockStudentApi(blockForm.studentId, {
        reason: blockForm.reason,
        note: blockForm.note,
      });

      setBlockedStudents((current) => [res.data.student, ...current]);
      setSummary((current) =>
        current
          ? {
              ...current,
              totalBlocked: (current.totalBlocked || 0) + 1,
              blockedToday: (current.blockedToday || 0) + 1,
            }
          : current
      );
      setShowBlockModal(false);
      setBlockForm(createBlockForm());
      toast.success('Student blocked successfully');
      loadAccessControl({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to block student');
    } finally {
      setSaving(false);
    }
  };

  const submitUnblock = async (e) => {
    e.preventDefault();

    if (!unblockingStudent) return;

    setSaving(true);

    try {
      await unblockStudentApi(unblockingStudent._id, { reason: unblockReason });
      setBlockedStudents((current) =>
        current.filter((student) => student._id !== unblockingStudent._id)
      );
      setSummary((current) =>
        current
          ? {
              ...current,
              totalBlocked: Math.max(0, (current.totalBlocked || 0) - 1),
            }
          : current
      );
      setUnblockingStudent(null);
      setUnblockReason('');
      toast.success('Student unblocked successfully');
      loadAccessControl({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to unblock student');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!['admin', 'security'].includes(admin?.role || '')) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        Only admin and security staff can access this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-800">
            <HiOutlineShieldExclamation className="h-7 w-7" />
            Access Control
          </h1>
          <p className="text-sm text-gray-500">
            Block or unblock students, monitor unauthorized attempts, and watch blocked attempts live.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => loadAccessControl({ silent: true })}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <HiOutlineRefresh className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {admin?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setShowBlockModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <HiOutlineBan className="h-5 w-5" />
              Block Student
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Blocked"
          value={summary?.totalBlocked || 0}
          icon={HiOutlineLockClosed}
          color="red"
        />
        <StatCard
          title="Blocked Today"
          value={summary?.blockedToday || 0}
          icon={HiOutlineBan}
          color="yellow"
        />
        <StatCard
          title="Unauthorized Today"
          value={summary?.unauthorizedToday || 0}
          icon={HiOutlineExclamationCircle}
          color="indigo"
        />
        <StatCard
          title="Blocked Attempts Today"
          value={summary?.blockedAttemptsToday || 0}
          icon={HiOutlineShieldExclamation}
          color="purple"
        />
        <StatCard
          title="Terminals Online / Offline"
          value={`${summary?.terminalsOnline || 0} / ${summary?.terminalsOffline || 0}`}
          icon={HiOutlineClock}
          color="green"
          subtitle="Online first, offline second"
        />
      </div>

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

      {activeTab === 'blocked' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-5 md:grid-cols-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 md:col-span-4">
              <HiOutlineFilter className="h-5 w-5" />
              Filters
            </div>
            <select
              value={filters.department}
              onChange={(e) => setFilters((current) => ({ ...current, department: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Departments</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <select
              value={filters.hostel}
              onChange={(e) => setFilters((current) => ({ ...current, hostel: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Hostels</option>
              {hostels.map((hostel) => (
                <option key={hostel._id} value={hostel._id}>
                  {hostel.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters((current) => ({ ...current, date: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={() => setFilters({ department: 'all', hostel: 'all', date: '' })}
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset Filters
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Student</th>
                    <th className="px-4 py-3 text-left font-medium">SAP ID</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Hostel</th>
                    <th className="px-4 py-3 text-left font-medium">Department</th>
                    <th className="px-4 py-3 text-left font-medium">Blocked By</th>
                    <th className="px-4 py-3 text-left font-medium">Blocked At</th>
                    <th className="px-4 py-3 text-left font-medium">Reason</th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredBlockedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                        No blocked students found for the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredBlockedStudents.map((student) => (
                      <Fragment key={student._id}>
                        <tr key={student._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{student.name}</td>
                          <td className="px-4 py-3 font-mono">{student.sapId}</td>
                          <td className="px-4 py-3">
                            {student.studentType === 'hosteller' ? 'Hosteller' : 'Day Scholar'}
                          </td>
                          <td className="px-4 py-3">{student.hostel?.name || '-'}</td>
                          <td className="px-4 py-3">{student.department}</td>
                          <td className="px-4 py-3">{student.blockedBy?.name || '-'}</td>
                          <td className="px-4 py-3">{formatDateTime(student.blockedAt)}</td>
                          <td className="px-4 py-3">{student.blockReason || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => loadHistory(student._id)}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                {historyStudentId === student._id ? 'Hide History' : 'View History'}
                              </button>
                              {admin?.role === 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => setUnblockingStudent(student)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  <HiOutlineUserRemove className="h-4 w-4" />
                                  Unblock
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {historyStudentId === student._id && (
                          <tr className="bg-gray-50">
                            <td colSpan={9} className="px-4 py-4">
                              {(historyByStudent[student._id] || []).length === 0 ? (
                                <p className="text-sm text-gray-500">No access history available.</p>
                              ) : (
                                <div className="space-y-2">
                                  {historyByStudent[student._id].map((log) => (
                                    <div
                                      key={log._id}
                                      className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-semibold text-gray-800 uppercase">
                                          {log.action}
                                        </span>
                                        <span className="text-gray-500">
                                          {formatDateTime(log.timestamp)}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-gray-700">{log.reason || 'No reason provided'}</p>
                                      <p className="mt-1 text-xs text-gray-500">
                                        Performed by {log.performedBy?.name || 'System'}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'attempts' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800">Unauthorized Attempts</h2>
            <p className="mt-1 text-sm text-gray-500">Live updates from `scan:unauthorized` and recent unauthorized log history.</p>
            <div className="mt-4 space-y-3">
              {unauthorizedAttempts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                  No unauthorized attempts recorded yet.
                </div>
              ) : (
                unauthorizedAttempts.map((attempt) => (
                  <div
                    key={attempt._id}
                    className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-orange-800">
                          {attempt.terminalLabel || `${attempt.gateName || 'Gate'} Terminal ${attempt.terminalNumber ?? '-'}`}
                        </p>
                        <p className="text-sm text-orange-700">
                          {attempt.gateName || 'Unknown Gate'} • Machine #{attempt.machineNumber ?? '-'}
                        </p>
                      </div>
                      <div className="text-right text-sm text-orange-700">
                        <p>{formatDateTime(attempt.timestamp)}</p>
                        <p>Attempt count today: {attempt.attemptNumber || 1}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800">Blocked Student Attempts</h2>
            <p className="mt-1 text-sm text-gray-500">Live updates from `scan:blocked` appear here without refresh.</p>
            <div className="mt-4 space-y-3">
              {blockedAttempts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                  No blocked access attempts received yet in this session.
                </div>
              ) : (
                blockedAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-red-800">
                          {attempt.studentName} ({attempt.sapId})
                        </p>
                        <p className="text-sm text-red-700">
                          {attempt.gateName} • {attempt.terminalLabel || `Terminal ${attempt.terminalNumber ?? '-'}`}
                        </p>
                      </div>
                      <div className="text-right text-sm text-red-700">
                        <p>{formatDateTime(attempt.time)}</p>
                        <p>{attempt.blockReason || 'Blocked'}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Block Student</h2>
                <p className="text-sm text-gray-500">Search a student, choose a reason, and apply the block.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <form onSubmit={submitBlock} className="space-y-4">
              <div className="relative">
                <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by student name or SAP ID"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3">
                {searchableStudents.length === 0 ? (
                  <p className="text-sm text-gray-500">No matching students found.</p>
                ) : (
                  searchableStudents.map((student) => (
                    <button
                      key={student._id}
                      type="button"
                      onClick={() => setBlockForm((current) => ({ ...current, studentId: student._id }))}
                      className={`w-full rounded-xl border px-4 py-3 text-left ${
                        blockForm.studentId === student._id
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-medium text-gray-800">{student.name}</p>
                      <p className="text-sm text-gray-500">
                        {student.sapId} • {student.department}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <select
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm((current) => ({ ...current, reason: e.target.value }))}
                  className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {blockReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={blockForm.note}
                  onChange={(e) => setBlockForm((current) => ({ ...current, note: e.target.value }))}
                  placeholder="Custom note (optional)"
                  className="rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {saving ? 'Blocking...' : 'Block Student'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {unblockingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-800">Unblock Student</h2>
            <p className="mt-1 text-sm text-gray-500">
              Provide a reason for unblocking {unblockingStudent.name}.
            </p>

            <form onSubmit={submitUnblock} className="mt-5 space-y-4">
              <textarea
                value={unblockReason}
                onChange={(e) => setUnblockReason(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Reason for unblocking"
                required
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Confirm Unblock'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUnblockingStudent(null);
                    setUnblockReason('');
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
