/**
 * Seed script: Populates the database with sample data for development/testing.
 *
 * Usage:  npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const Student = require('../models/Student');
const Admin = require('../models/Admin');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const { isHosteller } = require('./studentMeta');

const students = [
  { sapId: '70552300067', name: 'Sanket (Test Card)', email: 'sanket@college.edu', parentEmail: 'parent.sanket@gmail.com', parentPhone: '9699980709', category: 'dayscholars', course: 'engineering', department: 'computer science', year: 3 },
  { sapId: '500091001', name: 'Aarav Sharma', email: 'aarav@college.edu', parentEmail: 'parent.aarav@gmail.com', parentPhone: '9876543210', category: 'dayscholars', course: 'engineering', department: 'computer science', year: 3 },
  { sapId: '500091002', name: 'Priya Patel', email: 'priya@college.edu', parentEmail: 'parent.priya@gmail.com', parentPhone: '9876543211', category: 'dayscholars', course: 'pharmacy', department: 'bpharm', year: 3 },
  { sapId: '500091003', name: 'Rohan Gupta', email: 'rohan@college.edu', parentEmail: 'parent.rohan@gmail.com', parentPhone: '9876543212', category: 'hostellers', course: 'engineering', department: 'computer engineering', year: 2 },
  { sapId: '500091004', name: 'Sneha Reddy', email: 'sneha@college.edu', parentEmail: 'parent.sneha@gmail.com', parentPhone: '9876543213', category: 'hostellers', course: 'pharmatech', department: 'pharmatech', year: 4 },
  { sapId: '500091005', name: 'Vikram Singh', email: 'vikram@college.edu', parentEmail: 'parent.vikram@gmail.com', parentPhone: '9876543214', category: 'dayscholars', course: 'engineering', department: 'computer engineering', year: 2 },
  { sapId: '500091006', name: 'Ananya Iyer', email: 'ananya@college.edu', parentEmail: 'parent.ananya@gmail.com', parentPhone: '9876543215', category: 'hostellers', course: 'pharmacy', department: 'bpharm', year: 1 },
  { sapId: '500091007', name: 'Karthik Nair', email: 'karthik@college.edu', parentEmail: 'parent.karthik@gmail.com', parentPhone: '9876543216', category: 'dayscholars', course: 'mbatech', department: 'mbatech', year: 3 },
  { sapId: '500091008', name: 'Meera Joshi', email: 'meera@college.edu', parentEmail: 'parent.meera@gmail.com', parentPhone: '9876543217', category: 'hostellers', course: 'engineering', department: 'computer science', year: 2 },
  { sapId: '500091009', name: 'Arjun Desai', email: 'arjun@college.edu', parentEmail: 'parent.arjun@gmail.com', parentPhone: '9876543218', category: 'dayscholars', course: 'pharmacy', department: 'bpharm', year: 4 },
  { sapId: '500091010', name: 'Divya Kulkarni', email: 'divya@college.edu', parentEmail: 'parent.divya@gmail.com', parentPhone: '9876543219', category: 'dayscholars', course: 'engineering', department: 'computer science', year: 3 },
];

const admins = [
  { username: 'admin', password: 'admin123', name: 'System Admin', role: 'admin' },
  { username: 'warden1', password: 'warden123', name: 'Hostel Warden', role: 'warden' },
  { username: 'security1', password: 'security123', name: 'Gate Security', role: 'security' },
];

const seed = async () => {
  try {
    await connectDB();
    console.log('Clearing existing data...');
    await Promise.all([
      Student.deleteMany({}),
      Admin.deleteMany({}),
      EntryLog.deleteMany({}),
      UnauthorizedLog.deleteMany({}),
    ]);

    console.log('Seeding students...');
    await Student.insertMany(students);

    console.log('Seeding admins...');
    for (const a of admins) {
      await Admin.create(a); // uses pre-save hook for password hashing
    }

    // Generate sample entry logs for the past 7 days
    console.log('Seeding entry logs...');
    const logs = [];
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      const d = new Date();
      d.setDate(d.getDate() - dayOffset);
      const dateStr = d.toISOString().split('T')[0];

      for (const student of students) {
        // ~80% chance of attendance each day
        if (Math.random() > 0.2) {
          const entryHour = 7 + Math.floor(Math.random() * 3); // 7-9 AM
          const entryTime = new Date(d);
          entryTime.setHours(entryHour, Math.floor(Math.random() * 60), 0, 0);

          const exitHour = 15 + Math.floor(Math.random() * 4); // 3-6 PM
          const exitTime = new Date(d);
          exitTime.setHours(exitHour, Math.floor(Math.random() * 60), 0, 0);

          // Only add exit if not today (today some students still inside)
          const isToday = dayOffset === 0;
          const hasExited = !isToday || Math.random() > 0.5;

          logs.push({
            sapId: student.sapId,
            studentName: student.name,
            category: student.category,
            date: dateStr,
            entryTime,
            exitTime: hasExited ? exitTime : null,
            status: hasExited ? 'exited' : 'entered',
            lateReturn: isHosteller(student.category) && Math.random() > 0.9,
          });
        }
      }
    }
    await EntryLog.insertMany(logs);

    // Add a few unauthorized attempts
    console.log('Seeding unauthorized logs...');
    const today = new Date().toISOString().split('T')[0];
    await UnauthorizedLog.insertMany([
      { scannedValue: 'UNKNOWN001', date: today },
      { scannedValue: 'INVALID999', date: today },
    ]);

    console.log('Seed completed successfully!');
    console.log(`  Students: ${students.length}`);
    console.log(`  Admins: ${admins.length}`);
    console.log(`  Entry logs: ${logs.length}`);
    console.log(`  Unauthorized logs: 2`);
    console.log('\nDefault credentials:');
    console.log('  Admin:    admin / admin123');
    console.log('  Warden:   warden1 / warden123');
    console.log('  Security: security1 / security123');

    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
};

seed();
