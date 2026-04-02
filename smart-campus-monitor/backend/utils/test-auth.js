const mongoose = require('mongoose');
const Student = require('../models/Student');
require('dotenv').config();

async function testAuth() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    // Find all hostellers
    const hostellers = await Student.find({
      studentType: 'hosteller',
      isActive: true,
    }).select('name sapId phone studentType category');

    console.log('\n📋 Hostellers in Database:');
    console.log('=' .repeat(60));
    hostellers.forEach((student, index) => {
      console.log(`\n${index + 1}. Name: ${student.name}`);
      console.log(`   SAP ID: ${student.sapId}`);
      console.log(`   Phone: ${student.phone}`);
      console.log(`   Student Type: ${student.studentType}`);
      console.log(`   Category: ${student.category}`);
    });

    // Test authentication for Rohan Gupta
    console.log('\n\n🔐 Testing Authentication for "Rohan Gupta"');
    console.log('=' .repeat(60));
    
    const testName = 'Rohan Gupta';
    const testPhone = '9876543212';
    
    const student = await Student.findOne({
      name: { $regex: new RegExp(`^${testName.trim()}$`, 'i') },
      studentType: 'hosteller',
      isActive: true,
    }).populate({
      path: 'hostel',
      match: { isActive: true },
      populate: { path: 'warden', select: 'name email phone role isActive' },
    });

    if (!student) {
      console.log('❌ Student not found with authentication query');
    } else {
      console.log('✅ Student found!');
      console.log(`   Name: ${student.name}`);
      console.log(`   Phone: ${student.phone}`);
      console.log(`   Student Type: ${student.studentType}`);
      console.log(`   Hostel: ${student.hostel?.name || 'Not assigned'}`);
      
      // Test phone matching
      const normalizePhone = (phone) => phone.replace(/[\s\-\(\)]/g, '');
      const studentPhone = normalizePhone(student.phone || '');
      const providedPhone = normalizePhone(testPhone);
      
      console.log(`\n   Normalized Student Phone: "${studentPhone}"`);
      console.log(`   Normalized Provided Phone: "${providedPhone}"`);
      console.log(`   Match: ${studentPhone === providedPhone ? '✅ YES' : '❌ NO'}`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testAuth();
