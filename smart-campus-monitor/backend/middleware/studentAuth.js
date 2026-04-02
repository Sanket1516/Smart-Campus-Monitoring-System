const Student = require('../models/Student');

/**
 * Middleware to authenticate students using name and phone number
 * Used for public-facing student features like exit request
 */
exports.authenticateStudent = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    console.log('\n🔐 Student Authentication Attempt:');
    console.log('   Username:', username);
    console.log('   Password:', password ? `${password.substring(0, 3)}***` : '(empty)');

    if (!username || !password) {
      console.log('   ❌ Missing username or password');
      return res.status(401).json({ message: 'Username and password are required' });
    }

    // Find student by name (case-insensitive) and hosteller type only
    const student = await Student.findOne({
      name: { $regex: new RegExp(`^${username.trim()}$`, 'i') },
      studentType: 'hosteller',
      isActive: true,
    }).populate({
      path: 'hostel',
      match: { isActive: true },
      populate: { path: 'warden', select: 'name email phone role isActive' },
    });

    if (!student) {
      console.log('   ❌ Student not found or not a hosteller');
      return res.status(401).json({ message: 'Invalid credentials or not a hosteller' });
    }

    console.log('   ✓ Student found:', student.name);
    console.log('   Student Type:', student.studentType);
    console.log('   Student Phone:', student.phone);

    // Verify phone number matches (remove spaces and special characters for comparison)
    const normalizePhone = (phone) => phone.replace(/[\s\-\(\)]/g, '');
    const studentPhone = normalizePhone(student.phone || '');
    const providedPhone = normalizePhone(password);

    console.log('   Normalized Student Phone:', studentPhone);
    console.log('   Normalized Provided Phone:', providedPhone);
    console.log('   Match:', studentPhone === providedPhone ? '✓ YES' : '✗ NO');

    if (studentPhone !== providedPhone) {
      console.log('   ❌ Phone number mismatch');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('   ✅ Authentication successful!\n');

    // Attach student to request object for use in the route handler
    req.student = student;
    next();
  } catch (error) {
    console.error('Student authentication error:', error);
    res.status(500).json({ message: 'Authentication failed' });
  }
};
