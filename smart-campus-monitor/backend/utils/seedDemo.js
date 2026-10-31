/**
 * Demo seed (idempotent): staff accounts for every role, the demo student roster, and parent/student
 * emails routed to demo inboxes. Students NOT in KEEP_SAP_IDS / DEMO_STUDENTS are removed.
 * Writes ../demo/demo-credentials.json (gitignored) for the Word doc generator.
 *
 * Usage:  npm run demo
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Hostel = require('../models/Hostel');
const EntryLog = require('../models/EntryLog');
const {
  getSystemConfig,
  upsertSystemConfig,
  DEFAULT_CONFIGS,
} = require('../services/configService');

const DEMO_INBOXES = [
  'sanketmali1516@gmail.com',
  'sanketmali0909@gmail.com',
  'sm9902087@gmail.com',
  'btechcs23to27@gmail.com',
];

// Students from the original seed that stay in the demo.
const KEEP_SAP_IDS = [
  '70552300067', '70552000002', '70552000003', '70552000007', // day scholars
  '70552000008', '70552000009', '70552000010', // boys hostel
  '70552000011', '70552000012', '70552000013', // girls hostel
];

// Students added for the demo. gender picks the hostel (m -> BHA, f -> GHB).
const DEMO_STUDENTS = [
  { sapId: '70552000101', name: 'Neha Kapoor', gender: 'f', category: 'dayscholars', course: 'pharmacy', department: 'bpharm', year: 3, phone: '9820011101', parentPhone: '9820022101', address: 'Dadar, Mumbai, Maharashtra 400014', bloodGroup: 'B+' },
  { sapId: '70552000102', name: 'Siddharth Rao', gender: 'm', category: 'dayscholars', course: 'engineering', department: 'computer engineering', year: 4, phone: '9820011102', parentPhone: '9820022102', address: 'Powai, Mumbai, Maharashtra 400076', bloodGroup: 'A+' },
  { sapId: '70552000103', name: 'Kabir Malhotra', gender: 'm', category: 'hostellers', course: 'engineering', department: 'computer science', year: 3, phone: '9820011103', parentPhone: '9820022103', address: 'Nashik, Maharashtra 422001', bloodGroup: 'O+', room: '112' },
  { sapId: '70552000104', name: 'Omkar Patil', gender: 'm', category: 'hostellers', course: 'mbatech', department: 'mbatech', year: 1, phone: '9820011104', parentPhone: '9820022104', address: 'Kolhapur, Maharashtra 416001', bloodGroup: 'AB+', room: '118' },
  { sapId: '70552000105', name: 'Tanvi Bhosale', gender: 'f', category: 'hostellers', course: 'pharmatech', department: 'pharmatech', year: 2, phone: '9820011105', parentPhone: '9820022105', address: 'Satara, Maharashtra 415001', bloodGroup: 'A-', room: '204' },
  { sapId: '70552000106', name: 'Pooja Nambiar', gender: 'f', category: 'hostellers', course: 'engineering', department: 'computer engineering', year: 1, phone: '9820011106', parentPhone: '9820022106', address: 'Thrissur, Kerala 680001', bloodGroup: 'B-', room: '209' },
];

const STAFF = [
  { username: 'admin', password: 'admin123', name: 'Campus Administrator', role: 'admin', email: DEMO_INBOXES[0], phone: '9000000001' },
  { username: 'admin2', password: 'admin123', name: 'Deputy Administrator', role: 'admin', email: DEMO_INBOXES[1], phone: '9000000002' },
  { username: 'warden1', password: 'warden123', name: 'Mr. Ramesh Kulkarni (Boys Warden)', role: 'warden', email: DEMO_INBOXES[2], phone: '9000000011', hostelCode: 'BHA' },
  { username: 'warden2', password: 'warden123', name: 'Mrs. Sunita Deshmukh (Girls Warden)', role: 'warden', email: DEMO_INBOXES[3], phone: '9000000012', hostelCode: 'GHB' },
  { username: 'security1', password: 'security123', name: 'Gate Security - Main Gate', role: 'security', email: DEMO_INBOXES[0], phone: '9000000021' },
  { username: 'security2', password: 'security123', name: 'Gate Security - Hostel Gate', role: 'security', email: DEMO_INBOXES[1], phone: '9000000022' },
];

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const run = async () => {
  await connectDB();

  // College branding (name shown on the dashboard, live screen and emails).
  const collegeName = DEFAULT_CONFIGS.system_configuration.collegeName;
  const sysCfg = await getSystemConfig('system_configuration');
  await upsertSystemConfig({ key: 'system_configuration', value: { ...sysCfg, collegeName } });
  const notifCfg = await getSystemConfig('notification_settings');
  await upsertSystemConfig({ key: 'notification_settings', value: { ...notifCfg, emailSenderName: collegeName } });

  const accounts = [];
  for (const s of STAFF) {
    const hostel = s.hostelCode ? await Hostel.findOne({ code: s.hostelCode }) : null;
    if (s.hostelCode && !hostel) throw new Error(`Hostel ${s.hostelCode} not found`);
    let doc = await Admin.findOne({ username: s.username });
    if (!doc) doc = new Admin({ username: s.username });
    Object.assign(doc, {
      password: s.password, // re-hashed by the pre-save hook
      name: s.name,
      role: s.role,
      email: s.email,
      phone: s.phone,
      hostelId: hostel ? hostel._id : null,
      isActive: true,
    });
    await doc.save();
    if (hostel) {
      await Hostel.updateOne(
        { _id: hostel._id },
        { $set: { warden: doc._id, wardenEmail: s.email, wardenPhone: s.phone } }
      );
    }
    accounts.push({ ...s, hostel: hostel ? hostel.name : '' });
  }

  // Roster: drop everyone not in the demo set, upsert the demo students.
  const keep = [...KEEP_SAP_IDS, ...DEMO_STUDENTS.map((d) => d.sapId)];
  const removed = await Student.deleteMany({ sapId: { $nin: keep } });
  console.log(`Removed ${removed.deletedCount} students not in the demo roster`);

  const boysHostel = await Hostel.findOne({ code: 'BHA' });
  const girlsHostel = await Hostel.findOne({ code: 'GHB' });
  for (const d of DEMO_STUDENTS) {
    const isHost = d.category === 'hostellers';
    const { gender, room, ...fields } = d;
    await Student.findOneAndUpdate(
      { sapId: d.sapId },
      {
        $set: {
          ...fields,
          email: 'placeholder@example.com',
          parentEmail: 'placeholder@example.com',
          isActive: true,
          studentType: isHost ? 'hosteller' : 'day_scholar',
          isHosteller: isHost,
          wardenApprovalRequired: isHost,
          hostel: isHost ? (gender === 'f' ? girlsHostel : boysHostel)._id : null,
          roomNumber: isHost ? room : '',
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  const students = await Student.find().populate('hostel', 'name').sort({ sapId: 1 });
  const rows = [];
  let i = 0;
  for (const st of students) {
    st.parentEmail = DEMO_INBOXES[i % DEMO_INBOXES.length];
    st.email = DEMO_INBOXES[(i + 1) % DEMO_INBOXES.length];
    await st.save({ validateModifiedOnly: true });
    rows.push({
      sapId: st.sapId,
      name: st.name,
      category: st.category,
      course: st.course,
      department: st.department,
      year: st.year,
      hostel: st.hostel ? st.hostel.name : '-',
      room: st.roomNumber || '-',
      phone: st.phone,
      email: st.email,
      parentEmail: st.parentEmail,
      parentPhone: st.parentPhone,
    });
    i += 1;
  }

  // Hostellers start the demo "inside" campus (same convention as utils/seed.js).
  const today = localDate();
  for (const st of students.filter((x) => x.studentType === 'hosteller')) {
    if (!(await EntryLog.exists({ sapId: st.sapId, date: today }))) {
      await EntryLog.create({
        sapId: st.sapId,
        studentName: st.name,
        category: st.category,
        date: today,
        entryTime: new Date(),
        status: 'entered',
      });
    }
  }

  const demoDir = path.join(__dirname, '..', '..', 'demo');
  fs.mkdirSync(demoDir, { recursive: true });
  const out = path.join(demoDir, 'demo-credentials.json');
  fs.writeFileSync(out, JSON.stringify({ accounts, students: rows, inboxes: DEMO_INBOXES }, null, 2));
  console.log(`Staff accounts: ${accounts.length}, students: ${rows.length}`);
  console.log(`Wrote ${out}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Demo seed failed:', err.message);
  process.exit(1);
});
