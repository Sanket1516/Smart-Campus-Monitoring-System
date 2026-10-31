import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineSearch,
  HiOutlinePencil,
  HiOutlineX,
  HiOutlineSave,
  HiOutlineUserGroup,
  HiOutlineRefresh,
  HiOutlinePlus,
  HiOutlineUpload,
} from 'react-icons/hi';
import {
  getStudentsApi,
  updateStudentApi,
  createStudentApi,
  getHostelsApi,
} from '../services/api';
import ExcelUploadModal from '../components/ExcelUploadModal';
import PageHeader from '../components/brand/PageHeader';
import { DEPARTMENT_OPTIONS } from '../utils/studentOptions';
import FingerprintStatusBadge from '../components/sync/FingerprintStatusBadge';
import { EnrollmentStateBadge, GateStatusBadge, SimulatedBadge, SyncStatusBadge, gateFor } from '../components/sync/SyncStatusBadges';
import StudentSyncDrawer from '../components/sync/StudentSyncDrawer';

const courseOptions = ['pharmacy', 'engineering', 'mbatech', 'pharmatech'];
const departmentByCourse = {
  pharmacy: ['bpharm'],
  engineering: ['computer science', 'computer engineering'],
  mbatech: ['mbatech'],
  pharmatech: ['pharmatech'],
};

const createStudentForm = () => ({
  sapId: '',
  name: '',
  email: '',
  phone: '',
  parentEmail: '',
  parentPhone: '',
  category: 'dayscholars',
  course: 'engineering',
  department: 'computer science',
  year: 1,
  address: '',
  bloodGroup: '',
  hostel: '',
  roomNumber: '',
  wardenApprovalRequired: true,
});

const isHostellerCategory = (category) => String(category || '').toLowerCase() === 'hostellers';

const normalizeCreatePayload = (form) => ({
  sapId: form.sapId.trim(),
  name: form.name.trim(),
  email: form.email.trim(),
  phone: form.phone.trim(),
  parentEmail: form.parentEmail.trim(),
  parentPhone: form.parentPhone.trim(),
  category: form.category,
  course: form.course,
  department: form.department,
  year: form.year ? Number(form.year) : undefined,
  address: form.address.trim(),
  bloodGroup: form.bloodGroup.trim(),
  hostel: isHostellerCategory(form.category) ? form.hostel || undefined : undefined,
  roomNumber: isHostellerCategory(form.category) ? form.roomNumber.trim() : '',
  wardenApprovalRequired: isHostellerCategory(form.category) ? Boolean(form.wardenApprovalRequired) : false,
});

const validateStudentForm = (form) => {
  if (!form.sapId.trim() || !form.name.trim() || !form.email.trim()) {
    return 'SAP ID, name, and email are required';
  }

  if (!form.category || !form.course || !form.department) {
    return 'Category, course, and department are required';
  }

  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    return 'Enter a valid email address';
  }

  if (form.parentEmail && !/^\S+@\S+\.\S+$/.test(form.parentEmail.trim())) {
    return 'Enter a valid parent email address';
  }

  if (isHostellerCategory(form.category) && !form.hostel) {
    return 'Select a hostel for hosteller students';
  }

  return '';
};

const StudentModal = ({
  title,
  form,
  setForm,
  hostels,
  saving,
  onClose,
  onPrimaryAction,
  primaryLabel,
  secondaryAction,
  secondaryLabel,
  disableSapId = false,
}) => {
  const departmentOptions = useMemo(
    () => departmentByCourse[form.course] || [],
    [form.course]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b p-6 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <HiOutlineX className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  SAP ID *
                </label>
                <input
                  type="text"
                  value={form.sapId}
                  disabled={disableSapId}
                  onChange={(e) => setForm((current) => ({ ...current, sapId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phone
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Blood Group
                </label>
                <input
                  type="text"
                  value={form.bloodGroup}
                  onChange={(e) => setForm((current) => ({ ...current, bloodGroup: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Category *
                </label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      category: e.target.value,
                      hostel: e.target.value === 'hostellers' ? current.hostel : '',
                      roomNumber: e.target.value === 'hostellers' ? current.roomNumber : '',
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="dayscholars">Day Scholar</option>
                  <option value="hostellers">Hosteller</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Address
                </label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))}
                  rows="2"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Parent / Guardian
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Parent Email
                </label>
                <input
                  type="email"
                  value={form.parentEmail}
                  onChange={(e) => setForm((current) => ({ ...current, parentEmail: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Parent Phone
                </label>
                <input
                  type="text"
                  value={form.parentPhone}
                  onChange={(e) => setForm((current) => ({ ...current, parentPhone: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Academic Information
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Course *
                </label>
                <select
                  value={form.course}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      course: e.target.value,
                      department: departmentByCourse[e.target.value]?.[0] || '',
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {courseOptions.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Department *
                </label>
                <select
                  value={form.department}
                  onChange={(e) => setForm((current) => ({ ...current, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Year
                </label>
                <select
                  value={form.year}
                  onChange={(e) => setForm((current) => ({ ...current, year: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {[1, 2, 3, 4, 5].map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {isHostellerCategory(form.category) && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                Hostel Information
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Hostel *
                  </label>
                  <select
                    value={form.hostel}
                    onChange={(e) => setForm((current) => ({ ...current, hostel: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="">Select Hostel</option>
                    {hostels.map((hostel) => (
                      <option key={hostel._id} value={hostel._id}>
                        {hostel.name} {hostel.code ? `(${hostel.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Room Number
                  </label>
                  <input
                    type="text"
                    value={form.roomNumber}
                    onChange={(e) => setForm((current) => ({ ...current, roomNumber: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t p-6 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          {secondaryAction && (
            <button
              onClick={secondaryAction}
              disabled={saving}
              className="rounded-lg border border-primary-300 px-4 py-2 text-primary-700 hover:bg-primary-50 disabled:opacity-50"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            onClick={onPrimaryAction}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <HiOutlineSave className="h-5 w-5" />
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function StudentManagement() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const [search, setSearch] = useState(() => new URLSearchParams(location.search).get('search') || '');

  // Global search in the top bar navigates here with ?search=<SAP ID>.
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('search');
    if (fromUrl !== null) setSearch(fromUrl);
  }, [location.search]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(createStudentForm());
  const [syncStudentId, setSyncStudentId] = useState(null);

  const [filters, setFilters] = useState({ department: '', year: '', studentType: '', fingerprintStatus: '', syncStatus: '', accessStatus: '' });
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters]);

  useEffect(() => {
    getHostelsApi()
      .then((res) => setHostels(res.data.hostels || []))
      .catch(() => toast.error('Failed to load hostels'));
  }, []);

  useEffect(() => {
    loadData();
  }, [page, debouncedSearch, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Server-side search, filters and pagination (the directory scales past one page). */
  const loadData = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50, ...(debouncedSearch ? { search: debouncedSearch } : {}) };
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const studentsRes = await getStudentsApi(params);
      setStudents(studentsRes.data.students || []);
      setMeta({ total: studentsRes.data.total || 0, pages: studentsRes.data.pages || 1 });
    } catch (_error) {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setCreateForm(createStudentForm());
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateForm(createStudentForm());
  };

  const handleEdit = (student) => {
    setSelectedStudent(student);
    setEditForm({
      sapId: student.sapId,
      name: student.name,
      email: student.email,
      phone: student.phone || '',
      parentEmail: student.parentEmail || '',
      parentPhone: student.parentPhone || '',
      category: student.category,
      course: student.course,
      department: student.department,
      year: student.year || 1,
      address: student.address || '',
      bloodGroup: student.bloodGroup || '',
      hostel: student.hostel?._id || '',
      roomNumber: student.roomNumber || '',
      wardenApprovalRequired:
        student.wardenApprovalRequired !== undefined ? student.wardenApprovalRequired : true,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    const validationError = validateStudentForm(editForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = normalizeCreatePayload(editForm);
      const res = await updateStudentApi(selectedStudent.sapId, payload);

      setStudents((prev) =>
        prev.map((student) => (student._id === selectedStudent._id ? res.data.student : student))
      );

      toast.success('Student updated successfully');
      setEditing(false);
      setSelectedStudent(null);
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update student');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStudent = async ({ continueToEnrollment = false } = {}) => {
    const validationError = validateStudentForm(createForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = normalizeCreatePayload(createForm);
      const res = await createStudentApi(payload);
      const createdStudent = res.data.student;

      toast.success('Student created successfully');
      closeCreateModal();
      await loadData();

      if (continueToEnrollment && createdStudent?._id) {
        navigate(`/admin/enrollment?studentId=${createdStudent._id}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create student');
    } finally {
      setSaving(false);
    }
  };

  // Email search stays client-side on the loaded page (the API searches name and SAP ID).
  const filteredStudents = students.filter(
    (student) =>
      !search ||
      student.name?.toLowerCase().includes(search.toLowerCase()) ||
      student.sapId?.toLowerCase().includes(search.toLowerCase()) ||
      student.email?.toLowerCase().includes(search.toLowerCase())
  );
  const departmentOptions = Object.values(DEPARTMENT_OPTIONS).flat();
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const setFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const selectClass =
    'rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-ink-100 outline-none focus:border-cyan-400/50';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Identity · Student directory"
        title="Thousands of Records. One Organized System."
        description="Every student, their enrolment and their status on both gate terminals. Add one student, or import a batch from Excel."
        actions={
          <>
            <button type="button" onClick={openCreateModal} className="btn-accent">
              <HiOutlinePlus className="h-4 w-4" /> Add student
            </button>
            <button type="button" onClick={() => setShowUploadModal(true)} className="btn-ghost">
              <HiOutlineUpload className="h-4 w-4" /> Excel bulk import
            </button>
            <button type="button" onClick={loadData} className="btn-ghost" aria-label="Refresh">
              <HiOutlineRefresh className="h-4 w-4" />
            </button>
          </>
        }
        aside={
          <div className="text-right">
            <div className="metric text-6xl text-white">{meta.total.toLocaleString('en-IN')}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">
              {activeFilters || debouncedSearch ? 'matching students' : 'active students'}
            </div>
          </div>
        }
      />

      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              placeholder="Search name or SAP ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </div>
          <select value={filters.department} onChange={setFilter('department')} className={selectClass} aria-label="Department">
            <option value="">All departments</option>
            {departmentOptions.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <select value={filters.year} onChange={setFilter('year')} className={selectClass} aria-label="Year">
            <option value="">All years</option>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </select>
          <select value={filters.studentType} onChange={setFilter('studentType')} className={selectClass} aria-label="Category">
            <option value="">Day scholars & hostellers</option>
            <option value="day_scholar">Day scholars</option>
            <option value="hosteller">Hostellers</option>
          </select>
          <select value={filters.fingerprintStatus} onChange={setFilter('fingerprintStatus')} className={selectClass} aria-label="Enrolment">
            <option value="">Any enrolment</option>
            <option value="enrolled">Fingerprint enrolled</option>
            <option value="awaiting">Awaiting fingerprint</option>
            <option value="none">No fingerprint</option>
          </select>
          <select value={filters.syncStatus} onChange={setFilter('syncStatus')} className={selectClass} aria-label="Gate sync">
            <option value="">Any gate sync</option>
            <option value="FULLY_SYNCHRONIZED">Fully synchronised</option>
            <option value="PARTIALLY_SYNCHRONIZED">Partially synchronised</option>
            <option value="SYNCHRONIZED_UNVERIFIED">Stored, not verified</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
          <select value={filters.accessStatus} onChange={setFilter('accessStatus')} className={selectClass} aria-label="Access">
            <option value="">Any access</option>
            <option value="allowed">Active</option>
            <option value="blocked">Blocked</option>
          </select>
          {activeFilters > 0 && (
            <button
              type="button"
              className="text-xs text-cyan-300 hover:underline"
              onClick={() => setFilters({ department: '', year: '', studentType: '', fingerprintStatus: '', syncStatus: '', accessStatus: '' })}
            >
              Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
                {['Student', 'Programme', 'Category', 'ZK ID', 'Enrolment', 'Gate Entry', 'Gate Exit', 'Overall', 'Access', ''].map((h) => (
                  <th key={h || 'actions'} className="whitespace-nowrap px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={`sk${i}`} className="border-t border-white/5">
                    <td colSpan={10} className="px-4 py-4">
                      <div className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
                    </td>
                  </tr>
                ))}
              {!loading &&
                filteredStudents.map((student) => (
                  <tr key={student._id} className="border-t border-white/5 transition-colors hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="keep-dark flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ink-600 to-ink-700 font-display text-xs font-semibold text-ink-100">
                          {(student.name || '?')
                            .split(' ')
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join('')}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{student.name}</div>
                          <div className="font-mono text-[11px] text-ink-400">{student.sapId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-200">
                      <div className="capitalize">{student.department}</div>
                      <div className="text-xs capitalize text-ink-400">
                        {student.course} · Year {student.year || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={student.studentType === 'hosteller' ? 'chip-info' : 'chip-off'}>
                        {student.studentType === 'hosteller' ? 'Hosteller' : 'Day scholar'}
                      </span>
                      {student.hostel?.name && <div className="mt-1 text-xs text-ink-400">{student.hostel.name}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-200">{student.zktUserID ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <FingerprintStatusBadge status={student.fingerprintStatus} />
                        {student.enrollmentState && !['idle', 'captured'].includes(student.enrollmentState) && (
                          <EnrollmentStateBadge state={student.enrollmentState} />
                        )}
                        <SimulatedBadge show={student.enrollmentSimulated} />
                      </div>
                      {student.fingerprintEnrolledAt && (
                        <div className="mt-1 font-mono text-[10px] text-ink-400">
                          {new Date(student.fingerprintEnrolledAt).toLocaleDateString('en-IN')} · {student.enrollmentDeviceSN || '—'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <GateStatusBadge gate={gateFor(student.gateSync, 'GATE_ENTRY')} />
                    </td>
                    <td className="px-4 py-3">
                      <GateStatusBadge gate={gateFor(student.gateSync, 'GATE_EXIT')} />
                    </td>
                    <td className="px-4 py-3">
                      <SyncStatusBadge status={student.syncStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={student.accessStatus === 'blocked' ? 'chip-bad' : 'chip-ok'}>
                        {student.accessStatus === 'blocked' ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSyncStudentId(student._id)}
                          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-ink-100 hover:border-cyan-400/40 hover:text-white"
                        >
                          Sync
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(student)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-ink-100 hover:border-cyan-400/40 hover:text-white"
                        >
                          <HiOutlinePencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && filteredStudents.length === 0 && (
          <div className="py-14 text-center">
            <HiOutlineUserGroup className="mx-auto mb-3 h-10 w-10 text-ink-500" />
            <p className="text-ink-200">No students match.</p>
            <p className="mt-1 text-xs text-ink-400">Adjust the search or filters, or add a student.</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-4 py-3 text-sm">
          <span className="text-ink-400">
            Page {page} of {meta.pages || 1} · {meta.total.toLocaleString('en-IN')} students
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button
              type="button"
              className="btn-ghost px-3 py-1.5"
              disabled={page >= (meta.pages || 1) || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {editing && editForm && (
        <StudentModal
          title={`Edit Student: ${selectedStudent?.name || ''}`}
          form={editForm}
          setForm={setEditForm}
          hostels={hostels}
          saving={saving}
          onClose={() => setEditing(false)}
          onPrimaryAction={handleSave}
          primaryLabel={saving ? 'Saving...' : 'Save Changes'}
          disableSapId
        />
      )}

      {showCreateModal && (
        <StudentModal
          title="Add Student"
          form={createForm}
          setForm={setCreateForm}
          hostels={hostels}
          saving={saving}
          onClose={closeCreateModal}
          onPrimaryAction={() => handleCreateStudent({ continueToEnrollment: false })}
          primaryLabel={saving ? 'Creating...' : 'Create Student'}
          secondaryAction={() => handleCreateStudent({ continueToEnrollment: true })}
          secondaryLabel="Create And Open Enrollment"
        />
      )}

      {syncStudentId && (
        <StudentSyncDrawer studentId={syncStudentId} onClose={() => { setSyncStudentId(null); loadData(); }} />
      )}

      <ExcelUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={loadData}
      />
    </div>
  );
}
