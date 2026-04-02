const Hostel = require('../models/Hostel');
const Student = require('../models/Student');
const HostellerRequest = require('../models/HostellerRequest');
const Admin = require('../models/Admin');
const { emitHostelWardenChanged } = require('../services/socketService');
const { createAuditLog } = require('../services/auditService');

const getOccupancy = (studentCount, capacity) => {
  const safeCapacity = Number(capacity) || 0;
  if (!safeCapacity) {
    return 0;
  }

  return Number(((studentCount / safeCapacity) * 100).toFixed(2));
};

const enrichHostel = async (hostel) => {
  const plainHostel = hostel.toObject ? hostel.toObject() : hostel;
  const studentCount = await Student.countDocuments({
    hostel: plainHostel._id,
    isActive: true,
  });

  return {
    ...plainHostel,
    studentCount,
    occupancy: getOccupancy(studentCount, plainHostel.capacity),
  };
};

// GET /api/hostels
exports.getHostels = async (req, res) => {
  try {
    // Build query based on user role
    let query = { isActive: true };
    
    // If warden, only show hostels they're assigned to
    if (req.admin.role === 'warden') {
      query.warden = req.admin._id;
    }
    
    const hostels = await Hostel.find(query)
      .populate('warden', 'name username email phone role isActive')
      .populate('createdBy', 'name username role')
      .sort({ name: 1 });

    const enrichedHostels = await Promise.all(hostels.map(enrichHostel));

    res.json({ hostels: enrichedHostels });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/hostels/:id
exports.getHostelById = async (req, res) => {
  try {
    const hostel = await Hostel.findById(req.params.id)
      .populate('warden', 'name username email phone role isActive')
      .populate('createdBy', 'name username role');

    if (!hostel) {
      return res.status(404).json({ message: 'Hostel not found' });
    }

    const enrichedHostel = await enrichHostel(hostel);

    res.json({ hostel: enrichedHostel });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/hostels
exports.createHostel = async (req, res) => {
  try {
    const warden = await Admin.findOne({
      _id: req.body.warden,
      role: 'warden',
      isActive: true,
    });

    if (!warden) {
      return res.status(400).json({ message: 'Assigned warden must be an active warden account' });
    }

    const hostel = await Hostel.create({
      ...req.body,
      createdBy: req.admin._id,
    });

    const populatedHostel = await Hostel.findById(hostel._id)
      .populate('warden', 'name username email phone role isActive')
      .populate('createdBy', 'name username role');

    await createAuditLog({
      admin: req.admin,
      action: `Created hostel ${hostel.name}`,
      entity: 'Hostel',
      entityId: hostel._id,
      oldValue: null,
      newValue: populatedHostel.toObject(),
      ipAddress: req.ip,
    });

    res.status(201).json({ hostel: await enrichHostel(populatedHostel) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/hostels/:id
exports.updateHostel = async (req, res) => {
  try {
    const existingHostel = await Hostel.findById(req.params.id).populate(
      'warden',
      'name username email phone role isActive'
    );

    if (!existingHostel) {
      return res.status(404).json({ message: 'Hostel not found' });
    }

    const warden = await Admin.findOne({
      _id: req.body.warden,
      role: 'warden',
      isActive: true,
    });

    if (!warden) {
      return res.status(400).json({ message: 'Assigned warden must be an active warden account' });
    }

    const previousWardenId = existingHostel.warden?._id
      ? String(existingHostel.warden._id)
      : null;

    Object.assign(existingHostel, req.body);
    await existingHostel.save();

    const updatedHostel = await Hostel.findById(existingHostel._id)
      .populate('warden', 'name username email phone role isActive')
      .populate('createdBy', 'name username role');

    const nextWardenId = updatedHostel.warden?._id ? String(updatedHostel.warden._id) : null;

    if (previousWardenId && nextWardenId && previousWardenId !== nextWardenId) {
      await HostellerRequest.updateMany(
        {
          hostel: updatedHostel._id,
          status: 'pending',
        },
        {
          $set: { warden: updatedHostel.warden._id },
        }
      );

      emitHostelWardenChanged({
        hostelName: updatedHostel.name,
        hostelId: String(updatedHostel._id),
        oldWarden: previousWardenId,
        newWarden: nextWardenId,
      });
    }

    await createAuditLog({
      admin: req.admin,
      action: `Updated hostel ${updatedHostel.name}`,
      entity: 'Hostel',
      entityId: updatedHostel._id,
      oldValue: existingHostel.toObject(),
      newValue: updatedHostel.toObject(),
      ipAddress: req.ip,
    });

    res.json({ hostel: await enrichHostel(updatedHostel) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/hostels/:id
exports.deleteHostel = async (req, res) => {
  try {
    const hostel = await Hostel.findById(req.params.id);

    if (!hostel) {
      return res.status(404).json({ message: 'Hostel not found' });
    }

    const assignedStudents = await Student.countDocuments({
      hostel: hostel._id,
      isActive: true,
    });

    if (assignedStudents > 0) {
      return res.status(400).json({
        message: 'Cannot deactivate hostel while active students are assigned',
      });
    }

    const previousState = hostel.toObject();
    hostel.isActive = false;
    await hostel.save();

    await createAuditLog({
      admin: req.admin,
      action: `Deactivated hostel ${hostel.name}`,
      entity: 'Hostel',
      entityId: hostel._id,
      oldValue: previousState,
      newValue: hostel.toObject(),
      ipAddress: req.ip,
    });

    res.json({ message: 'Hostel deactivated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/hostels/:id/students
exports.getHostelStudents = async (req, res) => {
  try {
    const hostel = await Hostel.findById(req.params.id)
      .populate('warden', 'name username email phone role isActive');

    if (!hostel) {
      return res.status(404).json({ message: 'Hostel not found' });
    }

    const students = await Student.find({
      hostel: hostel._id,
      isActive: true,
    })
      .select(
        'sapId name email department year studentType roomNumber fingerprintEnrolled accessStatus blockReason isHosteller wardenApprovalRequired'
      )
      .sort({ name: 1 });

    res.json({
      hostel: await enrichHostel(hostel),
      students,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
