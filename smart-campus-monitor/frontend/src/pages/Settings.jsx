import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createStudentApi, getStudentsApi } from '../services/api';
import toast from 'react-hot-toast';
import { HiOutlineCog, HiOutlineUserAdd } from 'react-icons/hi';
import {
  CATEGORY_OPTIONS,
  COURSE_OPTIONS,
  getCategoryLabel,
  getCourseLabel,
  getDepartmentLabel,
  getDepartmentOptions,
} from '../utils/studentOptions';

const createInitialForm = () => ({
  sapId: '',
  name: '',
  email: '',
  parentEmail: '',
  parentPhone: '',
  category: 'dayscholars',
  course: 'engineering',
  department: 'computer science',
  year: 3,
});

export default function Settings() {
  const { admin } = useAuth();
  const [studentForm, setStudentForm] = useState(createInitialForm);
  const [adding, setAdding] = useState(false);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  const departmentOptions = getDepartmentOptions(studentForm.course);

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const res = await getStudentsApi({ limit: 100 });
      setStudents(res.data.students || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const updateForm = (updates) => {
    setStudentForm((current) => ({ ...current, ...updates }));
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await createStudentApi(studentForm);
      toast.success('Student added successfully');
      setStudentForm(createInitialForm());
      loadStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add student');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <HiOutlineCog className="w-7 h-7" /> Settings
        </h1>
        <p className="text-gray-500">System configuration and student management</p>
      </div>

      {/* Current user info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-700 mb-4">Current User</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Name:</span>
            <span className="ml-2 font-medium">{admin?.name}</span>
          </div>
          <div>
            <span className="text-gray-500">Username:</span>
            <span className="ml-2 font-medium">{admin?.username}</span>
          </div>
          <div>
            <span className="text-gray-500">Role:</span>
            <span className="ml-2 font-medium capitalize">{admin?.role}</span>
          </div>
        </div>
      </div>

      {/* Add Student (admin only) */}
      {admin?.role === 'admin' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <HiOutlineUserAdd className="w-5 h-5" /> Add New Student
          </h2>
          <form onSubmit={handleAddStudent} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">SAP ID</label>
              <input
                type="text"
                value={studentForm.sapId}
                onChange={(e) => updateForm({ sapId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Full Name</label>
              <input
                type="text"
                value={studentForm.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Student Email</label>
              <input
                type="email"
                value={studentForm.email}
                onChange={(e) => updateForm({ email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Parent Email</label>
              <input
                type="email"
                value={studentForm.parentEmail}
                onChange={(e) => updateForm({ parentEmail: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Parent Phone</label>
              <input
                type="tel"
                value={studentForm.parentPhone}
                onChange={(e) => updateForm({ parentPhone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
              <select
                value={studentForm.category}
                onChange={(e) => updateForm({ category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Course</label>
              <select
                value={studentForm.course}
                onChange={(e) => {
                  const nextCourse = e.target.value;
                  const nextDepartments = getDepartmentOptions(nextCourse);
                  updateForm({
                    course: nextCourse,
                    department: nextDepartments[0]?.value || '',
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                {COURSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Department</label>
              <select
                value={studentForm.department}
                onChange={(e) => updateForm({ department: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                {departmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Year</label>
              <select
                value={studentForm.year}
                onChange={(e) => updateForm({ year: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>Year {y}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={adding}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-60"
              >
                {adding ? 'Adding...' : 'Add Student'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-700">Student List</h2>
          <p className="text-sm text-gray-500">Current registered students and their course mapping</p>
        </div>
        {loadingStudents ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">SAP ID</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Course</th>
                  <th className="text-left px-4 py-3 font-medium">Department</th>
                  <th className="text-left px-4 py-3 font-medium">Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No students found
                    </td>
                  </tr>
                ) : (
                  students.map((student) => (
                    <tr key={student._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{student.sapId}</td>
                      <td className="px-4 py-3 font-medium">{student.name}</td>
                      <td className="px-4 py-3">{getCategoryLabel(student.category)}</td>
                      <td className="px-4 py-3">{getCourseLabel(student.course)}</td>
                      <td className="px-4 py-3">{getDepartmentLabel(student.course, student.department)}</td>
                      <td className="px-4 py-3">{student.year || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-700 mb-4">System Information</h2>
        <div className="text-sm space-y-2 text-gray-600">
          <p><span className="font-medium">Version:</span> 1.0.0</p>
          <p><span className="font-medium">Curfew Hour:</span> 22:00 (configurable via CURFEW_HOUR env)</p>
          <p><span className="font-medium">Notifications:</span> Email (Nodemailer) + SMS (Fast2SMS)</p>
          <p><span className="font-medium">Scanner:</span> ZXing barcode reader via webcam</p>
        </div>
      </div>
    </div>
  );
}
