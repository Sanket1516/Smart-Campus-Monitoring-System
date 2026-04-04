// Delete test students (SAP001-SAP030) from database
// Run with: node delete-test-students.js

const mongoose = require('mongoose');
const Student = require('./models/Student');
require('dotenv').config();

async function deleteTestStudents() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Delete students with sapId from SAP001 to SAP030
    const result = await Student.deleteMany({
      sapId: { 
        $in: Array.from({ length: 30 }, (_, i) => `SAP${String(i + 1).padStart(3, '0')}`)
      }
    });

    console.log(`✅ Deleted ${result.deletedCount} test students (SAP001-SAP030)`);
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deleteTestStudents();
