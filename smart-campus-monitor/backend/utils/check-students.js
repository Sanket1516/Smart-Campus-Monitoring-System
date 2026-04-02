/**
 * Quick script to check students in database
 * Usage: node utils/check-students.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Student = require('../models/Student');

const checkStudents = async () => {
  try {
    await connectDB();
    
    const students = await Student.find({})
      .select('sapId name email category course department year studentType hostel')
      .populate('hostel', 'name code')
      .lean();
    
    console.log('\n📊 Database Student Count:', students.length);
    console.log('\n👥 All Students:');
    console.log('─'.repeat(80));
    
    if (students.length === 0) {
      console.log('❌ No students found in database!');
      console.log('💡 Run: npm run seed');
    } else {
      students.forEach((s, index) => {
        console.log(`${index + 1}. SAP ID: ${s.sapId}`);
        console.log(`   Name: ${s.name}`);
        console.log(`   Email: ${s.email}`);
        console.log(`   Type: ${s.studentType} (${s.category})`);
        console.log(`   Course: ${s.course} - ${s.department}, Year ${s.year}`);
        if (s.hostel) {
          console.log(`   Hostel: ${s.hostel.name} (${s.hostel.code})`);
        }
        console.log('─'.repeat(80));
      });
      
      console.log('\n✅ Summary:');
      console.log(`   Total Students: ${students.length}`);
      console.log(`   Day Scholars: ${students.filter(s => s.studentType === 'day_scholar').length}`);
      console.log(`   Hostellers: ${students.filter(s => s.studentType === 'hosteller').length}`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
};

checkStudents();
