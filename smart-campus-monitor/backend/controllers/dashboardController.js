const Student = require('../models/Student');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');

const todayStr = () => new Date().toISOString().split('T')[0];

// GET /api/dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const today = todayStr();

    // Run all queries in parallel
    const [
      totalStudents,
      totalDayScholars,
      totalHostellers,
      todayLogs,
      unauthorizedToday,
      last7DaysLogs,
    ] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      Student.countDocuments({ isActive: true, category: 'day_scholar' }),
      Student.countDocuments({ isActive: true, category: 'hosteller' }),
      EntryLog.find({ date: today }),
      UnauthorizedLog.countDocuments({ date: today }),
      EntryLog.aggregate([
        {
          $match: {
            date: {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
            },
          },
        },
        {
          $group: {
            _id: '$date',
            entries: { $sum: 1 },
            uniqueStudents: { $addToSet: '$sapId' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Calculate today's stats
    const uniqueSapIds = new Set(todayLogs.map((l) => l.sapId));
    const enteredToday = todayLogs.filter((l) => l.status === 'entered').length;
    const exitedToday = todayLogs.filter((l) => l.status === 'exited').length;
    const currentlyInside = new Set();

    // Build currently-inside set from today's logs
    const studentLogsMap = {};
    for (const log of todayLogs) {
      if (!studentLogsMap[log.sapId]) studentLogsMap[log.sapId] = [];
      studentLogsMap[log.sapId].push(log);
    }
    for (const [sapId, logs] of Object.entries(studentLogsMap)) {
      const latest = logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (latest.status === 'entered') currentlyInside.add(sapId);
    }

    // Hostellers currently outside
    const hostellerLogs = todayLogs.filter((l) => l.category === 'hosteller');
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

    // Late returns today
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
    const weeklyTrend = last7DaysLogs.map((d) => ({
      date: d._id,
      entries: d.entries,
      uniqueStudents: d.uniqueStudents.length,
    }));

    res.json({
      totalStudents,
      totalDayScholars,
      totalHostellers,
      todayStats: {
        totalScans: todayLogs.length,
        uniqueEntries: uniqueSapIds.size,
        currentlyInside: currentlyInside.size,
        enteredToday,
        exitedToday,
        unauthorizedAttempts: unauthorizedToday,
        hostellersOutside: hostellersOutside.size,
        lateReturns,
      },
      peakHours: hourCounts,
      weeklyTrend,
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
    const hostellers = await Student.find({ category: 'hosteller', isActive: true });
    const logs = await EntryLog.find({ date: today, category: 'hosteller' });

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
