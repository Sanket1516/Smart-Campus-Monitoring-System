/**
 * Seed script: Resets student data only.
 *
 * Usage:  npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Student = require('../models/Student');
const Hostel = require('../models/Hostel');
const EntryLog = require('../models/EntryLog');

const formatDateLocal = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const students = [
  // Day Scholars
  { 
    sapId: '70552300067', 
    name: 'Sanket Mali', 
    email: 'sanketmali1516@gmail.com', 
    phone: '9699980709',
    parentEmail: 'sanketmali0909@gmail.com', 
    parentPhone: '9699980709', 
    category: 'dayscholars', 
    course: 'engineering', 
    department: 'computer science', 
    year: 3,
    address: '123 MG Road, Mumbai, Maharashtra 400001',
    bloodGroup: 'O+',
    isActive: true
  },
  { 
    sapId: '70552000002', 
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
    sapId: '70552000003', 
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
    sapId: '70552000004', 
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
    sapId: '70552000005', 
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
    sapId: '70552000006', 
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
    sapId: '70552000007', 
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
    sapId: '70552000008', 
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
    sapId: '70552000009', 
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
    sapId: '70552000010', 
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
    sapId: '70552000011', 
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
    sapId: '70552000012', 
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
    sapId: '70552000013', 
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
    sapId: '70552000014', 
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

const seed = async () => {
  try {
    await connectDB();
    console.log('Clearing students collection...');
    const deleteResult = await Student.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} students`);

    const boysHostel = await Hostel.findOne({ code: 'BHA' }).lean();
    const girlsHostel = await Hostel.findOne({ code: 'GHB' }).lean();

    if (!boysHostel || !girlsHostel) {
      throw new Error(
        'Required hostels not found (BHA/GHB). This seed only resets students and does not create hostels.'
      );
    }
    
    console.log('Seeding students...');
    // Assign hostellers to hostels based on gender/name
    const studentsWithHostels = students.map((student) => {
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
          wardenApprovalRequired: true,
        };
      }
      return {
        ...student,
        studentType: 'day_scholar',
        isHosteller: false,
        wardenApprovalRequired: false,
      };
    });
    
    console.log(`  Attempting to insert ${studentsWithHostels.length} students...`);
    try {
      const insertedStudents = await Student.insertMany(studentsWithHostels);
      console.log(`  ✅ Successfully inserted ${insertedStudents.length} students`);
    } catch (studentError) {
      console.error('\n❌ Failed to insert students!');
      console.error('Error:', studentError.message);
      if (studentError.errors) {
        console.error('Validation errors:');
        Object.keys(studentError.errors).forEach(key => {
          console.error(`  - ${key}: ${studentError.errors[key].message}`);
        });
      }
      throw studentError; // Re-throw to stop the seed
    }

    console.log('Marking hostellers as inside...');
    const hostellerSapIds = studentsWithHostels
      .filter((student) => student.studentType === 'hosteller')
      .map((student) => student.sapId);
    const today = formatDateLocal();
    const existingLogs = await EntryLog.find({
      sapId: { $in: hostellerSapIds },
      date: today,
    })
      .sort({ createdAt: -1 })
      .lean();
    const latestLogBySapId = new Map();
    for (const log of existingLogs) {
      if (!latestLogBySapId.has(log.sapId)) {
        latestLogBySapId.set(log.sapId, log);
      }
    }
    const insideLogs = [];
    for (const student of studentsWithHostels) {
      if (student.studentType !== 'hosteller') {
        continue;
      }
      const latest = latestLogBySapId.get(student.sapId);
      if (latest?.status === 'entered') {
        continue;
      }
      insideLogs.push({
        sapId: student.sapId,
        studentName: student.name,
        category: student.category,
        date: today,
        entryTime: new Date(),
        status: 'entered',
      });
    }
    if (insideLogs.length) {
      await EntryLog.insertMany(insideLogs);
    }

    console.log('Seed completed successfully!');
    
    // Verify what was actually inserted
    const finalCount = await Student.countDocuments();
    console.log(`\n📊 Final Database Counts:`);
    console.log(`  Students in DB: ${finalCount}`);
    console.log('\n✅ Test Student SAP IDs:');
    console.log('  Day Scholar: 70552300067 (Sanket Mali)');
    console.log('  Hosteller (Boy): 70552000008 (Rohan Gupta)');
    console.log('  Hosteller (Girl): 70552000011 (Sneha Reddy)');
    console.log('\n📧 All emails and phone numbers can be edited in the admin panel');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seed error:', err.message);
    if (err.errors) {
      console.error('\n📋 Validation errors:');
      Object.keys(err.errors).forEach(key => {
        console.error(`  - ${key}: ${err.errors[key].message}`);
      });
    }
    console.error('\n💡 Full error details:', err);
    process.exit(1);
  }
};

seed();
