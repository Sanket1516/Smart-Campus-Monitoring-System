import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createStudentApi } from '../services/api';
import toast from 'react-hot-toast';
import { HiOutlineCog, HiOutlineUserAdd } from 'react-icons/hi';

export default function Settings() {
  const { admin } = useAuth();
  const [studentForm, setStudentForm] = useState({
    sapId: '',
    name: '',
    email: '',
    parentEmail: '',
    parentPhone: '',
    category: 'day_scholar',
    department: '',
    year: 3,
  });
  const [adding, setAdding] = useState(false);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await createStudentApi(studentForm);
      toast.success('Student added successfully');
      setStudentForm({
        sapId: '',
        name: '',
        email: '',
        parentEmail: '',
        parentPhone: '',
        category: 'day_scholar',
        department: '',
        year: 3,
      });
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
                onChange={(e) => setStudentForm({ ...studentForm, sapId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Full Name</label>
              <input
                type="text"
                value={studentForm.name}
                onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Student Email</label>
              <input
                type="email"
                value={studentForm.email}
                onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Parent Email</label>
              <input
                type="email"
                value={studentForm.parentEmail}
                onChange={(e) => setStudentForm({ ...studentForm, parentEmail: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Parent Phone</label>
              <input
                type="tel"
                value={studentForm.parentPhone}
                onChange={(e) => setStudentForm({ ...studentForm, parentPhone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
              <select
                value={studentForm.category}
                onChange={(e) => setStudentForm({ ...studentForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="day_scholar">Day Scholar</option>
                <option value="hosteller">Hosteller</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Department</label>
              <input
                type="text"
                value={studentForm.department}
                onChange={(e) => setStudentForm({ ...studentForm, department: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Year</label>
              <select
                value={studentForm.year}
                onChange={(e) => setStudentForm({ ...studentForm, year: Number(e.target.value) })}
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
