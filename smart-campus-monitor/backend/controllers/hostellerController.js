const HostellerRequest = require('../models/HostellerRequest');
const Student = require('../models/Student');
const Hostel = require('../models/Hostel');
const AlertLog = require('../models/AlertLog');
const { sendEmail } = require('../services/notification');
const { emitWardenLateReturn, emitWardenNewRequest } = require('../services/socketService');
const { getGracePeriodMinutes, shouldSendLateReturnEmail } = require('../services/configService');
const { createAuditLog } = require('../services/auditService');

const buildReturnDeadline = async (expectedReturnTime) => {
  const gracePeriodMinutes = await getGracePeriodMinutes();
  return new Date(new Date(expectedReturnTime).getTime() + gracePeriodMinutes * 60 * 1000);
};

const buildRequestQueryForRole = (admin) => {
  if (admin.role === 'warden') {
    return { warden: admin._id };
  }

  return {};
};

const serializeRequest = (request) => ({
  _id: request._id,
  student: request.student,
  hostel: request.hostel,
  warden: request.warden,
  reason: request.reason,
  requestedExitTime: request.requestedExitTime,
  expectedReturnTime: request.expectedReturnTime,
  status: request.status,
  approvedAt: request.approvedAt,
  rejectedAt: request.rejectedAt,
  rejectionReason: request.rejectionReason,
  accessValidUntil: request.accessValidUntil,
  usedForExit: request.usedForExit,
  usedForEntry: request.usedForEntry,
  lastAlertSentAt: request.lastAlertSentAt,
  createdAt: request.createdAt,
});

const sendHostellerEmail = async ({ to, subject, text, html }) => {
  if (!to) {
    return null;
  }

  return sendEmail({ to, subject, text, html });
};

const notifyRequestSubmitted = async (request) => {
  const wardenEmail = request.warden?.email || request.hostel?.wardenEmail;

  return sendHostellerEmail({
    to: wardenEmail,
    subject: `Exit request submitted by ${request.student.name}`,
    text: `${request.student.name} (${request.student.sapId}) requested hostel exit permission.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>New Hosteller Exit Request</h2>
        <p><strong>Student:</strong> ${request.student.name} (${request.student.sapId})</p>
        <p><strong>Hostel:</strong> ${request.hostel.name}</p>
        <p><strong>Room:</strong> ${request.student.roomNumber || '-'}</p>
        <p><strong>Reason:</strong> ${request.reason}</p>
        <p><strong>Requested Exit Time:</strong> ${request.requestedExitTime ? new Date(request.requestedExitTime).toLocaleString('en-IN') : 'Immediate'}</p>
        <p><strong>Expected Return Time:</strong> ${new Date(request.expectedReturnTime).toLocaleString('en-IN')}</p>
      </div>
    `,
  });
};

const notifyRequestApproved = async (request) => {
  const subject = `Exit request approved for ${request.student.name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Exit Request Approved</h2>
      <p><strong>Student:</strong> ${request.student.name} (${request.student.sapId})</p>
      <p><strong>Hostel:</strong> ${request.hostel.name}</p>
      <p><strong>Valid Until:</strong> ${new Date(request.accessValidUntil).toLocaleString('en-IN')}</p>
    </div>
  `;

  await Promise.all([
    sendHostellerEmail({
      to: request.student.email,
      subject,
      text: `Your exit request has been approved until ${new Date(request.accessValidUntil).toLocaleString('en-IN')}.`,
      html,
    }),
    sendHostellerEmail({
      to: request.student.parentEmail,
      subject,
      text: `${request.student.name}'s exit request has been approved until ${new Date(request.accessValidUntil).toLocaleString('en-IN')}.`,
      html,
    }),
  ]);
};

const notifyRequestRejected = async (request) =>
  sendHostellerEmail({
    to: request.student.email,
    subject: `Exit request rejected for ${request.student.name}`,
    text: `Your exit request was rejected. Reason: ${request.rejectionReason}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Exit Request Rejected</h2>
        <p><strong>Student:</strong> ${request.student.name} (${request.student.sapId})</p>
        <p><strong>Reason:</strong> ${request.rejectionReason}</p>
      </div>
    `,
  });

const notifyLateReturn = async (request, minutesLate) => {
  const shouldSend = await shouldSendLateReturnEmail();
  if (!shouldSend) {
    return null;
  }

  const subject = `Late return alert for ${request.student.name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Late Return Alert</h2>
      <p><strong>Student:</strong> ${request.student.name} (${request.student.sapId})</p>
      <p><strong>Hostel:</strong> ${request.hostel.name}</p>
      <p><strong>Approved Until:</strong> ${new Date(request.accessValidUntil).toLocaleString('en-IN')}</p>
      <p><strong>Minutes Late:</strong> ${minutesLate}</p>
    </div>
  `;

  await Promise.all([
    sendHostellerEmail({
      to: request.warden?.email || request.hostel?.wardenEmail,
      subject,
      text: `${request.student.name} is ${minutesLate} minutes late returning to hostel.`,
      html,
    }),
    sendHostellerEmail({
      to: request.student.parentEmail,
      subject,
      text: `${request.student.name} is ${minutesLate} minutes late returning to hostel.`,
      html,
    }),
  ]);
};

// POST /api/hosteller/student/login
exports.studentLogin = async (req, res) => {
  try {
    // Student is already authenticated by middleware and attached to req.student
    const student = req.student;

    // Get latest request status
    const latestRequest = await HostellerRequest.findOne({
      student: student._id,
    })
      .sort({ createdAt: -1 })
      .select('status reason requestedExitTime expectedReturnTime createdAt rejectionReason');

    res.json({
      success: true,
      student: {
        _id: student._id,
        name: student.name,
        sapId: student.sapId,
        email: student.email,
        phone: student.phone,
        roomNumber: student.roomNumber,
        hostel: student.hostel,
      },
      latestRequest,
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

// POST /api/hosteller/request
exports.createHostellerRequest = async (req, res) => {
  try {
    // Student is already authenticated by middleware
    const student = req.student;
    const { reason, requestedExitTime, expectedReturnTime } = req.body;

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!student.hostel) {
      return res.status(400).json({ message: 'No hostel assigned. Please contact admin.' });
    }

    const hostel = student.hostel;
    const warden = hostel.warden;

    if (!warden || warden.role !== 'warden' || warden.isActive === false) {
      return res.status(400).json({ message: 'Hostel warden is not assigned correctly. Please contact admin.' });
    }

    const existingPending = await HostellerRequest.findOne({
      student: student._id,
      status: { $in: ['pending', 'approved'] },
      usedForEntry: false,
    }).sort({ createdAt: -1 });

    if (existingPending) {
      return res.status(400).json({ message: 'An active hosteller request already exists for this student.' });
    }

    const request = await HostellerRequest.create({
      student: student._id,
      hostel: hostel._id,
      warden: warden._id,
      reason,
      requestedExitTime: requestedExitTime ? new Date(requestedExitTime) : null,
      expectedReturnTime: new Date(expectedReturnTime),
    });

    const populatedRequest = await HostellerRequest.findById(request._id)
      .populate('student', 'name sapId email parentEmail parentPhone roomNumber photoUrl')
      .populate('hostel', 'name code wardenEmail wardenPhone')
      .populate('warden', 'name email phone');

    await notifyRequestSubmitted(populatedRequest);

    emitWardenNewRequest(String(warden._id), {
      studentName: populatedRequest.student.name,
      sapId: populatedRequest.student.sapId,
      hostelName: populatedRequest.hostel.name,
      hostelId: String(populatedRequest.hostel._id),
      roomNumber: populatedRequest.student.roomNumber || '',
      reason: populatedRequest.reason,
      requestedExitTime: populatedRequest.requestedExitTime,
      expectedReturnTime: populatedRequest.expectedReturnTime,
      wardenId: String(warden._id),
    });

    res.status(201).json({
      success: true,
      request: serializeRequest(populatedRequest),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/hosteller/requests
exports.getHostellerRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = buildRequestQueryForRole(req.admin);

    if (status) {
      filter.status = status;
    }

    const requests = await HostellerRequest.find(filter)
      .populate('student', 'name sapId department year roomNumber photoUrl')
      .populate('hostel', 'name code')
      .populate('warden', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      requests: requests.map(serializeRequest),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/hosteller/approve/:requestId
exports.approveHostellerRequest = async (req, res) => {
  try {
    const request = await HostellerRequest.findById(req.params.requestId)
      .populate('student', 'name sapId email parentEmail roomNumber')
      .populate('hostel', 'name code wardenEmail wardenPhone')
      .populate('warden', 'name email phone');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (req.admin.role === 'warden' && String(request.warden._id) !== String(req.admin._id)) {
      return res.status(403).json({ message: 'You can only approve requests assigned to you' });
    }

    const previousStatus = request.status;
    request.status = 'approved';
    request.approvedAt = new Date();
    request.rejectedAt = null;
    request.rejectionReason = '';
    request.accessValidUntil = await buildReturnDeadline(request.expectedReturnTime);
    await request.save();

    await notifyRequestApproved(request);

    await createAuditLog({
      admin: req.admin,
      action: `Approved hosteller request for ${request.student.name} (${request.student.sapId})`,
      entity: 'HostellerRequest',
      entityId: request._id,
      oldValue: { status: previousStatus },
      newValue: { status: 'approved', accessValidUntil: request.accessValidUntil },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      request: serializeRequest(request),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/hosteller/reject/:requestId
exports.rejectHostellerRequest = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const request = await HostellerRequest.findById(req.params.requestId)
      .populate('student', 'name sapId email parentEmail roomNumber')
      .populate('hostel', 'name code wardenEmail wardenPhone')
      .populate('warden', 'name email phone');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (req.admin.role === 'warden' && String(request.warden._id) !== String(req.admin._id)) {
      return res.status(403).json({ message: 'You can only reject requests assigned to you' });
    }

    const previousStatus = request.status;
    request.status = 'rejected';
    request.rejectedAt = new Date();
    request.approvedAt = null;
    request.rejectionReason = rejectionReason.trim();
    request.accessValidUntil = null;
    await request.save();

    await notifyRequestRejected(request);

    await createAuditLog({
      admin: req.admin,
      action: `Rejected hosteller request for ${request.student.name} (${request.student.sapId})`,
      entity: 'HostellerRequest',
      entityId: request._id,
      oldValue: { status: previousStatus },
      newValue: { status: 'rejected', rejectionReason: rejectionReason.trim() },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      request: serializeRequest(request),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/hosteller/active
exports.getActiveHostellerRequests = async (req, res) => {
  try {
    const filter = {
      ...buildRequestQueryForRole(req.admin),
      status: 'approved',
      usedForEntry: false,
    };

    const requests = await HostellerRequest.find(filter)
      .populate('student', 'name sapId department year roomNumber photoUrl')
      .populate('hostel', 'name code')
      .populate('warden', 'name email')
      .sort({ accessValidUntil: 1 });

    res.json({
      requests: requests.map(serializeRequest),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/hosteller/history/:studentId
exports.getStudentHostellerHistory = async (req, res) => {
  try {
    const filter = { student: req.params.studentId };

    if (req.admin.role === 'warden') {
      filter.warden = req.admin._id;
    }

    const requests = await HostellerRequest.find(filter)
      .populate('student', 'name sapId roomNumber')
      .populate('hostel', 'name code')
      .populate('warden', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      requests: requests.map(serializeRequest),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/hosteller/hostel/:hostelId
exports.getHostelHostellerRequests = async (req, res) => {
  try {
    const filter = { hostel: req.params.hostelId };

    if (req.admin.role === 'warden') {
      filter.warden = req.admin._id;
    }

    const requests = await HostellerRequest.find(filter)
      .populate('student', 'name sapId department year roomNumber photoUrl')
      .populate('hostel', 'name code')
      .populate('warden', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      requests: requests.map(serializeRequest),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/hosteller/public/:sapId
exports.getPublicStudentRequestStatus = async (req, res) => {
  try {
    const student = await Student.findOne({ sapId: req.params.sapId, isActive: true })
      .populate({
        path: 'hostel',
        match: { isActive: true },
        populate: { path: 'warden', select: 'name email phone' },
      });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const latestRequest = await HostellerRequest.findOne({ student: student._id })
      .populate('hostel', 'name code')
      .populate('warden', 'name email phone')
      .sort({ createdAt: -1 });

    res.json({
      student: {
        _id: student._id,
        sapId: student.sapId,
        name: student.name,
        hostel: student.hostel
          ? {
              _id: student.hostel._id,
              name: student.hostel.name,
              code: student.hostel.code,
            }
          : null,
        roomNumber: student.roomNumber || '',
        warden: student.hostel?.warden
          ? {
              _id: student.hostel.warden._id,
              name: student.hostel.warden.name,
              email: student.hostel.warden.email,
              phone: student.hostel.warden.phone,
            }
          : null,
      },
      latestRequest: latestRequest ? serializeRequest(latestRequest) : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const processExpiredApprovals = async () => {
  const now = new Date();
  const duplicateThreshold = new Date(now.getTime() - 30 * 60 * 1000);

  const requests = await HostellerRequest.find({
    status: 'approved',
    accessValidUntil: { $lt: now },
    usedForEntry: false,
    $or: [{ lastAlertSentAt: null }, { lastAlertSentAt: { $lt: duplicateThreshold } }],
  })
    .populate('student', 'name sapId email parentEmail parentPhone roomNumber')
    .populate('hostel', 'name code wardenEmail wardenPhone')
    .populate('warden', 'name email phone');

  const results = [];

  for (const request of requests) {
    const minutesLate = Math.max(
      1,
      Math.round((now.getTime() - new Date(request.accessValidUntil).getTime()) / 60000)
    );

    request.status = 'expired';
    request.lastAlertSentAt = now;
    await request.save();

    await notifyLateReturn(request, minutesLate);

    await AlertLog.create({
      type: 'late_return',
      message: `${request.student.name} is ${minutesLate} minutes overdue returning to ${request.hostel.name}`,
      metadata: {
        studentId: request.student._id,
        studentName: request.student.name,
        sapId: request.student.sapId,
        hostelId: request.hostel._id,
        hostelName: request.hostel.name,
        approvedUntil: request.accessValidUntil,
        minutesLate,
        wardenId: request.warden?._id || null,
      },
    });

    if (request.warden?._id) {
      emitWardenLateReturn(String(request.warden._id), {
        studentName: request.student.name,
        sapId: request.student.sapId,
        hostelName: request.hostel.name,
        approvedUntil: request.accessValidUntil,
        minutesLate,
        wardenId: String(request.warden._id),
      });
    }

    results.push({
      requestId: request._id,
      studentName: request.student.name,
      minutesLate,
    });
  }

  return results;
};

module.exports.processExpiredApprovals = processExpiredApprovals;
