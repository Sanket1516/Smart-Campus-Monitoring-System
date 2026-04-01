const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const TerminalConfig = require('../models/TerminalConfig');
const AlertLog = require('../models/AlertLog');
const SystemConfig = require('../models/SystemConfig');
const Student = require('../models/Student');
const { isHosteller } = require('../utils/studentMeta');

const formatDateLocal = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateStr = (dateStr, offsetDays) => {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return formatDateLocal(date);
};

const todayStr = () => formatDateLocal();

const hourlyDistributionFromLogs = (logs) => {
  const distribution = {};
  for (let hour = 0; hour < 24; hour += 1) {
    distribution[hour] = { entries: 0, exits: 0 };
  }

  for (const log of logs) {
    if (log.entryTime) {
      distribution[new Date(log.entryTime).getHours()].entries += 1;
    }
    if (log.exitTime) {
      distribution[new Date(log.exitTime).getHours()].exits += 1;
    }
  }

  return distribution;
};

const getConfigCandidate = (configs, predicate) =>
  configs.find((config) => predicate(String(config.key || '').toLowerCase(), config.value));

const getCollegeBranding = (configs) => {
  const nameConfig =
    getConfigCandidate(
      configs,
      (key) =>
        key === 'collegename' ||
        key === 'college_name' ||
        key === 'college.name' ||
        key === 'system.collegename' ||
        key === 'system.college_name'
    ) ||
    getConfigCandidate(
      configs,
      (_key, value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value.collegeName === 'string'
    );

  const logoConfig =
    getConfigCandidate(
      configs,
      (key) =>
        key === 'collegelogo' ||
        key === 'college_logo' ||
        key === 'college.logo' ||
        key === 'logo' ||
        key === 'logo_url' ||
        key === 'system.collegelogo' ||
        key === 'system.college_logo'
    ) ||
    getConfigCandidate(
      configs,
      (_key, value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (typeof value.collegeLogo === 'string' || typeof value.logo === 'string')
    );

  return {
    collegeName:
      (nameConfig &&
        (typeof nameConfig.value === 'string'
          ? nameConfig.value
          : nameConfig.value?.collegeName || nameConfig.value?.name)) ||
      'Campus Live Dashboard',
    collegeLogo:
      (logoConfig &&
        (typeof logoConfig.value === 'string'
          ? logoConfig.value
          : logoConfig.value?.collegeLogo || logoConfig.value?.logo || logoConfig.value?.url)) ||
      '',
  };
};

exports.getPublicLiveDashboard = async (_req, res) => {
  try {
    const selectedDate = todayStr();
    const tomorrow = shiftDateStr(selectedDate, 1);

    const [configs, todayLogs, unauthorizedToday, blockedToday, terminals, activeStudents] =
      await Promise.all([
        SystemConfig.find({}).lean(),
        EntryLog.find({ date: selectedDate }).sort({ createdAt: -1 }).lean(),
        UnauthorizedLog.find({ date: selectedDate }).sort({ timestamp: -1 }).lean(),
        AlertLog.countDocuments({
          type: 'blocked',
          timestamp: {
            $gte: new Date(`${selectedDate}T00:00:00`),
            $lt: new Date(`${tomorrow}T00:00:00`),
          },
        }),
        TerminalConfig.find({ isEnrollmentStation: false })
          .sort({ gateNumber: 1, terminalNumber: 1 })
          .lean(),
        Student.find({ isActive: true })
          .select('sapId hostel')
          .populate('hostel', 'name')
          .lean(),
      ]);

    const branding = getCollegeBranding(configs);
    const studentsBySapId = new Map(activeStudents.map((student) => [student.sapId, student]));
    const logsBySapId = new Map();

    for (const log of todayLogs) {
      if (!logsBySapId.has(log.sapId)) {
        logsBySapId.set(log.sapId, []);
      }
      logsBySapId.get(log.sapId).push(log);
    }

    const currentlyInside = new Set();
    const hostelOutsideCountsMap = {};

    for (const [sapId, logs] of logsBySapId.entries()) {
      const latest = [...logs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      const student = studentsBySapId.get(sapId);
      if (latest?.status === 'entered') {
        currentlyInside.add(sapId);
      }

      if (student?.hostel?.name && latest?.status === 'exited' && isHosteller(latest.category)) {
        hostelOutsideCountsMap[student.hostel.name] =
          (hostelOutsideCountsMap[student.hostel.name] || 0) + 1;
      }
    }
    const liveActivity = [
      ...todayLogs.flatMap((log) => {
        const makeItem = (type, time) => ({
          id: `${log._id}-${type}-${new Date(time || log.createdAt).getTime()}`,
          eventType: type,
          gateName: log.gateName,
          gateNumber: log.gateNumber,
          terminalNumber: log.terminalNumber,
          terminalLabel: log.terminalLabel,
          machineNumber: log.machineNumber,
          time: time || log.createdAt,
        });

        if (log.entryTime && log.exitTime) {
          return [makeItem('entry', log.entryTime), makeItem('exit', log.exitTime)];
        }

        return [makeItem(log.exitTime ? 'exit' : 'entry', log.exitTime || log.entryTime || log.createdAt)];
      }),
      ...unauthorizedToday.map((log) => ({
        id: `unauthorized-${log._id}`,
        eventType: 'unauthorized',
        gateName: log.gateName,
        gateNumber: log.gateNumber,
        terminalNumber: log.terminalNumber,
        terminalLabel: log.terminalLabel,
        machineNumber: log.machineNumber,
        time: log.timestamp || log.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 20);

    res.json({
      collegeName: branding.collegeName,
      collegeLogo: branding.collegeLogo,
      currentlyInside: currentlyInside.size,
      blockedCount: blockedToday,
      unauthorizedCount: unauthorizedToday.length,
      terminals: terminals.map((terminal) => ({
        machineNumber: terminal.machineNumber,
        deviceSN: terminal.deviceSN,
        gateName: terminal.gateName,
        gateNumber: terminal.gateNumber,
        terminalNumber: terminal.terminalNumber,
        terminalLabel: terminal.terminalLabel,
        isOnline: Boolean(terminal.isOnline),
        lastSeen: terminal.lastSeen,
        scansToday: terminal.scansToday || 0,
      })),
      hourly: hourlyDistributionFromLogs(todayLogs),
      hostelOutsideCounts: Object.entries(hostelOutsideCountsMap)
        .map(([hostelName, count]) => ({ hostelName, count }))
        .sort((a, b) => a.hostelName.localeCompare(b.hostelName)),
      liveActivity,
      date: selectedDate,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load public live dashboard' });
  }
};
