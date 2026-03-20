const Student = require('../models/Student');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const { CATEGORY_ALIASES, isHosteller, normalizeCategory } = require('../utils/studentMeta');

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

// GET /api/dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const selectedDate = req.query.date || todayStr();
    const weekStart = shiftDateStr(selectedDate, -6);

    // Run all queries in parallel
    const [
      totalStudents,
      todayLogs,
      unauthorizedToday,
      last7DaysLogs,
    ] = await Promise.all([
      Student.countDocuments({ isActive: true }),
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
    ]);

    const activeStudents = await Student.find({ isActive: true })
      .select('sapId name category department year course')
      .lean();

    const totalDayScholars = activeStudents.filter(
      (student) => normalizeCategory(student.category) === 'dayscholars'
    ).length;
    const totalHostellers = activeStudents.filter(
      (student) => normalizeCategory(student.category) === 'hostellers'
    ).length;

    const studentsBySapId = new Map(activeStudents.map((student) => [student.sapId, student]));

    // Calculate today's stats
    const uniqueSapIds = new Set(todayLogs.map((l) => l.sapId));
    const enteredToday = todayLogs.filter((l) => l.entryTime).length;
    const exitedToday = todayLogs.filter((l) => l.exitTime).length;
    const currentlyInside = new Set();

    // Build currently-inside set from today's logs
    const studentLogsMap = {};
    for (const log of todayLogs) {
      if (!studentLogsMap[log.sapId]) studentLogsMap[log.sapId] = [];
      studentLogsMap[log.sapId].push(log);
    }
    const latestLogBySapId = {};
    for (const [sapId, logs] of Object.entries(studentLogsMap)) {
      const latest = logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      latestLogBySapId[sapId] = latest;
      if (latest.status === 'entered') currentlyInside.add(sapId);
    }

    // Hostellers currently outside
    const hostellerLogs = todayLogs.filter((l) => isHosteller(l.category));
    const hostellersOutside = new Set();
    const hostellerMap = {};
    for (const log of hostellerLogs) {
      if (!hostellerMap[log.sapId]) hostellerMap[log.sapId] = [];
      hostellerMap[log.sapId].push(log);
    }
    for (const [sapId, logs] of Object.entries(hostellerMap)) {
      const latest = logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (latest.status === 'exited') hostellersOutside.add(sapId);
    }

    // Late returns for selected date
    const lateReturns = todayLogs.filter((l) => l.lateReturn).length;

    // Peak entry hour
    const hourCounts = {};
    for (const log of todayLogs) {
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
    const hostellersOutsideStudents = mapStudents(
      Array.from(hostellersOutside).map((sapId) => studentsBySapId.get(sapId))
    );
    const lateReturnStudents = mapStudents(
      Array.from(
        new Set(todayLogs.filter((log) => log.lateReturn).map((log) => log.sapId))
      ).map((sapId) => studentsBySapId.get(sapId))
    );
    const totalStudentList = mapStudents(activeStudents);

    res.json({
      totalStudents,
      totalDayScholars,
      totalHostellers,
      todayStats: {
        totalScans: enteredToday + exitedToday,
        uniqueEntries: uniqueSapIds.size,
        currentlyInside: currentlyInside.size,
        enteredToday,
        exitedToday,
        unauthorizedAttempts: unauthorizedToday,
        hostellersOutside: hostellersOutside.size,
        lateReturns,
      },
      studentGroups: {
        totalStudents: totalStudentList,
        uniqueEntries: uniqueStudentsToday,
        enteredToday: enteredTodayStudents,
        exitedToday: exitedTodayStudents,
        currentlyInside: currentlyInsideStudents,
        hostellersOutside: hostellersOutsideStudents,
        lateReturns: lateReturnStudents,
      },
      peakHours: hourCounts,
      weeklyTrend,
      selectedDate,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/dashboard/hourly
exports.getHourlyDistribution = async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const logs = await EntryLog.find({ date });

    const distribution = {};
    for (let h = 0; h < 24; h++) distribution[h] = { entries: 0, exits: 0 };

    for (const log of logs) {
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
    const today = todayStr();
    const hostellers = await Student.find({
      category: { $in: CATEGORY_ALIASES.hostellers },
      isActive: true,
    });
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
