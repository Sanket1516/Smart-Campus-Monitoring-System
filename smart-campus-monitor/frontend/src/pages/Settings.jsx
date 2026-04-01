import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineCog,
  HiOutlineHome,
  HiOutlinePencilAlt,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserAdd,
  HiOutlineUserGroup,
} from 'react-icons/hi';
import {
  createHostelApi,
  deactivateStaffApi,
  deleteHostelApi,
  getHostelStudentsApi,
  getHostelsApi,
  getStaffApi,
  registerStaffApi,
  updateHostelApi,
  updateStaffApi,
} from '../services/api';
import { useAuth } from '../context/AuthContext';

const tabs = [
  { id: 'hostels', label: 'Hostel Management', icon: HiOutlineHome },
  { id: 'staff', label: 'Staff Management', icon: HiOutlineUserGroup },
];

const emptyHostel = {
  name: '',
  code: '',
  type: 'boys',
  totalRooms: '',
  capacity: '',
  warden: '',
  wardenPhone: '',
  wardenEmail: '',
  location: '',
};

const emptyStaff = {
  username: '',
  password: '',
  name: '',
  email: '',
  phone: '',
  role: 'warden',
};

const fmt = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'N/A';

const roleBadge = (role) =>
  role === 'admin'
    ? 'bg-blue-100 text-blue-700'
    : role === 'warden'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-amber-100 text-amber-700';

export default function Settings() {
  const { admin } = useAuth();
  const [tab, setTab] = useState('hostels');
  const [hostels, setHostels] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hostelForm, setHostelForm] = useState(emptyHostel);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [editingHostel, setEditingHostel] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  const [showHostelForm, setShowHostelForm] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentPanel, setStudentPanel] = useState(null);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const wardens = useMemo(
    () => staff.filter((member) => member.role === 'warden' && member.isActive),
    [staff]
  );

  const hostelCountByWarden = useMemo(
    () =>
      hostels.reduce((acc, hostel) => {
        const id = hostel.warden?._id;
        if (id) acc[id] = (acc[id] || 0) + 1;
        return acc;
      }, {}),
    [hostels]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [hostelRes, staffRes] = await Promise.all([getHostelsApi(), getStaffApi()]);
      setHostels(hostelRes.data.hostels || []);
      setStaff(staffRes.data.staff || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetHostelForm = () => {
    setHostelForm(emptyHostel);
    setEditingHostel(null);
    setShowHostelForm(false);
  };

  const resetStaffForm = () => {
    setStaffForm(emptyStaff);
    setEditingStaff(null);
    setShowStaffForm(false);
  };

  const saveHostel = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...hostelForm,
      totalRooms: hostelForm.totalRooms === '' ? 0 : Number(hostelForm.totalRooms),
      capacity: hostelForm.capacity === '' ? 0 : Number(hostelForm.capacity),
    };

    try {
      if (editingHostel) {
        await updateHostelApi(editingHostel._id, payload);
        toast.success('Hostel updated');
      } else {
        await createHostelApi(payload);
        toast.success('Hostel created');
      }
      resetHostelForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save hostel');
    } finally {
      setSaving(false);
    }
  };

  const saveStaff = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingStaff) {
        await updateStaffApi(editingStaff.id || editingStaff._id, staffForm);
        toast.success('Staff updated');
      } else {
        await registerStaffApi(staffForm);
        toast.success('Staff created');
      }
      resetStaffForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save staff');
    } finally {
      setSaving(false);
    }
  };

  const editHostel = (hostel) => {
    setEditingHostel(hostel);
    setHostelForm({
      name: hostel.name || '',
      code: hostel.code || '',
      type: hostel.type || 'boys',
      totalRooms: hostel.totalRooms ?? '',
      capacity: hostel.capacity ?? '',
      warden: hostel.warden?._id || '',
      wardenPhone: hostel.wardenPhone || '',
      wardenEmail: hostel.wardenEmail || '',
      location: hostel.location || '',
    });
    setShowHostelForm(true);
  };

  const editStaff = (member) => {
    setEditingStaff(member);
    setStaffForm({
      username: member.username || '',
      password: '',
      name: member.name || '',
      email: member.email || '',
      phone: member.phone || '',
      role: member.role || 'warden',
    });
    setShowStaffForm(true);
  };

  const deactivateHostel = async (hostel) => {
    if (!window.confirm(`Deactivate ${hostel.name}?`)) return;
    try {
      await deleteHostelApi(hostel._id);
      toast.success('Hostel deactivated');
      if (studentPanel?.hostel?._id === hostel._id) setStudentPanel(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate hostel');
    }
  };

  const deactivateStaff = async (member) => {
    if (!window.confirm(`Deactivate ${member.name}?`)) return;
    try {
      await deactivateStaffApi(member.id || member._id);
      toast.success('Staff deactivated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate staff');
    }
  };

  const openStudents = async (hostel) => {
    setLoadingStudents(true);
    try {
      const res = await getHostelStudentsApi(hostel._id);
      setStudentPanel(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load hostel students');
    } finally {
      setLoadingStudents(false);
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
        Only administrators can access hostel and staff management.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <HiOutlineCog className="h-7 w-7" /> Settings
        </h1>
        <p className="text-gray-500">Hostel administration and staff management.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
              tab === item.id
                ? 'bg-primary-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'hostels' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Hostel Management</h2>
              <p className="text-sm text-gray-500">Create hostels, assign wardens, and manage occupancy.</p>
            </div>
            <button
              type="button"
              onClick={() => (showHostelForm ? resetHostelForm() : setShowHostelForm(true))}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <HiOutlinePlus className="h-5 w-5" />
              {showHostelForm ? 'Close Form' : 'Add Hostel'}
            </button>
          </div>

          {showHostelForm && (
            <form onSubmit={saveHostel} className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-6 md:grid-cols-2 xl:grid-cols-3">
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Hostel Name" value={hostelForm.name} onChange={(e) => setHostelForm((s) => ({ ...s, name: e.target.value }))} required />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Code" value={hostelForm.code} onChange={(e) => setHostelForm((s) => ({ ...s, code: e.target.value }))} />
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={hostelForm.type} onChange={(e) => setHostelForm((s) => ({ ...s, type: e.target.value }))}>
                <option value="boys">Boys</option>
                <option value="girls">Girls</option>
                <option value="mixed">Mixed</option>
              </select>
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" type="number" min="0" placeholder="Total Rooms" value={hostelForm.totalRooms} onChange={(e) => setHostelForm((s) => ({ ...s, totalRooms: e.target.value }))} />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" type="number" min="0" placeholder="Capacity" value={hostelForm.capacity} onChange={(e) => setHostelForm((s) => ({ ...s, capacity: e.target.value }))} />
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={hostelForm.warden} onChange={(e) => setHostelForm((s) => ({ ...s, warden: e.target.value }))} required>
                <option value="">Assign Warden</option>
                {wardens.map((warden) => (
                  <option key={warden.id || warden._id} value={warden.id || warden._id}>
                    {warden.name} ({warden.username})
                  </option>
                ))}
              </select>
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Warden Phone" value={hostelForm.wardenPhone} onChange={(e) => setHostelForm((s) => ({ ...s, wardenPhone: e.target.value }))} />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" type="email" placeholder="Warden Email" value={hostelForm.wardenEmail} onChange={(e) => setHostelForm((s) => ({ ...s, wardenEmail: e.target.value }))} />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-1" placeholder="Location" value={hostelForm.location} onChange={(e) => setHostelForm((s) => ({ ...s, location: e.target.value }))} />
              <div className="md:col-span-2 xl:col-span-3 flex gap-3">
                <button className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700" disabled={saving}>
                  {saving ? 'Saving...' : editingHostel ? 'Update Hostel' : 'Create Hostel'}
                </button>
                <button type="button" onClick={resetHostelForm} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {hostels.map((hostel) => (
              <article key={hostel._id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">{hostel.name}</h3>
                    <p className="text-sm text-gray-500 capitalize">
                      {hostel.type} hostel • {hostel.location || 'Location not set'}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                    {hostel.code || 'No code'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Students</p>
                    <p className="mt-1 text-xl font-semibold text-gray-800">{hostel.studentCount}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Occupancy</p>
                    <p className="mt-1 text-xl font-semibold text-gray-800">{hostel.occupancy}%</p>
                  </div>
                </div>
                <div className="mt-4 space-y-1 text-sm text-gray-600">
                  <p><span className="font-medium text-gray-700">Warden:</span> {hostel.warden?.name || 'Not assigned'}</p>
                  <p><span className="font-medium text-gray-700">Contact:</span> {hostel.wardenEmail || hostel.warden?.email || 'No email'} • {hostel.wardenPhone || hostel.warden?.phone || 'No phone'}</p>
                  <p><span className="font-medium text-gray-700">Capacity:</span> {hostel.capacity || 0} beds • {hostel.totalRooms || 0} rooms</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={() => openStudents(hostel)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">View Students</button>
                  <button type="button" onClick={() => editHostel(hostel)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><HiOutlinePencilAlt className="h-4 w-4" />Edit</button>
                  <button type="button" onClick={() => deactivateHostel(hostel)} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><HiOutlineTrash className="h-4 w-4" />Deactivate</button>
                </div>
              </article>
            ))}
            {hostels.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500 xl:col-span-2">No active hostels found.</div>}
          </div>

          {(loadingStudents || studentPanel) && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    Hostel Students {studentPanel?.hostel?.name ? `• ${studentPanel.hostel.name}` : ''}
                  </h3>
                  <p className="text-sm text-gray-500">Enrollment and access status of assigned students.</p>
                </div>
                {studentPanel && <button type="button" onClick={() => setStudentPanel(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>}
              </div>
              {loadingStudents ? (
                <div className="flex items-center justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" /></div>
              ) : studentPanel?.students?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Student</th>
                        <th className="px-4 py-3 text-left font-medium">SAP ID</th>
                        <th className="px-4 py-3 text-left font-medium">Room</th>
                        <th className="px-4 py-3 text-left font-medium">Enrollment</th>
                        <th className="px-4 py-3 text-left font-medium">Access</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {studentPanel.students.map((student) => (
                        <tr key={student._id}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{student.name}</div>
                            <div className="text-xs text-gray-500">{student.department} • Year {student.year || '-'}</div>
                          </td>
                          <td className="px-4 py-3 font-mono">{student.sapId}</td>
                          <td className="px-4 py-3">{student.roomNumber || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${student.fingerprintEnrolled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {student.fingerprintEnrolled ? 'Enrolled' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${student.accessStatus === 'allowed' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                              {student.accessStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">No active students assigned to this hostel.</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'staff' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Staff Management</h2>
              <p className="text-sm text-gray-500">Create admin, warden, and security accounts.</p>
            </div>
            <button
              type="button"
              onClick={() => (showStaffForm ? resetStaffForm() : setShowStaffForm(true))}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <HiOutlineUserAdd className="h-5 w-5" />
              {showStaffForm ? 'Close Form' : 'Add Staff'}
            </button>
          </div>

          {showStaffForm && (
            <form onSubmit={saveStaff} className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-6 md:grid-cols-2 xl:grid-cols-3">
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100" placeholder="Username" value={staffForm.username} onChange={(e) => setStaffForm((s) => ({ ...s, username: e.target.value }))} disabled={Boolean(editingStaff)} required />
              {!editingStaff && <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Temporary Password" value={staffForm.password} onChange={(e) => setStaffForm((s) => ({ ...s, password: e.target.value }))} required />}
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Name" value={staffForm.name} onChange={(e) => setStaffForm((s) => ({ ...s, name: e.target.value }))} required />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" type="email" placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm((s) => ({ ...s, email: e.target.value }))} />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Phone" value={staffForm.phone} onChange={(e) => setStaffForm((s) => ({ ...s, phone: e.target.value }))} />
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={staffForm.role} onChange={(e) => setStaffForm((s) => ({ ...s, role: e.target.value }))}>
                <option value="admin">Admin</option>
                <option value="warden">Warden</option>
                <option value="security">Security</option>
              </select>
              <div className="md:col-span-2 xl:col-span-3 flex gap-3">
                <button className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700" disabled={saving}>
                  {saving ? 'Saving...' : editingStaff ? 'Update Staff' : 'Create Staff'}
                </button>
                <button type="button" onClick={resetStaffForm} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {staff.map((member) => (
              <article key={member.id || member._id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">{member.name}</h3>
                    <p className="text-sm text-gray-500">{member.username} • {member.email || 'No email'}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${roleBadge(member.role)}`}>{member.role}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${member.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>{member.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <div className="mt-4 space-y-1 text-sm text-gray-600">
                  <p><span className="font-medium text-gray-700">Phone:</span> {member.phone || 'Not set'}</p>
                  <p><span className="font-medium text-gray-700">Assigned Hostels:</span> {hostelCountByWarden[member.id || member._id] || 0}</p>
                  <p><span className="font-medium text-gray-700">Created:</span> {fmt(member.createdAt)}</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={() => editStaff(member)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><HiOutlinePencilAlt className="h-4 w-4" />Edit</button>
                  {member.isActive && <button type="button" onClick={() => deactivateStaff(member)} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><HiOutlineTrash className="h-4 w-4" />Deactivate</button>}
                </div>
              </article>
            ))}
            {staff.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500 xl:col-span-2">No staff accounts found.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
