import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiCheckCircle,
  HiOutlineAcademicCap,
  HiOutlineBadgeCheck,
  HiOutlineFingerPrint,
  HiOutlineHome,
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineUser,
} from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import {
  confirmEnrollmentApi,
  getEnrollmentStatsApi,
  getHostelsApi,
  getStudentsApi,
  initiateEnrollmentApi,
  updateEnrollmentTypeApi,
} from '../services/api';

const filterTabs = [
  { id: 'all', label: 'All' },
  { id: 'enrolled', label: 'Enrolled' },
  { id: 'not_enrolled', label: 'Not Enrolled' },
  { id: 'day_scholar', label: 'Day Scholar' },
  { id: 'hosteller', label: 'Hosteller' },
];

const createInitialForm = () => ({
  studentType: '',
  hostelId: '',
  roomNumber: '',
  wardenApprovalRequired: true,
  zktUserID: '',
});

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not available';

const statusStyles = {
  idle: 'border-gray-200 bg-gray-50 text-gray-500',
  active: 'border-blue-200 bg-blue-50 text-blue-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export default function Enrollment() {
  const { admin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState(null);
  const [hostels, setHostels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState(createInitialForm());
  const [saving, setSaving] = useState(false);
  const [stepState, setStepState] = useState('idle');
  const [summary, setSummary] = useState(null);
  const preselectedStudentId = searchParams.get('studentId');

  const selectedHostel = useMemo(
    () => hostels.find((hostel) => hostel._id === form.hostelId) || null,
    [hostels, form.hostelId]
  );

  const departmentOptions = useMemo(
    () => [...new Set((students || []).map((student) => student.department).filter(Boolean))].sort(),
    [students]
  );

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const matchesDepartment =
        departmentFilter === 'all' || student.department === departmentFilter;

      const matchesSearch =
        !search ||
        student.name?.toLowerCase().includes(search.toLowerCase()) ||
        student.sapId?.toLowerCase().includes(search.toLowerCase());

      let matchesTab = true;

      if (activeFilter === 'enrolled') matchesTab = student.fingerprintEnrolled;
      if (activeFilter === 'not_enrolled') matchesTab = !student.fingerprintEnrolled;
      if (activeFilter === 'day_scholar') matchesTab = student.studentType === 'day_scholar';
      if (activeFilter === 'hosteller') matchesTab = student.studentType === 'hosteller';

      return matchesDepartment && matchesSearch && matchesTab;
    });
  }, [students, departmentFilter, search, activeFilter]);

  const enrollmentSteps = [
    {
      key: 'place_finger',
      label: 'Ask student to place finger on enrollment device',
      state:
        stepState === 'awaiting_scan' || stepState === 'confirming' || stepState === 'success'
          ? stepState === 'awaiting_scan'
            ? 'active'
            : 'done'
          : 'idle',
    },
    {
      key: 'scan_one',
      label: 'Scan 1 captured',
      state:
        stepState === 'confirming' || stepState === 'success'
          ? 'done'
          : 'idle',
    },
    {
      key: 'scan_two',
      label: 'Ask student to place finger again',
      state:
        stepState === 'confirming' || stepState === 'success'
          ? 'done'
          : 'idle',
    },
    {
      key: 'syncing',
      label: 'Syncing to gate terminals...',
      state:
        stepState === 'confirming'
          ? 'active'
          : stepState === 'success'
          ? 'done'
          : 'idle',
    },
    {
      key: 'done',
      label: 'Enrolled Successfully',
      state: stepState === 'success' ? 'done' : 'idle',
    },
  ];

  const loadPage = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [studentsRes, statsRes, hostelsRes] = await Promise.all([
        getStudentsApi({ limit: 500, page: 1 }),
        getEnrollmentStatsApi(),
        getHostelsApi(),
      ]);

      setStudents(studentsRes.data.students || []);
      setStats(statsRes.data || null);
      setHostels(hostelsRes.data.hostels || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load enrollment data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    if (!selectedStudent) {
      setForm(createInitialForm());
      return;
    }

    setForm({
      studentType: selectedStudent.studentType || '',
      hostelId: selectedStudent.hostel?._id || '',
      roomNumber: selectedStudent.roomNumber || '',
      wardenApprovalRequired:
        selectedStudent.wardenApprovalRequired !== undefined
          ? selectedStudent.wardenApprovalRequired
          : true,
      zktUserID: selectedStudent.zktUserID ? String(selectedStudent.zktUserID) : '',
    });
    setStepState('idle');
    setSummary(null);
  }, [selectedStudent]);

  useEffect(() => {
    if (!preselectedStudentId || !students.length) {
      return;
    }

    const student = students.find((item) => item._id === preselectedStudentId);

    if (student) {
      setSelectedStudent(student);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('studentId');
        return next;
      });
    }
  }, [preselectedStudentId, students, setSearchParams]);

  const updateForm = (updates) => setForm((current) => ({ ...current, ...updates }));

  const handleSelectStudent = (student) => {
    setSelectedStudent(student);
  };

  const handleStartEnrollment = async () => {
    if (!selectedStudent) {
      toast.error('Select a student first');
      return;
    }

    if (!form.studentType) {
      toast.error('Choose student type before starting enrollment');
      return;
    }

    if (!form.zktUserID) {
      toast.error('Enter a valid ZKT user ID');
      return;
    }

    setSaving(true);

    try {
      await initiateEnrollmentApi(selectedStudent._id, { zktUserID: Number(form.zktUserID) });
      setStepState('awaiting_scan');
      toast.success('Enrollment device is ready');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to initiate enrollment');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmEnrollment = async () => {
    if (!selectedStudent) {
      toast.error('Select a student first');
      return;
    }

    if (form.studentType === 'hosteller' && (!form.hostelId || !form.roomNumber.trim())) {
      toast.error('Hostel and room number are required for hostellers');
      return;
    }

    setSaving(true);
    setStepState('confirming');

    try {
      const payload = {
        zktUserID: Number(form.zktUserID),
        studentType: form.studentType,
        hostelId: form.studentType === 'hosteller' ? form.hostelId : undefined,
        roomNumber: form.studentType === 'hosteller' ? form.roomNumber.trim() : '',
        wardenApprovalRequired:
          form.studentType === 'hosteller' ? form.wardenApprovalRequired : false,
      };

      const response = await confirmEnrollmentApi(selectedStudent._id, payload);
      const updatedStudent = response.data.student;

      setStudents((current) =>
        current.map((student) => (student._id === updatedStudent._id ? updatedStudent : student))
      );
      setSelectedStudent(updatedStudent);
      setSummary(updatedStudent);
      setStepState('success');
      toast.success('Fingerprint enrollment completed');
      loadPage({ silent: true });
    } catch (error) {
      setStepState('awaiting_scan');
      toast.error(error.response?.data?.message || 'Failed to confirm enrollment');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateType = async () => {
    if (!selectedStudent) {
      return;
    }

    if (!selectedStudent.fingerprintEnrolled) {
      toast.error('Student must be fingerprint enrolled before profile-only updates');
      return;
    }

    if (form.studentType === 'hosteller' && (!form.hostelId || !form.roomNumber.trim())) {
      toast.error('Hostel and room number are required for hostellers');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        studentType: form.studentType,
        hostelId: form.studentType === 'hosteller' ? form.hostelId : undefined,
        roomNumber: form.studentType === 'hosteller' ? form.roomNumber.trim() : '',
        wardenApprovalRequired:
          form.studentType === 'hosteller' ? form.wardenApprovalRequired : false,
      };

      const response = await updateEnrollmentTypeApi(selectedStudent._id, payload);
      const updatedStudent = response.data.student;

      setStudents((current) =>
        current.map((student) => (student._id === updatedStudent._id ? updatedStudent : student))
      );
      setSelectedStudent(updatedStudent);
      setSummary(updatedStudent);
      toast.success('Student profile updated without re-enrollment');
      loadPage({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update student type');
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

  if (admin?.role !== 'admin') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        Only administrators can access fingerprint enrollment.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-800">
            <HiOutlineFingerPrint className="h-7 w-7" />
            Fingerprint Enrollment
          </h1>
          <p className="text-sm text-gray-500">
            Profile students, reserve a ZKT user ID, pull the template from machine 50, and sync it to gate terminals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadPage({ silent: true })}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <HiOutlineRefresh className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500">Progress</p>
            <p className="mt-2 text-2xl font-bold text-gray-800">
              {stats.enrolled} / {stats.total}
            </p>
            <p className="mt-1 text-sm text-gray-500">{stats.pending} pending enrollments</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Day Scholars</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{stats.breakdown?.dayScholars || 0}</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-xs uppercase tracking-wide text-blue-700">Hostellers</p>
            <p className="mt-2 text-2xl font-bold text-blue-700">{stats.breakdown?.hostellers || 0}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs uppercase tracking-wide text-amber-700">Departments</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{stats.perDepartment?.length || 0}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr,1.15fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Student Search</h2>
              <p className="text-sm text-gray-500">Search by student name or SAP ID and filter by enrollment status.</p>
            </div>
            <div className="rounded-xl bg-primary-50 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-wide text-primary-700">Enrolled</p>
              <p className="text-2xl font-bold text-primary-700">
                {stats?.enrolled || 0}
                <span className="text-sm font-medium text-primary-500"> / {stats?.total || 0}</span>
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="relative">
              <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or SAP ID"
                className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    activeFilter === tab.id
                      ? 'bg-primary-600 text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Department-wise: All Departments</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 max-h-[720px] space-y-4 overflow-y-auto pr-1">
            {filteredStudents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-sm text-gray-500">
                No students match the current search and filters.
              </div>
            ) : (
              filteredStudents.map((student) => {
                const isSelected = selectedStudent?._id === student._id;

                return (
                  <button
                    key={student._id}
                    type="button"
                    onClick={() => handleSelectStudent(student)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-primary-400 bg-primary-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-primary-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {student.photoUrl ? (
                        <img
                          src={student.photoUrl}
                          alt={student.name}
                          className="h-16 w-16 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                          <HiOutlineUser className="h-8 w-8" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-800">{student.name}</h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              student.fingerprintEnrolled
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {student.fingerprintEnrolled ? 'Enrolled' : 'Not Enrolled'}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              student.studentType === 'hosteller'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {student.studentType === 'hosteller' ? 'Hosteller' : 'Day Scholar'}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-sm text-gray-600">{student.sapId}</p>
                        <p className="mt-1 text-sm text-gray-500">
                          {student.department} • Year {student.year || '-'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {!selectedStudent ? (
            <div className="flex h-full min-h-[520px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
              <HiOutlineAcademicCap className="h-14 w-14 text-gray-300" />
              <h2 className="mt-4 text-lg font-semibold text-gray-700">Select a student to begin enrollment</h2>
              <p className="mt-2 max-w-md text-sm text-gray-500">
                Choose a student from the left panel to configure type, hostel details, ZKT user ID, and the guided fingerprint enrollment flow.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl bg-gray-50 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-gray-800">{selectedStudent.name}</h2>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                    {selectedStudent.sapId}
                  </span>
                  {selectedStudent.fingerprintEnrolled && (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Fingerprint Enrolled
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {selectedStudent.department} • Year {selectedStudent.year || '-'} •{' '}
                  {selectedStudent.email}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <HiOutlineBadgeCheck className="h-5 w-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-800">Section A — Student Type</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateForm({ studentType: 'day_scholar', hostelId: '', roomNumber: '', wardenApprovalRequired: false })}
                    className={`rounded-2xl border px-4 py-4 text-left ${
                      form.studentType === 'day_scholar'
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-semibold text-gray-800">Day Scholar</p>
                    <p className="mt-1 text-sm text-gray-500">No hostel assignment required.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateForm({ studentType: 'hosteller', wardenApprovalRequired: true })}
                    className={`rounded-2xl border px-4 py-4 text-left ${
                      form.studentType === 'hosteller'
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-semibold text-gray-800">Hosteller</p>
                    <p className="mt-1 text-sm text-gray-500">Requires hostel, room, and warden profile details.</p>
                  </button>
                </div>
              </div>

              {form.studentType === 'hosteller' && (
                <div className="rounded-2xl border border-gray-200 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <HiOutlineHome className="h-5 w-5 text-primary-600" />
                    <h3 className="text-lg font-semibold text-gray-800">Section B — Hosteller Details</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-600">Hostel</label>
                      <select
                        value={form.hostelId}
                        onChange={(e) => updateForm({ hostelId: e.target.value })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Select hostel</option>
                        {hostels.map((hostel) => (
                          <option key={hostel._id} value={hostel._id}>
                            {hostel.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-600">Room Number</label>
                      <input
                        type="text"
                        value={form.roomNumber}
                        onChange={(e) => updateForm({ roomNumber: e.target.value })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="e.g. B-203"
                      />
                    </div>
                    <div className="md:col-span-2 rounded-2xl bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Assigned Warden</p>
                      <p className="mt-2 text-sm font-medium text-gray-800">
                        {selectedHostel?.warden?.name || 'Select a hostel to view the current warden'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {selectedHostel?.wardenEmail || selectedHostel?.warden?.email || 'No email'} •{' '}
                        {selectedHostel?.wardenPhone || selectedHostel?.warden?.phone || 'No phone'}
                      </p>
                    </div>
                    <label className="md:col-span-2 flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
                      <span>
                        <span className="block text-sm font-medium text-gray-700">Warden Approval Required</span>
                        <span className="block text-xs text-gray-500">Enabled by default for hostellers.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={form.wardenApprovalRequired}
                        onChange={(e) => updateForm({ wardenApprovalRequired: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <HiOutlineFingerPrint className="h-5 w-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-800">Section C — Fingerprint Capture</h3>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr,auto,auto]">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600">ZKT User ID</label>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={form.zktUserID}
                      onChange={(e) => updateForm({ zktUserID: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="1 - 10000"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleStartEnrollment}
                    disabled={saving}
                    className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    Start Enrollment
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmEnrollment}
                    disabled={saving || stepState === 'idle'}
                    className="rounded-xl border border-primary-300 px-5 py-3 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                  >
                    Confirm Enrollment
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {enrollmentSteps.map((step) => (
                    <div
                      key={step.key}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${statusStyles[step.state]}`}
                    >
                      <HiCheckCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">{step.label}</span>
                    </div>
                  ))}
                </div>

                {selectedStudent.fingerprintEnrolled && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleUpdateType}
                      disabled={saving || !form.studentType}
                      className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Update Type Without Re-enrollment
                    </button>
                  </div>
                )}
              </div>

              {summary && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <HiCheckCircle className="h-5 w-5 text-emerald-700" />
                    <h3 className="text-lg font-semibold text-emerald-800">Section D — Success Summary</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-sm text-emerald-900 md:grid-cols-2">
                    <p><span className="font-semibold">Student:</span> {summary.name}</p>
                    <p><span className="font-semibold">Type:</span> {summary.studentType === 'hosteller' ? 'Hosteller' : 'Day Scholar'}</p>
                    <p><span className="font-semibold">Hostel:</span> {summary.hostel?.name || 'N/A'}</p>
                    <p><span className="font-semibold">Warden:</span> {summary.hostel?.warden?.name || 'N/A'}</p>
                    <p><span className="font-semibold">Room:</span> {summary.roomNumber || 'N/A'}</p>
                    <p><span className="font-semibold">Enrolled At:</span> {formatDateTime(summary.fingerprintEnrolledAt)}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
