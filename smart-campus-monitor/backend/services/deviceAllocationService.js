const DeviceAllocation = require('../models/DeviceAllocation');
const TerminalConfig = require('../models/TerminalConfig');

const DEFAULT_DEVICE_CAPACITY = 10000;
const MAX_ALLOCATION_RETRIES = 10;

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isMainGateTerminal = (terminal) => {
  if (!terminal || terminal.isEnrollmentStation) {
    return false;
  }

  if (terminal.terminalType === 'MAIN_GATE') {
    return true;
  }

  const searchableText = [
    terminal.gateName,
    terminal.terminalLabel,
    terminal.location,
    terminal.deviceName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes('main gate');
};

const isHostelTerminal = (terminal) => terminal && !terminal.isEnrollmentStation && terminal.terminalType === 'HOSTEL';

const getDeviceCapacity = (terminal) => {
  const configuredCapacity = Number(terminal?.maxLocalUsers);
  return configuredCapacity > 0 ? configuredCapacity : DEFAULT_DEVICE_CAPACITY;
};

const findSmallestAvailableId = (sortedIds, maxCapacity) => {
  let candidate = 1;

  for (const value of sortedIds) {
    if (value < candidate) {
      continue;
    }

    if (value === candidate) {
      candidate += 1;
      continue;
    }

    break;
  }

  if (candidate > maxCapacity) {
    const error = new Error(`Device is full. Maximum capacity of ${maxCapacity} users reached`);
    error.statusCode = 409;
    throw error;
  }

  return candidate;
};

const isDuplicateKeyError = (error) => Number(error?.code) === 11000;

const buildAllocationResponse = (allocation) => ({
  _id: allocation._id,
  studentId: allocation.studentId,
  deviceId: allocation.deviceId?._id || allocation.deviceId,
  localUserId: allocation.localUserId,
  device: allocation.deviceId
    ? {
        _id: allocation.deviceId._id,
        machineNumber: allocation.deviceId.machineNumber,
        terminalType: allocation.deviceId.terminalType,
        terminalLabel: allocation.deviceId.terminalLabel,
        gateName: allocation.deviceId.gateName,
        hostel: allocation.deviceId.hostel || null,
        maxLocalUsers: allocation.deviceId.maxLocalUsers,
      }
    : null,
});

const loadAllocationsForStudent = async (studentId) =>
  DeviceAllocation.find({ studentId })
    .populate('deviceId', 'machineNumber terminalType terminalLabel gateName hostel maxLocalUsers')
    .sort({ createdAt: 1 });

const resolveMainGateDevice = async () => {
  const explicitMainGateDevices = await TerminalConfig.find({
    isEnrollmentStation: false,
    terminalType: 'MAIN_GATE',
  }).lean();

  if (explicitMainGateDevices.length > 1) {
    const error = new Error('Multiple MAIN_GATE terminals are configured. Please keep only one main gate device');
    error.statusCode = 409;
    throw error;
  }

  if (explicitMainGateDevices.length === 1) {
    return explicitMainGateDevices[0];
  }

  const fallbackCandidates = await TerminalConfig.find({
    isEnrollmentStation: false,
    $or: [
      { gateName: /main gate/i },
      { terminalLabel: /main gate/i },
      { location: /main gate/i },
      { deviceName: /main gate/i },
    ],
  }).lean();

  if (fallbackCandidates.length > 1) {
    const error = new Error(
      'Unable to determine a unique main gate terminal. Set terminalType=MAIN_GATE on the correct device'
    );
    error.statusCode = 409;
    throw error;
  }

  if (!fallbackCandidates.length) {
    const error = new Error(
      'Main gate terminal is not configured. Add a terminal with terminalType=MAIN_GATE'
    );
    error.statusCode = 400;
    throw error;
  }

  return fallbackCandidates[0];
};

const resolveHostelDevice = async (hostel) => {
  if (!hostel?._id) {
    const error = new Error('Hostel information is required to resolve the hostel terminal');
    error.statusCode = 400;
    throw error;
  }

  const explicitHostelDevices = await TerminalConfig.find({
    isEnrollmentStation: false,
    terminalType: 'HOSTEL',
    hostel: hostel._id,
  }).lean();

  if (explicitHostelDevices.length > 1) {
    const error = new Error(
      `Multiple hostel terminals are configured for ${hostel.name}. Keep only one terminal per hostel`
    );
    error.statusCode = 409;
    throw error;
  }

  if (explicitHostelDevices.length === 1) {
    return explicitHostelDevices[0];
  }

  const searchPatterns = [hostel.name, hostel.code].filter(Boolean).map(escapeRegex);

  if (!searchPatterns.length) {
    const error = new Error(
      `Hostel terminal for ${hostel.name || 'the selected hostel'} is not configured`
    );
    error.statusCode = 400;
    throw error;
  }

  const fallbackCandidates = await TerminalConfig.find({
    isEnrollmentStation: false,
    $or: searchPatterns.flatMap((pattern) => [
      { gateName: { $regex: pattern, $options: 'i' } },
      { terminalLabel: { $regex: pattern, $options: 'i' } },
      { location: { $regex: pattern, $options: 'i' } },
      { deviceName: { $regex: pattern, $options: 'i' } },
    ]),
  }).lean();

  if (fallbackCandidates.length > 1) {
    const error = new Error(
      `Unable to determine a unique hostel terminal for ${hostel.name}. Set terminalType=HOSTEL and hostel on the terminal`
    );
    error.statusCode = 409;
    throw error;
  }

  if (!fallbackCandidates.length) {
    const error = new Error(
      `Hostel terminal for ${hostel.name} is not configured. Add a terminal with terminalType=HOSTEL and link it to the hostel`
    );
    error.statusCode = 400;
    throw error;
  }

  return fallbackCandidates[0];
};

const resolveRequiredDevices = async (student) => {
  const devices = [await resolveMainGateDevice()];

  const isHosteller =
    student?.studentType === 'hosteller' ||
    student?.isHosteller === true ||
    student?.category === 'hostellers' ||
    student?.category === 'hosteller';

  if (isHosteller) {
    devices.push(await resolveHostelDevice(student.hostel));
  }

  return devices;
};

const allocateLocalUserId = async (studentId, device) => {
  const existingAllocation = await DeviceAllocation.findOne({
    studentId,
    deviceId: device._id,
  })
    .populate('deviceId', 'machineNumber terminalType terminalLabel gateName hostel maxLocalUsers')
    .lean();

  if (existingAllocation) {
    return { allocation: existingAllocation, created: false };
  }

  const capacity = getDeviceCapacity(device);

  for (let attempt = 0; attempt < MAX_ALLOCATION_RETRIES; attempt += 1) {
    const usedIds = await DeviceAllocation.find({ deviceId: device._id })
      .sort({ localUserId: 1 })
      .select('localUserId -_id')
      .lean();

    const nextLocalUserId = findSmallestAvailableId(
      usedIds.map((entry) => Number(entry.localUserId)),
      capacity
    );

    try {
      const allocation = await DeviceAllocation.create({
        studentId,
        deviceId: device._id,
        localUserId: nextLocalUserId,
      });

      const populatedAllocation = await DeviceAllocation.findById(allocation._id)
        .populate('deviceId', 'machineNumber terminalType terminalLabel gateName hostel maxLocalUsers')
        .lean();

      return { allocation: populatedAllocation, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const studentAllocation = await DeviceAllocation.findOne({
        studentId,
        deviceId: device._id,
      })
        .populate('deviceId', 'machineNumber terminalType terminalLabel gateName hostel maxLocalUsers')
        .lean();

      if (studentAllocation) {
        return { allocation: studentAllocation, created: false };
      }
    }
  }

  const error = new Error(`Unable to allocate a local user ID for ${device.terminalLabel}`);
  error.statusCode = 409;
  throw error;
};

const reconcileStudentDeviceAllocations = async (student) => {
  const requiredDevices = await resolveRequiredDevices(student);
  const requiredDeviceIds = new Set(requiredDevices.map((device) => String(device._id)));
  const existingAllocations = await loadAllocationsForStudent(student._id);
  const createdAllocationIds = [];

  try {
    for (const device of requiredDevices) {
      const { allocation, created } = await allocateLocalUserId(student._id, device);

      if (created) {
        createdAllocationIds.push(String(allocation._id));
      }
    }
  } catch (error) {
    if (createdAllocationIds.length) {
      await DeviceAllocation.deleteMany({ _id: { $in: createdAllocationIds } });
    }

    throw error;
  }

  const removableAllocations = existingAllocations.filter(
    (allocation) => !requiredDeviceIds.has(String(allocation.deviceId?._id || allocation.deviceId))
  );

  if (removableAllocations.length) {
    await DeviceAllocation.deleteMany({
      _id: { $in: removableAllocations.map((allocation) => allocation._id) },
    });
  }

  const allocations = await loadAllocationsForStudent(student._id);

  return {
    allocations: allocations.map(buildAllocationResponse),
    removedAllocations: removableAllocations.map(buildAllocationResponse),
  };
};

const getStudentAllocations = async (studentId) => {
  const allocations = await loadAllocationsForStudent(studentId);
  return allocations.map(buildAllocationResponse);
};

module.exports = {
  DEFAULT_DEVICE_CAPACITY,
  buildAllocationResponse,
  getDeviceCapacity,
  getStudentAllocations,
  isHostelTerminal,
  isMainGateTerminal,
  reconcileStudentDeviceAllocations,
  resolveMainGateDevice,
  resolveRequiredDevices,
};
