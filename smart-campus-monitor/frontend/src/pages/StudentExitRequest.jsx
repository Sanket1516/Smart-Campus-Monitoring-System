import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineClock,
  HiOutlineUser,
  HiOutlinePhone,
  HiOutlineLockClosed,
  HiOutlineLogout,
  HiOutlineCheckCircle,
} from 'react-icons/hi';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loggingIn, setLoggingIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState(null);
  const [latestRequest, setLatestRequest] = useState(null);
  const [form, setForm] = useState({
    reason: 'Medical',
    reasonDetail: '',
    requestedExitTime: '',
    expectedReturnTime: '',
  });

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      toast.error('Please enter your name and phone number');
      return;
    }

    setLoggingIn(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/hosteller/student/login`, {
        username: loginForm.username.trim(),
        password: loginForm.password.trim(),
      });

      setProfile(res.data.student);
      setLatestRequest(res.data.latestRequest);
      setIsAuthenticated(true);
      toast.success(`Welcome, ${res.data.student.name}!`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setProfile(null);
    setLatestRequest(null);
    setLoginForm({ username: '', password: '' });
    setForm({
      reason: 'Medical',
      reasonDetail: '',
      requestedExitTime: '',
      expectedReturnTime: '',
    });
    toast.success('Logged out successfully');
  };

  const submitRequest = async (e) => {
    e.preventDefault();

    if (latestRequest && ['pending', 'approved'].includes(latestRequest.status)) {
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

      const res = await axios.post(`${API_BASE_URL}/hosteller/request`, {
        username: loginForm.username,
        password: loginForm.password,
        reason: finalReason,
        requestedExitTime: form.requestedExitTime || undefined,
        expectedReturnTime: form.expectedReturnTime,
      });

      setLatestRequest(res.data.request);
      toast.success('Exit request submitted successfully!');
      
      // Reset form
      setForm({
        reason: 'Medical',
        reasonDetail: '',
        requestedExitTime: '',
        expectedReturnTime: '',
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 text-white rounded-full mb-4">
              <HiOutlineLockClosed className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Hosteller Login</h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter your details to submit an exit request
            </p>
          </div>

          {/* Login Form */}
          <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <div className="relative">
                  <HiOutlineUser className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    placeholder="Enter your full name"
                    className="w-full rounded-2xl border border-gray-300 py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <HiOutlinePhone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="tel"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    placeholder="Enter your registered phone number"
                    className="w-full rounded-2xl border border-gray-300 py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Use the phone number registered with the hostel
                </p>
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full rounded-2xl bg-primary-600 px-6 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60 transition-colors"
              >
                {loggingIn ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                This service is only available for hostellers. If you're having trouble logging in, please contact your hostel warden.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header with Logout */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Exit Request Portal</h1>
            <p className="mt-1 text-sm text-gray-600">Submit and track your hostel exit requests</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-2xl bg-white border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <HiOutlineLogout className="h-5 w-5" />
            Logout
          </button>
        </div>

        {/* Student Profile Card */}
        <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-2xl font-bold">
                {profile?.name?.charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Student Name</p>
                <p className="text-lg font-semibold text-gray-900">{profile?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">SAP ID</p>
                <p className="text-lg font-semibold text-gray-900">{profile?.sapId}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Hostel</p>
                <p className="text-lg font-semibold text-gray-900">{profile?.hostel?.name || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Room Number</p>
                <p className="text-lg font-semibold text-gray-900">{profile?.roomNumber || 'Not assigned'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submit New Request */}
          <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <HiOutlineCheckCircle className="h-6 w-6 text-primary-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800">New Exit Request</h2>
            </div>

            <form onSubmit={submitRequest} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Exit
                </label>
                <select
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {reasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Details
                </label>
                <textarea
                  rows={3}
                  value={form.reasonDetail}
                  onChange={(e) => setForm({ ...form, reasonDetail: e.target.value })}
                  placeholder="Provide more details about your exit reason"
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requested Exit Time
                </label>
                <input
                  type="datetime-local"
                  value={form.requestedExitTime}
                  onChange={(e) => setForm({ ...form, requestedExitTime: e.target.value })}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Leave empty for immediate exit</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expected Return Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.expectedReturnTime}
                  onChange={(e) => setForm({ ...form, expectedReturnTime: e.target.value })}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting || (latestRequest && ['pending', 'approved'].includes(latestRequest?.status))}
                className="w-full rounded-2xl bg-primary-600 px-6 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>

              {latestRequest && ['pending', 'approved'].includes(latestRequest?.status) && (
                <p className="text-sm text-amber-600 text-center">
                  You have an active request. Wait for it to be completed before submitting a new one.
                </p>
              )}
            </form>
          </div>

          {/* Current Request Status */}
          <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <HiOutlineClock className="h-6 w-6 text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800">Request Status</h2>
            </div>

            {latestRequest ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <span className="text-sm font-medium text-gray-600">Status</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      latestRequest.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : latestRequest.status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : latestRequest.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {latestRequest.status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Reason</span>
                    <span className="font-medium text-gray-900">{latestRequest.reason}</span>
                  </div>
                  
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Expected Return</span>
                    <span className="font-medium text-gray-900">
                      {formatDateTime(latestRequest.expectedReturnTime)}
                    </span>
                  </div>

                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Submitted On</span>
                    <span className="font-medium text-gray-900">
                      {formatDateTime(latestRequest.createdAt)}
                    </span>
                  </div>

                  {latestRequest.rejectionReason && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
                      <p className="text-xs font-semibold text-red-700 mb-1">Rejection Reason</p>
                      <p className="text-sm text-red-600">{latestRequest.rejectionReason}</p>
                    </div>
                  )}

                  {latestRequest.status === 'approved' && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-2xl">
                      <p className="text-sm text-green-700">
                        ✓ Your request has been approved. You can exit the hostel as per your schedule.
                      </p>
                    </div>
                  )}

                  {latestRequest.status === 'pending' && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                      <p className="text-sm text-amber-700">
                        ⏳ Your request is pending approval from the warden.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <HiOutlineClock className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-500 text-sm">No requests found</p>
                <p className="text-gray-400 text-xs mt-1">Submit your first exit request to get started</p>
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-3xl p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-700">
            If you have any questions about the exit request process or need to update your contact information, 
            please reach out to your hostel warden or visit the hostel office.
          </p>
        </div>
      </div>
    </div>
  );
}
