import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(createStudentForm());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentsRes, hostelsRes] = await Promise.all([getStudentsApi(), getHostelsApi()]);
      setStudents(studentsRes.data.students || []);
      setHostels(hostelsRes.data.hostels || []);
    } catch (_error) {
      toast.error('Failed to load data');
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

  const filteredStudents = students.filter(
    (student) =>
      student.name?.toLowerCase().includes(search.toLowerCase()) ||
      student.sapId?.toLowerCase().includes(search.toLowerCase()) ||
      student.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Student Management</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Add students manually, upload via Excel, and keep enrollment-ready records in one place.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700"
          >
            <HiOutlinePlus className="h-5 w-5" />
            Add Student
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
          >
            <HiOutlineUpload className="h-5 w-5" />
            Upload Excel
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700"
          >
            <HiOutlineRefresh className="h-5 w-5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <HiOutlineSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, SAP ID, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
          <p className="text-gray-600 dark:text-gray-400">Loading students...</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-gray-50 dark:border-gray-600 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    SAP ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Hostel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Course
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {filteredStudents.map((student) => (
                  <tr key={student._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {student.sapId}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                      {student.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {student.email}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          student.studentType === 'hosteller'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        }`}
                      >
                        {student.studentType === 'hosteller' ? 'Hosteller' : 'Day Scholar'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {student.hostel?.name || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm capitalize text-gray-600 dark:text-gray-300">
                      {student.course}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      Year {student.year || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <button
                        onClick={() => handleEdit(student)}
                        className="flex items-center gap-1 rounded bg-primary-600 px-3 py-1.5 text-white transition-colors hover:bg-primary-700"
                      >
                        <HiOutlinePencil className="h-4 w-4" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredStudents.length === 0 && (
            <div className="py-12 text-center">
              <HiOutlineUserGroup className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400">No students found</p>
            </div>
          )}
        </div>
      )}

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

      <ExcelUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={loadData}
      />
    </div>
  );
}
