const Student = require('../models/Student');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const HostellerRequest = require('../models/HostellerRequest');
const AlertLog = require('../models/AlertLog');
const { CATEGORY_ALIASES, isHosteller, normalizeCategory } = require('../utils/studentMeta');
const { resolveAssignedHostel } = require('../services/wardenScopeService');

const formatDateLocal = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayStr = () => formatDateLocal();
const shiftDateStr = (dateStr, offsetDays) => {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return formatDateLocal(date);
};

// GET /api/dashboard/attendance
exports.getAttendanceStatus = async (req, res) => {
  try {
    const selectedDate = req.query.date || todayStr();
    let hostelId = req.query.hostelId || '';

    if (req.admin.role === 'warden') {
      const assignedHostel = await resolveAssignedHostel(req.admin);

      if (!assignedHostel?._id) {
        return res.json({
          overallStatus: [],
          todayStatus: [],
          selectedDate,
          selectedHostelId: null,
        });
      }

      hostelId = String(assignedHostel._id);
    }

    const studentFilter = { isActive: true };
    if (hostelId) {
      studentFilter.hostel = hostelId;
    }

    const students = await Student.find(studentFilter).select('sapId name').lean();
    const sapIds = students.map((student) => student.sapId);
    const studentNameBySapId = new Map(students.map((student) => [student.sapId, student.name]));

    if (!sapIds.length) {
      return res.json({
        overallStatus: [],
        todayStatus: [],
        selectedDate,
        selectedHostelId: hostelId || null,
      });
    }

    const [latestLogsByStudent, todayLogs] = await Promise.all([
      EntryLog.aggregate([
        { $match: { sapId: { $in: sapIds } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$sapId',
            latest: { $first: '$$ROOT' },
          },
        },
      ]),
      EntryLog.find({ date: selectedDate, sapId: { $in: sapIds } }).sort({ createdAt: -1 }).lean(),
    ]);

    const overallStatus = latestLogsByStudent
      .map((row) => row.latest)
      .filter((log) => log.status === 'entered')
      .map((log) => ({
        studentName: studentNameBySapId.get(log.sapId) || log.studentName,
        studentId: log.sapId,
        lastEntryTime: log.entryTime || log.createdAt,
        currentStatus: 'IN',
        student_id: log.sapId,
        timestamp: log.entryTime || log.createdAt,
        status: 'IN',
      }))
      .sort((a, b) => new Date(b.lastEntryTime) - new Date(a.lastEntryTime));

    const todayStatus = todayLogs
      .flatMap((log) => {
        const studentName = studentNameBySapId.get(log.sapId) || log.studentName;
        const rows = [];

        if (log.entryTime) {
          rows.push({
            studentName,
            studentId: log.sapId,
            time: log.entryTime,
            status: 'IN',
            student_id: log.sapId,
            timestamp: log.entryTime,
          });
        }

        if (log.exitTime) {
          rows.push({
            studentName,
            studentId: log.sapId,
            time: log.exitTime,
            status: 'OUT',
            student_id: log.sapId,
            timestamp: log.exitTime,
          });
        }

        return rows;
      })
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    return res.json({
      overallStatus,
      todayStatus,
      selectedDate,
      selectedHostelId: hostelId || null,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const selectedDate = req.query.date || todayStr();
    let hostelId = req.query.hostelId || '';
    const weekStart = shiftDateStr(selectedDate, -6);

    let assignedHostel = null;
    if (req.admin.role === 'warden') {
      assignedHostel = await resolveAssignedHostel(req.admin);

      if (!assignedHostel?._id) {
        return res.json({
          todayStats: {
            totalScans: 0,
            uniqueEntries: 0,
            currentlyInside: 0,
            currentlyOutside: 0,
            enteredToday: 0,
            exitedToday: 0,
            unauthorizedAttempts: 0,
            blockedAttemptsToday: 0,
            hostellersOutside: 0,
            lateReturns: 0,
            activeHostellerApprovals: 0,
          },
          weeklyTrend: [],
          gateActivity: [],
          hostelMovement: [],
          recentActivity: [],
          activeApprovals: [],
        });
      }
      
      // If warden hasn't selected a specific hostel, use first assigned hostel
      if (!hostelId) {
        hostelId = String(assignedHostel._id);
      }

      if (hostelId && String(assignedHostel._id) !== hostelId) {
        return res.status(403).json({ message: 'You do not have access to this hostel' });
      }
    }

    // Build student filter based on role and hostel selection
    let studentFilter = { isActive: true };
    if (req.admin.role === 'warden') {
      studentFilter.hostel = hostelId || assignedHostel?._id || null;
    }

    // Run all queries in parallel
    const [
      activeStudentsRaw,
      todayLogs,
      unauthorizedToday,
      last7DaysLogs,
      activeApprovalsRaw,
      unauthorizedFeed,
    ] = await Promise.all([
      Student.find(studentFilter)
        .select(
          'sapId name category department year course hostel studentType isHosteller roomNumber photoUrl'
        )
        .populate('hostel', 'name code')
        .lean(),
      EntryLog.find({ date: selectedDate }),
      UnauthorizedLog.countDocuments({ date: selectedDate }),
      EntryLog.aggregate([
        {
          $match: {
            date: {
              $gte: weekStart,
              $lte: selectedDate,
            },
          },
        },
        {
          $group: {
            _id: '$date',
            entries: {
              $sum: {
                $add: [
                  { $cond: [{ $ifNull: ['$entryTime', false] }, 1, 0] },
                  { $cond: [{ $ifNull: ['$exitTime', false] }, 1, 0] },
                ],
              },
            },
            uniqueStudents: { $addToSet: '$sapId' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      HostellerRequest.find({
        status: 'approved',
        usedForEntry: false,
      })
        .populate('student', 'sapId name')
        .populate('hostel', 'name code')
        .lean(),
      UnauthorizedLog.find({ date: selectedDate }).sort({ timestamp: -1 }).limit(50).lean(),
    ]);

    const activeStudents = activeStudentsRaw;
    const filteredStudents = hostelId
      ? activeStudents.filter((student) => String(student.hostel?._id || '') === hostelId)
      : activeStudents;
    const filteredSapIds = new Set(filteredStudents.map((student) => student.sapId));
    const filteredTodayLogs = hostelId
      ? todayLogs.filter((log) => filteredSapIds.has(log.sapId))
      : todayLogs;

    const totalDayScholars = filteredStudents.filter(
      (student) => normalizeCategory(student.category) === 'dayscholars'
    ).length;
    const totalHostellers = filteredStudents.filter(
      (student) => normalizeCategory(student.category) === 'hostellers'
    ).length;

    const studentsBySapId = new Map(activeStudents.map((student) => [student.sapId, student]));

    // Calculate today's stats
    const uniqueSapIds = new Set(filteredTodayLogs.map((l) => l.sapId));
    const enteredToday = filteredTodayLogs.filter((l) => l.entryTime).length;
    const exitedToday = filteredTodayLogs.filter((l) => l.exitTime).length;
    const currentlyInside = new Set();
    const currentlyOutside = new Set();
    const latestLogBySapId = {};

    // Build live occupancy from latest log per student, regardless of date.
    const filteredSapIdList = Array.from(filteredSapIds);
    const latestLogsByStudent = filteredSapIdList.length
      ? await EntryLog.aggregate([
          { $match: { sapId: { $in: filteredSapIdList } } },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: '$sapId',
              latest: { $first: '$$ROOT' },
            },
          },
        ])
      : [];

    for (const row of latestLogsByStudent) {
      const latest = row.latest;
      latestLogBySapId[row._id] = latest;
      if (latest?.status === 'entered') {
        currentlyInside.add(row._id);
      }
    }

    for (const student of filteredStudents) {
      if (!currentlyInside.has(student.sapId)) {
        currentlyOutside.add(student.sapId);
      }
    }

    // Hostellers currently outside (live occupancy, non-resetting)
    const hostellersOutside = new Set();
    for (const student of filteredStudents) {
      if (!isHosteller(student.category)) continue;
      if (!currentlyInside.has(student.sapId)) {
        hostellersOutside.add(student.sapId);
      }
    }

    // Late returns for selected date
    const lateReturns = filteredTodayLogs.filter((l) => l.lateReturn).length;

    // Peak entry hour
    const hourCounts = {};
    for (const log of filteredTodayLogs) {
      if (log.entryTime) {
        const hour = new Date(log.entryTime).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    }

    // 7-day trend
    const trendByDate = new Map(
      last7DaysLogs.map((d) => [
        d._id,
        {
          entries: d.entries,
          uniqueStudents: d.uniqueStudents.length,
        },
      ])
    );
    const weeklyTrend = Array.from({ length: 7 }, (_, index) => {
      const date = shiftDateStr(weekStart, index);
      const metrics = trendByDate.get(date) || { entries: 0, uniqueStudents: 0 };
      return {
        date,
        entries: metrics.entries,
        uniqueStudents: metrics.uniqueStudents,
      };
    });

    const mapStudents = (students) =>
      students
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((student) => ({
          sapId: student.sapId,
          name: student.name,
          category: student.category,
          department: student.department,
          year: student.year,
          course: student.course,
          latestStatus: latestLogBySapId[student.sapId]?.status || 'no_activity',
          lastScan: latestLogBySapId[student.sapId]?.createdAt || null,
          lateReturn: Boolean(latestLogBySapId[student.sapId]?.lateReturn),
        }));

    const uniqueStudentsToday = mapStudents(
      Array.from(uniqueSapIds).map((sapId) => studentsBySapId.get(sapId))
    );
    const enteredTodayStudents = mapStudents(
      Array.from(
        new Set(todayLogs.filter((log) => log.entryTime).map((log) => log.sapId))
      ).map((sapId) => studentsBySapId.get(sapId))
    );
    const exitedTodayStudents = mapStudents(
      Array.from(
        new Set(todayLogs.filter((log) => log.exitTime).map((log) => log.sapId))
      ).map((sapId) => studentsBySapId.get(sapId))
    );
    const currentlyInsideStudents = mapStudents(
      Array.from(currentlyInside).map((sapId) => studentsBySapId.get(sapId))
    );
    const currentlyOutsideStudents = mapStudents(
      Array.from(currentlyOutside).map((sapId) => studentsBySapId.get(sapId))
    );
    const hostellersOutsideStudents = mapStudents(
      Array.from(hostellersOutside).map((sapId) => studentsBySapId.get(sapId))
    );
    const lateReturnStudents = mapStudents(
      Array.from(
        new Set(filteredTodayLogs.filter((log) => log.lateReturn).map((log) => log.sapId))
      ).map((sapId) => studentsBySapId.get(sapId))
    );
    const totalStudentList = mapStudents(filteredStudents);

    const activeApprovals = hostelId
      ? activeApprovalsRaw.filter((request) => String(request.hostel?._id || '') === hostelId)
      : activeApprovalsRaw;
    const filteredStudentIds = filteredStudents.map((student) => student._id);
    const blockedAttemptsToday = filteredStudentIds.length
      ? await AlertLog.countDocuments({
          type: 'blocked',
          timestamp: {
            $gte: new Date(`${selectedDate}T00:00:00`),
            $lt: new Date(`${shiftDateStr(selectedDate, 1)}T00:00:00`),
          },
          'metadata.studentId': { $in: filteredStudentIds },
        })
      : 0;

    const gateActivityMap = {};
    for (const log of filteredTodayLogs) {
      const gateKey = log.gateName || 'Unknown Gate';
      if (!gateActivityMap[gateKey]) {
        gateActivityMap[gateKey] = { gateName: gateKey, entries: 0, exits: 0, unauthorized: 0 };
      }
      if (log.entryTime) gateActivityMap[gateKey].entries += 1;
      if (log.exitTime) gateActivityMap[gateKey].exits += 1;
    }

    if (!hostelId) {
      for (const log of unauthorizedFeed) {
        const gateKey = log.gateName || 'Unknown Gate';
        if (!gateActivityMap[gateKey]) {
          gateActivityMap[gateKey] = { gateName: gateKey, entries: 0, exits: 0, unauthorized: 0 };
        }
        gateActivityMap[gateKey].unauthorized += 1;
      }
    }

    const hostelMovementMap = {};
    for (const student of activeStudents) {
      const key = student.hostel?._id ? String(student.hostel._id) : 'unassigned';
      if (!hostelMovementMap[key]) {
        hostelMovementMap[key] = {
          hostelId: student.hostel?._id || null,
          hostelName: student.hostel?.name || 'Unassigned',
          entries: 0,
          exits: 0,
          inside: 0,
          outside: 0,
          late: 0,
          approved: 0,
        };
      }
    }

    for (const log of todayLogs) {
      const student = studentsBySapId.get(log.sapId);
      const key = student?.hostel?._id ? String(student.hostel._id) : 'unassigned';
      if (!hostelMovementMap[key]) continue;
      if (log.entryTime) hostelMovementMap[key].entries += 1;
      if (log.exitTime) hostelMovementMap[key].exits += 1;
    }

    for (const sapId of currentlyInside) {
      const student = studentsBySapId.get(sapId);
      const key = student?.hostel?._id ? String(student.hostel._id) : 'unassigned';
      if (hostelMovementMap[key]) hostelMovementMap[key].inside += 1;
    }

    for (const sapId of currentlyOutside) {
      const student = studentsBySapId.get(sapId);
      const key = student?.hostel?._id ? String(student.hostel._id) : 'unassigned';
      if (hostelMovementMap[key]) hostelMovementMap[key].outside += 1;
    }

    for (const sapId of new Set(filteredTodayLogs.filter((log) => log.lateReturn).map((log) => log.sapId))) {
      const student = studentsBySapId.get(sapId);
      const key = student?.hostel?._id ? String(student.hostel._id) : 'unassigned';
      if (hostelMovementMap[key]) hostelMovementMap[key].late += 1;
    }

    for (const request of activeApprovalsRaw) {
      const key = request.hostel?._id ? String(request.hostel._id) : 'unassigned';
      if (hostelMovementMap[key]) hostelMovementMap[key].approved += 1;
    }

    const hostelMetrics = hostelId
      ? hostelMovementMap[hostelId] || {
          hostelId,
          hostelName: filteredStudents[0]?.hostel?.name || 'Selected Hostel',
          inside: 0,
          outside: 0,
          late: 0,
          approved: 0,
          entries: 0,
          exits: 0,
        }
      : null;

    const liveActivity = [
      ...filteredTodayLogs.flatMap((log) => {
        const base = {
          id: `${log._id}-entry`,
          type: log.exitTime ? 'exit' : 'entry',
          studentName: log.studentName,
          sapId: log.sapId,
          gateName: log.gateName,
          gateNumber: log.gateNumber,
          terminalNumber: log.terminalNumber,
          terminalLabel: log.terminalLabel,
          machineNumber: log.machineNumber,
          time: log.exitTime || log.entryTime || log.createdAt,
          eventType: 'authorized',
          hostelName: studentsBySapId.get(log.sapId)?.hostel?.name || '',
        };

        if (log.entryTime && log.exitTime) {
          return [
            { ...base, id: `${log._id}-entry`, type: 'entry', time: log.entryTime },
            { ...base, id: `${log._id}-exit`, type: 'exit', time: log.exitTime },
          ];
        }

        return [base];
      }),
      ...(!hostelId
        ? unauthorizedFeed.map((log) => ({
            id: `unauth-${log._id}`,
            type: 'unauthorized',
            eventType: 'unauthorized',
            gateName: log.gateName,
            gateNumber: log.gateNumber,
            terminalNumber: log.terminalNumber,
            terminalLabel: log.terminalLabel,
            machineNumber: log.machineNumber,
            time: log.timestamp || log.createdAt,
          }))
        : []),
    ]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 50);

    res.json({
      totalStudents: filteredStudents.length,
      totalDayScholars,
      totalHostellers,
      todayStats: {
        totalScans: enteredToday + exitedToday,
        uniqueEntries: uniqueSapIds.size,
        currentlyInside: currentlyInside.size,
        currentlyOutside: currentlyOutside.size,
        enteredToday,
        exitedToday,
        unauthorizedAttempts: req.admin.role === 'warden' ? 0 : unauthorizedToday,
        blockedAttemptsToday,
        hostellersOutside: hostellersOutside.size,
        lateReturns,
        activeHostellerApprovals: activeApprovals.length,
      },
      studentGroups: {
        totalStudents: totalStudentList,
        uniqueEntries: uniqueStudentsToday,
        enteredToday: enteredTodayStudents,
        exitedToday: exitedTodayStudents,
        currentlyInside: currentlyInsideStudents,
        currentlyOutside: currentlyOutsideStudents,
        hostellersOutside: hostellersOutsideStudents,
        lateReturns: lateReturnStudents,
      },
      peakHours: hourCounts,
      weeklyTrend,
      gateActivity: Object.values(gateActivityMap),
      hostelMovement: Object.values(hostelMovementMap)
        .filter((row) => !hostelId || String(row.hostelId || '') === hostelId)
        .sort((a, b) => a.hostelName.localeCompare(b.hostelName)),
      hostelMetrics,
      liveActivity,
      selectedDate,
      selectedHostelId: hostelId || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/dashboard/hourly
exports.getHourlyDistribution = async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    let hostelId = req.query.hostelId || '';

    if (req.admin.role === 'warden') {
      const assignedHostel = await resolveAssignedHostel(req.admin);

      if (!assignedHostel?._id) {
        return res.json({});
      }

      hostelId = String(assignedHostel._id);
    }

    const logs = await EntryLog.find({ date });

    let filteredLogs = logs;
    if (hostelId) {
      const students = await Student.find({ isActive: true, hostel: hostelId }).select('sapId').lean();
      const sapIds = new Set(students.map((student) => student.sapId));
      filteredLogs = logs.filter((log) => sapIds.has(log.sapId));
    }

    const distribution = {};
    for (let h = 0; h < 24; h++) distribution[h] = { entries: 0, exits: 0 };

    for (const log of filteredLogs) {
      if (log.entryTime) {
        const h = new Date(log.entryTime).getHours();
        distribution[h].entries++;
      }
      if (log.exitTime) {
        const h = new Date(log.exitTime).getHours();
        distribution[h].exits++;
      }
    }

    res.json(distribution);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/dashboard/hostellers
exports.getHostellerStatus = async (req, res) => {
  try {
    const studentFilter = {
      category: { $in: CATEGORY_ALIASES.hostellers },
      isActive: true,
    };

    if (req.admin.role === 'warden') {
      const assignedHostel = await resolveAssignedHostel(req.admin);

      if (!assignedHostel?._id) {
        return res.json([]);
      }

      studentFilter.hostel = assignedHostel._id;
    }

    const today = todayStr();
    const hostellers = await Student.find(studentFilter);
    const logs = await EntryLog.find({
      date: today,
      category: { $in: CATEGORY_ALIASES.hostellers },
    });

    const logMap = {};
    for (const log of logs) {
      if (!logMap[log.sapId]) logMap[log.sapId] = [];
      logMap[log.sapId].push(log);
    }

    const status = hostellers.map((h) => {
      const studentLogs = logMap[h.sapId] || [];
      const latest = studentLogs.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )[0];

      return {
        sapId: h.sapId,
        name: h.name,
        department: h.department,
        year: h.year,
        status: latest ? latest.status : 'no_activity',
        lastScan: latest ? latest.createdAt : null,
        lateReturn: latest ? latest.lateReturn : false,
      };
    });

    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
