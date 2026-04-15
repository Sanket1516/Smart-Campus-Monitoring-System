const Hostel = require('../models/Hostel');

const resolveAssignedHostel = async (admin) => {
  if (!admin || admin.role !== 'warden') {
    return null;
  }

  if (admin.hostelId) {
    const hostel = await Hostel.findOne({ _id: admin.hostelId, isActive: true })
      .populate('warden', 'name email phone role isActive hostelId')
      .lean();

    if (hostel) {
      return hostel;
    }
  }

  const fallbackHostel = await Hostel.findOne({
    warden: admin._id,
    isActive: true,
  })
    .populate('warden', 'name email phone role isActive hostelId')
    .lean();

  return fallbackHostel || null;
};

const getAccessibleHostelIds = async (admin) => {
  const hostel = await resolveAssignedHostel(admin);
  return hostel?._id ? [String(hostel._id)] : [];
};

const ensureWardenHasHostelAccess = async (admin, hostelId) => {
  if (!admin || admin.role !== 'warden') {
    return true;
  }

  const assignedHostel = await resolveAssignedHostel(admin);
  return Boolean(assignedHostel?._id) && String(assignedHostel._id) === String(hostelId);
};

module.exports = {
  ensureWardenHasHostelAccess,
  getAccessibleHostelIds,
  resolveAssignedHostel,
};
