const Student = require('../models/Student');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const { notifyParent } = require('../services/notification');

// Helper: get today's date string
const todayStr = () => new Date().toISOString().split('T')[0];

// POST /api/scan
exports.processScan = async (req, res) => {
  try {
    const { sapId } = req.body;

    if (!sapId) {
      return res.status(400).json({ message: 'SAP ID is required' });
    }

    const student = await Student.findOne({ sapId, isActive: true });

    // Unauthorized scan
    if (!student) {
      await UnauthorizedLog.create({
        scannedValue: sapId,
        date: todayStr(),
      });

      return res.status(404).json({
        authorized: false,
        message: 'UNAUTHORIZED: SAP ID not found in database',
        scannedValue: sapId,
      });
    }

    const today = todayStr();
    const now = new Date();

    // Find today's log for this student
    let log = await EntryLog.findOne({ sapId, date: today });

    let action;

    if (!log) {
      // No entry for today → mark ENTRY
      log = await EntryLog.create({
        sapId,
        studentName: student.name,
        category: student.category,
        date: today,
        entryTime: now,
        status: 'entered',
      });
      action = 'entry';
    } else if (log.status === 'entered') {
      // Already entered → mark EXIT
      log.exitTime = now;
      log.status = 'exited';

      // Check late return for hostellers
      if (student.category === 'hosteller') {
        const curfewHour = Number(process.env.CURFEW_HOUR) || 22;
        if (now.getHours() >= curfewHour) {
          log.lateReturn = true;
        }
      }

      await log.save();
      action = 'exit';
    } else {
      // Already exited → new entry (re-entry)
      log = await EntryLog.create({
        sapId,
        studentName: student.name,
        category: student.category,
        date: today,
        entryTime: now,
        status: 'entered',
      });
      action = 'entry';
    }

    // Send parent notification (fire and forget)
    notifyParent(student, action, now).catch((err) =>
      console.error('Notification error:', err.message)
    );

    res.json({
      authorized: true,
      action,
      student: {
        sapId: student.sapId,
        name: student.name,
        category: student.category,
        department: student.department,
        year: student.year,
        photoUrl: student.photoUrl,
      },
      log: {
        entryTime: log.entryTime,
        exitTime: log.exitTime,
        status: log.status,
        lateReturn: log.lateReturn,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
