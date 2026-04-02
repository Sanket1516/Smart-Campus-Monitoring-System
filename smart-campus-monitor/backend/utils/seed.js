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
const Hostel = require('../models/Hostel');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const { isHosteller } = require('./studentMeta');

const students = [
  // Day Scholars
  { 
    sapId: '70552300067', 
    name: 'Sanket Kumar', 
    email: 'sanket.kumar@college.edu', 
    phone: '9699980709',
    parentEmail: 'parent.sanket@gmail.com', 
    parentPhone: '9699980708', 
    category: 'dayscholars', 
    course: 'engineering', 
    department: 'computer science', 
    year: 3,
    address: '123 MG Road, Mumbai, Maharashtra 400001',
    bloodGroup: 'O+',
    isActive: true
  },
  { 
    sapId: '500091001', 
    name: 'Aarav Sharma', 
    email: 'aarav.sharma@college.edu',
    phone: '9876543210', 
    parentEmail: 'parent.aarav@gmail.com', 
    parentPhone: '9876543200', 
    category: 'dayscholars', 
    course: 'engineering', 
    department: 'computer science', 
    year: 3,
    address: '45 Park Street, Mumbai, Maharashtra 400002',
    bloodGroup: 'A+',
    isActive: true
  },
  { 
    sapId: '500091002', 
    name: 'Priya Patel', 
    email: 'priya.patel@college.edu',
    phone: '9876543211', 
    parentEmail: 'parent.priya@gmail.com', 
    parentPhone: '9876543201', 
    category: 'dayscholars', 
    course: 'pharmacy', 
    department: 'bpharm', 
    year: 2,
    address: '78 Link Road, Mumbai, Maharashtra 400003',
    bloodGroup: 'B+',
    isActive: true
  },
  { 
    sapId: '500091005', 
    name: 'Vikram Singh', 
    email: 'vikram.singh@college.edu',
    phone: '9876543214', 
    parentEmail: 'parent.vikram@gmail.com', 
    parentPhone: '9876543204', 
    category: 'dayscholars', 
    course: 'engineering', 
    department: 'computer engineering', 
    year: 2,
    address: '90 Station Road, Mumbai, Maharashtra 400004',
    bloodGroup: 'AB+',
    isActive: true
  },
  { 
    sapId: '500091007', 
    name: 'Karthik Nair', 
    email: 'karthik.nair@college.edu',
    phone: '9876543216', 
    parentEmail: 'parent.karthik@gmail.com', 
    parentPhone: '9876543206', 
    category: 'dayscholars', 
    course: 'mbatech', 
    department: 'mbatech', 
    year: 1,
    address: '12 Church Road, Mumbai, Maharashtra 400005',
    bloodGroup: 'O-',
    isActive: true
  },
  { 
    sapId: '500091009', 
    name: 'Arjun Desai', 
    email: 'arjun.desai@college.edu',
    phone: '9876543218', 
    parentEmail: 'parent.arjun@gmail.com', 
    parentPhone: '9876543208', 
    category: 'dayscholars', 
    course: 'pharmacy', 
    department: 'bpharm', 
    year: 4,
    address: '56 Hill Road, Mumbai, Maharashtra 400006',
    bloodGroup: 'A-',
    isActive: true
  },
  { 
    sapId: '500091010', 
    name: 'Divya Kulkarni', 
    email: 'divya.kulkarni@college.edu',
    phone: '9876543219', 
    parentEmail: 'parent.divya@gmail.com', 
    parentPhone: '9876543209', 
    category: 'dayscholars', 
    course: 'engineering', 
    department: 'computer science', 
    year: 3,
    address: '34 Beach Road, Mumbai, Maharashtra 400007',
    bloodGroup: 'B-',
    isActive: true
  },

  // Boys Hostellers
  { 
    sapId: '500091003', 
    name: 'Rohan Gupta', 
    email: 'rohan.gupta@college.edu',
    phone: '9876543212', 
    parentEmail: 'parent.rohan@gmail.com', 
    parentPhone: '9876543202', 
    category: 'hostellers', 
    course: 'engineering', 
    department: 'computer engineering', 
    year: 2,
    address: 'Village Khandala, Pune, Maharashtra 410301',
    bloodGroup: 'O+',
    isActive: true
  },
  { 
    sapId: '500091011', 
    name: 'Aditya Verma', 
    email: 'aditya.verma@college.edu',
    phone: '9876543220', 
    parentEmail: 'parent.aditya@gmail.com', 
    parentPhone: '9876543210', 
    category: 'hostellers', 
    course: 'engineering', 
    department: 'computer engineering', 
    year: 1,
    address: 'Sector 12, Navi Mumbai, Maharashtra 410210',
    bloodGroup: 'A+',
    isActive: true
  },
  { 
    sapId: '500091013', 
    name: 'Rahul Mehta', 
    email: 'rahul.mehta@college.edu',
    phone: '9876543222', 
    parentEmail: 'parent.rahul@gmail.com', 
    parentPhone: '9876543212', 
    category: 'hostellers', 
    course: 'engineering', 
    department: 'computer engineering', 
    year: 3,
    address: 'Thane West, Thane, Maharashtra 400601',
    bloodGroup: 'B+',
    isActive: true
  },

  // Girls Hostellers
  { 
    sapId: '500091004', 
    name: 'Sneha Reddy', 
    email: 'sneha.reddy@college.edu',
    phone: '9876543213', 
    parentEmail: 'parent.sneha@gmail.com', 
    parentPhone: '9876543203', 
    category: 'hostellers', 
    course: 'pharmatech', 
    department: 'pharmatech', 
    year: 4,
    address: 'Andheri East, Mumbai, Maharashtra 400069',
    bloodGroup: 'AB+',
    isActive: true
  },
  { 
    sapId: '500091006', 
    name: 'Ananya Iyer', 
    email: 'ananya.iyer@college.edu',
    phone: '9876543215', 
    parentEmail: 'parent.ananya@gmail.com', 
    parentPhone: '9876543205', 
    category: 'hostellers', 
    course: 'pharmacy', 
    department: 'bpharm', 
    year: 1,
    address: 'Borivali West, Mumbai, Maharashtra 400092',
    bloodGroup: 'O+',
    isActive: true
  },
  { 
    sapId: '500091008', 
    name: 'Meera Joshi', 
    email: 'meera.joshi@college.edu',
    phone: '9876543217', 
    parentEmail: 'parent.meera@gmail.com', 
    parentPhone: '9876543207', 
    category: 'hostellers', 
    course: 'engineering', 
    department: 'computer science', 
    year: 2,
    address: 'Vashi, Navi Mumbai, Maharashtra 400703',
    bloodGroup: 'A-',
    isActive: true
  },
  { 
    sapId: '500091012', 
    name: 'Ishita Shah', 
    email: 'ishita.shah@college.edu',
    phone: '9876543221', 
    parentEmail: 'parent.ishita@gmail.com', 
    parentPhone: '9876543211', 
    category: 'hostellers', 
    course: 'engineering', 
    department: 'computer science', 
    year: 2,
    address: 'Kandivali East, Mumbai, Maharashtra 400101',
    bloodGroup: 'B+',
    isActive: true
  },
];

const admins = [
  { username: 'admin', password: 'admin123', name: 'System Administrator', email: 'admin@college.edu', phone: '9999999999', role: 'admin', isActive: true },
  { username: 'warden1', password: 'warden123', name: 'Rajesh Kumar (Warden)', email: 'warden1@college.edu', phone: '9888888888', role: 'warden', isActive: true },
  { username: 'security1', password: 'security123', name: 'Suresh Patil (Security)', email: 'security1@college.edu', phone: '9777777777', role: 'security', isActive: true },
];

const seed = async () => {
  try {
    await connectDB();
    console.log('Clearing existing data...');
    await Promise.all([
      Student.deleteMany({}),
      Admin.deleteMany({}),
      Hostel.deleteMany({}),
      EntryLog.deleteMany({}),
      UnauthorizedLog.deleteMany({}),
    ]);

    console.log('Seeding admins...');
    const createdAdmins = [];
    for (const a of admins) {
      const admin = await Admin.create(a); // uses pre-save hook for password hashing
      createdAdmins.push(admin);
    }
    
    // Find the warden admin for hostel assignment
    const wardenAdmin = createdAdmins.find(a => a.role === 'warden');

    console.log('Seeding hostels...');
    const hostels = [
      {
        name: 'Boys Hostel A - North Wing',
        code: 'BHA',
        type: 'boys',
        totalRooms: 50,
        capacity: 100,
        warden: wardenAdmin._id,
        wardenPhone: '9888888888',
        wardenEmail: 'warden1@college.edu',
        location: 'North Campus, Block A',
        isActive: true,
      },
      {
        name: 'Girls Hostel B - South Wing',
        code: 'GHB',
        type: 'girls',
        totalRooms: 40,
        capacity: 80,
        warden: wardenAdmin._id,
        wardenPhone: '9888888888',
        wardenEmail: 'warden1@college.edu',
        location: 'South Campus, Block B',
        isActive: true,
      },
    ];
    const createdHostels = await Hostel.insertMany(hostels);
    const boysHostel = createdHostels[0];
    const girlsHostel = createdHostels[1];
    
    console.log('Seeding students...');
    // Assign hostellers to hostels based on gender/name
    const studentsWithHostels = students.map((student, index) => {
      if (student.category === 'hostellers') {
        // Assign to appropriate hostel
        const isBoy = ['Rohan', 'Aditya', 'Rahul'].some(name => student.name.includes(name));
        const hostel = isBoy ? boysHostel : girlsHostel;
        
        return {
          ...student,
          hostel: hostel._id,
          roomNumber: `${Math.floor(Math.random() * 50) + 101}`,
          studentType: 'hosteller',
          isHosteller: true,
        };
      }
      return {
        ...student,
        studentType: 'day_scholar',
        isHosteller: false,
      };
    });
    await Student.insertMany(studentsWithHostels);

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
            gateName: 'Main Gate',
            gateNumber: 1,
            terminalNumber: Math.floor(Math.random() * 2) + 1,
            machineNumber: 100 + Math.floor(Math.random() * 2) + 1, // 101 or 102
          });
        }
      }
    }
    await EntryLog.insertMany(logs);

    // Add a few unauthorized attempts
    console.log('Seeding unauthorized logs...');
    const today = new Date().toISOString().split('T')[0];
    await UnauthorizedLog.insertMany([
      { 
        scannedValue: 'UNKNOWN001', 
        date: today,
        gateName: 'Main Gate',
        gateNumber: 1,
        terminalNumber: 1,
        machineNumber: 101
      },
      { 
        scannedValue: 'INVALID999', 
        date: today,
        gateName: 'Main Gate',
        gateNumber: 1,
        terminalNumber: 2,
        machineNumber: 102
      },
    ]);

    console.log('Seed completed successfully!');
    console.log(`  Students: ${students.length}`);
    console.log(`  Admins: ${admins.length}`);
    console.log(`  Hostels: ${createdHostels.length}`);
    console.log(`  Entry logs: ${logs.length}`);
    console.log(`  Unauthorized logs: 2`);
    console.log('\n✅ Default Admin Credentials:');
    console.log('  Admin:    admin / admin123');
    console.log('  Warden:   warden1 / warden123');
    console.log('  Security: security1 / security123');
    console.log('\n✅ Hostels created and assigned to warden1');
    console.log('  - Boys Hostel A - North Wing (BHA)');
    console.log('  - Girls Hostel B - South Wing (GHB)');
    console.log('\n✅ Test Student SAP IDs:');
    console.log('  Day Scholar: 70552300067 (Sanket Kumar)');
    console.log('  Hosteller (Boy): 500091003 (Rohan Gupta)');
    console.log('  Hosteller (Girl): 500091004 (Sneha Reddy)');
    console.log('\n📧 All emails and phone numbers can be edited in the admin panel');

    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
};

seed();
