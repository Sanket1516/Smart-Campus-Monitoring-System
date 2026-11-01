// Real MongoDB (in-memory) for bulk-enrollment tests: real schemas, real unique indexes, real auth.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bulk-test-secret';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

let server;

const start = async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'bulk_test' });
  // Build the unique indexes (sapId, zktUserID) so duplicate protection is genuinely tested.
  await Promise.all(['Student', 'Hostel', 'Admin', 'BulkEnrollment'].map((name) => require(`../../models/${name}`).init()));
};

const stop = async () => {
  await mongoose.disconnect();
  await server?.stop();
};

const clean = async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
};

const createAdmin = async (role, hostelId = null) => {
  const Admin = require('../../models/Admin');
  const admin = await Admin.create({
    username: `${role}-${new mongoose.Types.ObjectId()}`,
    password: 'password123',
    name: `Test ${role}`,
    role,
    ...(hostelId ? { hostelId } : {}),
  });
  const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { admin, token, auth: { Authorization: `Bearer ${token}` } };
};

const createHostel = (name = 'Test Hostel', code = 'TH') =>
  require('../../models/Hostel').create({ name, code, type: 'mixed', warden: new mongoose.Types.ObjectId() });

module.exports = { start, stop, clean, createAdmin, createHostel };
