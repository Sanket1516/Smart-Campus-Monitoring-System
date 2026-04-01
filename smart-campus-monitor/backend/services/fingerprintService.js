const crypto = require('crypto');
const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');
const Student = require('../models/Student');
const TerminalConfig = require('../models/TerminalConfig');

const ZK_PORT = 4370;
const ZK_TIMEOUT = 10000;
const ZK_INPORT = 4000;

const buildKey = () =>
  crypto.createHash('sha256').update(String(process.env.FP_SECRET || 'smart-campus-fp')).digest();

const decryptTemplate = (encryptedTemplate) => {
  if (!encryptedTemplate) {
    return null;
  }

  if (Buffer.isBuffer(encryptedTemplate)) {
    return encryptedTemplate;
  }

  if (typeof encryptedTemplate !== 'string') {
    return null;
  }

  const trimmed = encryptedTemplate.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.includes(':')) {
    const [ivValue, encryptedValue] = trimmed.split(':');

    if (!ivValue || !encryptedValue) {
      return null;
    }

    const iv =
      ivValue.length === 32 ? Buffer.from(ivValue, 'hex') : Buffer.from(ivValue, 'base64');
    const encrypted =
      /^[0-9a-f]+$/i.test(encryptedValue) && encryptedValue.length % 2 === 0
        ? Buffer.from(encryptedValue, 'hex')
        : Buffer.from(encryptedValue, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-cbc', buildKey(), iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  return Buffer.from(trimmed, 'base64');
};

const createClient = (terminalIP) => new ZKLib(terminalIP, ZK_PORT, ZK_TIMEOUT, ZK_INPORT);

const withDevice = async (terminalIP, callback) => {
  if (!terminalIP) {
    throw new Error('Terminal IP is required');
  }

  const client = createClient(terminalIP);

  try {
    await client.createSocket();
    await client.disableDevice();
    return await callback(client);
  } finally {
    try {
      await client.enableDevice();
    } catch (_error) {}

    try {
      await client.disconnect();
    } catch (_error) {}
  }
};

const buildUserBuffer = ({ zktUserID, name }) => {
  const userBuffer = Buffer.alloc(72);
  const safeName = String(name || `USER ${zktUserID}`).slice(0, 24);
  const safeUserId = String(zktUserID).slice(0, 9);

  userBuffer.writeUInt16LE(Number(zktUserID), 0);
  userBuffer.writeUInt8(0, 2);
  userBuffer.write(safeName, 11, 'ascii');
  userBuffer.writeUInt32LE(0, 35);
  userBuffer.write(safeUserId, 48, 'ascii');

  return userBuffer;
};

const extractTemplatePayload = (responseBuffer) => {
  if (!responseBuffer || !Buffer.isBuffer(responseBuffer)) {
    return Buffer.alloc(0);
  }

  if (responseBuffer.length <= 8) {
    return Buffer.alloc(0);
  }

  return responseBuffer.subarray(8);
};

const ensureTemplatePayload = (zktUserID, template) => {
  const templateBuffer = Buffer.isBuffer(template) ? template : Buffer.from(template || []);

  if (!templateBuffer.length) {
    throw new Error('Template buffer is empty');
  }

  if (templateBuffer.length > 8) {
    return templateBuffer;
  }

  const payload = Buffer.alloc(8 + templateBuffer.length);
  payload.writeUInt16LE(Number(zktUserID), 0);
  payload.writeUInt8(0, 2);
  payload.writeUInt8(1, 3);
  payload.writeUInt32LE(templateBuffer.length, 4);
  templateBuffer.copy(payload, 8);
  return payload;
};

const findDeviceUser = (users, zktUserID) =>
  users.find((user) => String(user.userId) === String(zktUserID) || Number(user.uid) === Number(zktUserID));

const resolveStudentForSync = async (studentInput) => {
  if (!studentInput) {
    return null;
  }

  if (typeof studentInput === 'string' || typeof studentInput === 'number') {
    return Student.findById(studentInput).select('+fingerprintTemplate');
  }

  if (studentInput.fingerprintTemplate !== undefined) {
    return studentInput;
  }

  return Student.findById(studentInput._id || studentInput).select('+fingerprintTemplate');
};

const pullTemplateFromDevice = async (terminalIP, zktUserID) =>
  withDevice(terminalIP, async (client) => {
    const users = await client.getUsers();
    const deviceUser = findDeviceUser(users, zktUserID);

    if (!deviceUser) {
      throw new Error(`User ${zktUserID} not found on terminal ${terminalIP}`);
    }

    const requestBuffer = Buffer.alloc(3);
    requestBuffer.writeUInt16LE(Number(deviceUser.uid), 0);
    requestBuffer.writeUInt8(0, 2);

    const response = await client.executeCmd(COMMANDS.CMD_USERTEMP_RRQ, requestBuffer);
    const template = extractTemplatePayload(response);

    if (!template.length) {
      throw new Error(`Template for user ${zktUserID} was not returned by terminal ${terminalIP}`);
    }

    return template;
  });

const pushTemplateToDevice = async (terminalIP, zktUserID, name, template) =>
  withDevice(terminalIP, async (client) => {
    const users = await client.getUsers();
    let deviceUser = findDeviceUser(users, zktUserID);

    if (!deviceUser) {
      await client.executeCmd(
        COMMANDS.CMD_USER_WRQ,
        buildUserBuffer({ zktUserID: Number(zktUserID), name })
      );

      const refreshedUsers = await client.getUsers();
      deviceUser = findDeviceUser(refreshedUsers, zktUserID) || {
        uid: Number(zktUserID),
        userId: String(zktUserID),
      };
    }

    const payload = ensureTemplatePayload(deviceUser.uid, template);
    await client.executeCmd(COMMANDS.CMD_USERTEMP_WRQ, payload);

    return {
      success: true,
      terminalIP,
      zktUserID: Number(zktUserID),
    };
  });

const syncStudentToAllTerminals = async (studentInput) => {
  const student = await resolveStudentForSync(studentInput);

  if (!student || !student.fingerprintEnrolled || !student.fingerprintTemplate || !student.zktUserID) {
    return {
      success: false,
      skipped: true,
      reason: 'Student is not fingerprint enrolled',
    };
  }

  const templateBuffer = decryptTemplate(student.fingerprintTemplate);

  if (!templateBuffer?.length) {
    return {
      success: false,
      skipped: true,
      reason: 'Fingerprint template is not available',
    };
  }

  const terminals = await TerminalConfig.find({
    isEnrollmentStation: false,
    terminalIP: { $ne: '' },
  }).lean();

  const results = [];

  for (const terminal of terminals) {
    try {
      const result = await pushTemplateToDevice(
        terminal.terminalIP,
        student.zktUserID,
        student.name,
        templateBuffer
      );

      results.push({
        machineNumber: terminal.machineNumber,
        terminalIP: terminal.terminalIP,
        success: result.success,
      });
    } catch (error) {
      results.push({
        machineNumber: terminal.machineNumber,
        terminalIP: terminal.terminalIP,
        success: false,
        error: error.message,
      });
    }
  }

  return {
    success: results.some((result) => result.success),
    total: results.length,
    synced: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
};

const syncAllStudentsToNewTerminal = async (terminalIP) => {
  if (!terminalIP) {
    return { success: false, skipped: true, reason: 'Terminal IP not provided' };
  }

  const students = await Student.find({
    fingerprintEnrolled: true,
    zktUserID: { $ne: null },
  }).select('+fingerprintTemplate');

  const results = [];

  for (const student of students) {
    try {
      const templateBuffer = decryptTemplate(student.fingerprintTemplate);

      if (!templateBuffer?.length) {
        results.push({
          studentId: student._id,
          sapId: student.sapId,
          success: false,
          error: 'Fingerprint template missing',
        });
        continue;
      }

      await pushTemplateToDevice(terminalIP, student.zktUserID, student.name, templateBuffer);

      results.push({
        studentId: student._id,
        sapId: student.sapId,
        success: true,
      });
    } catch (error) {
      results.push({
        studentId: student._id,
        sapId: student.sapId,
        success: false,
        error: error.message,
      });
    }
  }

  return {
    success: results.every((result) => result.success),
    total: results.length,
    synced: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
};

module.exports = {
  pullTemplateFromDevice,
  pushTemplateToDevice,
  syncStudentToAllTerminals,
  syncAllStudentsToNewTerminal,
};
