const Student = require('../models/Student');
const {
  normalizeCategory,
  normalizeCourse,
  normalizeDepartment,
} = require('../utils/studentMeta');
const { createAuditLog } = require('../services/auditService');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const normalizeStudentPayload = (payload = {}) => ({
  ...payload,
  ...(payload.category !== undefined ? { category: normalizeCategory(payload.category) } : {}),
  ...(payload.course !== undefined ? { course: normalizeCourse(payload.course) } : {}),
  ...(payload.department !== undefined
    ? { department: normalizeDepartment(payload.department) }
    : {}),
});

// GET /api/students/:sapId
exports.getStudentBySapId = async (req, res) => {
  try {
    const student = await Student.findOne({ sapId: req.params.sapId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/students
exports.getAllStudents = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    const filter = { isActive: true };

    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sapId: { $regex: search, $options: 'i' } },
      ];
    }

    const students = await Student.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Student.countDocuments(filter);

    res.json({ students, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/students
exports.createStudent = async (req, res) => {
  try {
    const student = await Student.create(normalizeStudentPayload(req.body));

    await createAuditLog({
      admin: req.admin,
      action: `Created student ${student.name} (${student.sapId})`,
      entity: 'Student',
      entityId: student._id,
      oldValue: null,
      newValue: student.toObject(),
      ipAddress: req.ip,
    });

    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/students/:sapId
exports.updateStudent = async (req, res) => {
  try {
    const previousStudent = await Student.findOne({ sapId: req.params.sapId }).lean();
    if (!previousStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = await Student.findOneAndUpdate(
      { sapId: req.params.sapId },
      normalizeStudentPayload(req.body),
      { new: true, runValidators: true }
    );

    await createAuditLog({
      admin: req.admin,
      action: `Updated student ${student.name} (${student.sapId})`,
      entity: 'Student',
      entityId: student._id,
      oldValue: previousStudent,
      newValue: student.toObject(),
      ipAddress: req.ip,
    });

    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/students/:sapId
exports.deleteStudent = async (req, res) => {
  try {
    const previousStudent = await Student.findOne({ sapId: req.params.sapId }).lean();
    if (!previousStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = await Student.findOneAndUpdate(
      { sapId: req.params.sapId },
      { isActive: false },
      { new: true }
    );

    await createAuditLog({
      admin: req.admin,
      action: `Deactivated student ${student.name} (${student.sapId})`,
      entity: 'Student',
      entityId: student._id,
      oldValue: previousStudent,
      newValue: student.toObject(),
      ipAddress: req.ip,
    });

    res.json({ message: 'Student deactivated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `students-${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only .xlsx and .xls files are allowed'));
    }
    cb(null, true);
  },
}).single('file');

// Helper function to transform student data
const transformStudentData = (row) => {
  // Use normalization functions from studentMeta
  const rawCategory = (row.category || '').toString().toLowerCase().trim();
  const normalizedCategory = normalizeCategory(rawCategory);
  
  const baseData = {
    sapId: row.sapId ? row.sapId.toString().trim() : null,
    name: row.name ? row.name.toString().trim() : null,
    email: row.email ? row.email.toString().trim().toLowerCase() : null,
    category: normalizedCategory,
    course: row.course ? normalizeCourse(row.course) : null,
    department: row.department ? normalizeDepartment(row.department) : null,
    year: row.year ? parseInt(row.year) : undefined,
    phone: row.phone ? row.phone.toString().trim() : undefined,
    parentEmail: row.parentEmail ? row.parentEmail.toString().trim().toLowerCase() : undefined,
    parentPhone: row.parentPhone ? row.parentPhone.toString().trim() : undefined,
    address: row.address ? row.address.toString().trim() : '',
    bloodGroup: row.bloodGroup ? row.bloodGroup.toString().trim() : '',
  };

  // Apply category-based transformations
  if (normalizedCategory === 'hostellers') {
    baseData.studentType = 'hosteller';
    baseData.isHosteller = true;
    baseData.wardenApprovalRequired = true;
    // Only include hostel if it's provided
    if (row.hostel) {
      baseData.hostel = row.hostel;
    }
    baseData.roomNumber = row.roomNumber ? row.roomNumber.toString().trim() : '';
  } else if (normalizedCategory === 'dayscholars') {
    baseData.studentType = 'day_scholar';
    baseData.isHosteller = false;
    baseData.wardenApprovalRequired = false;
    // Don't set hostel field at all for day scholars - let schema default handle it
    // baseData.hostel = null;  // REMOVED
    baseData.roomNumber = '';
  }

  return baseData;
};

// POST /api/students/upload
exports.uploadStudentsExcel = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const results = {
      totalRows: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet);

      results.totalRows = rawData.length;

      if (rawData.length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'Excel file is empty' });
      }

      // Validate and transform data
      const studentsToInsert = [];
      const validationErrors = [];

      rawData.forEach((row, index) => {
        const rowNumber = index + 2; // Excel rows start at 1, +1 for header

        try {
          const studentData = transformStudentData(row);

          // Validate required fields
          const requiredFields = ['sapId', 'name', 'email', 'category', 'course', 'department'];
          const missingFields = requiredFields.filter(field => !studentData[field]);

          if (missingFields.length > 0) {
            validationErrors.push({
              row: rowNumber,
              error: `Missing required fields: ${missingFields.join(', ')}`,
            });
            return;
          }

          // Validate category
          if (!['dayscholars', 'hostellers'].includes(studentData.category)) {
            validationErrors.push({
              row: rowNumber,
              error: `Invalid category: ${studentData.category}. Must be 'dayscholars' or 'hostellers'`,
            });
            return;
          }

          studentsToInsert.push(studentData);
        } catch (error) {
          validationErrors.push({
            row: rowNumber,
            error: error.message,
          });
        }
      });

      // Insert students with error handling
      if (studentsToInsert.length > 0) {
        try {
          const insertResult = await Student.insertMany(studentsToInsert, { ordered: false });
          results.successCount = insertResult.length;
        } catch (error) {
          // Debug logging
          console.log('Insert error:', error.name);
          console.log('Has writeErrors:', !!error.writeErrors);
          if (error.writeErrors && error.writeErrors.length > 0) {
            console.log('First writeError:', JSON.stringify(error.writeErrors[0], null, 2));
          }
          
          // Handle duplicate key and validation errors
          if (error.writeErrors) {
            error.writeErrors.forEach((writeError) => {
              const failedDoc = studentsToInsert[writeError.index];
              
              // Extract error message from various possible locations
              let errorMsg = '';
              
              if (writeError.err && writeError.err.errmsg) {
                errorMsg = writeError.err.errmsg;
              } else if (writeError.err && writeError.err.message) {
                errorMsg = writeError.err.message;
              } else if (writeError.errmsg) {
                errorMsg = writeError.errmsg;
              } else if (writeError.message) {
                errorMsg = writeError.message;
              } else {
                // Log the full error object for debugging
                errorMsg = JSON.stringify(writeError);
              }
              
              // Extract meaningful error messages
              if (errorMsg.includes('duplicate key')) {
                if (errorMsg.includes('sapId')) {
                  errorMsg = `Duplicate sapId: ${failedDoc.sapId}`;
                } else if (errorMsg.includes('zktUserID')) {
                  errorMsg = `Duplicate zktUserID`;
                } else {
                  errorMsg = `Duplicate key error`;
                }
              } else if (errorMsg.includes('Department must be one of')) {
                errorMsg = `Invalid department '${failedDoc.department}' for course '${failedDoc.course}'`;
              } else if (errorMsg.includes('validation failed')) {
                // Extract the validation error details
                const match = errorMsg.match(/Path `(.+?)` (.+?)(?:\.|$)/);
                if (match) {
                  errorMsg = `${match[1]}: ${match[2]}`;
                }
              }
              
              results.errors.push({
                sapId: failedDoc.sapId,
                name: failedDoc.name,
                error: errorMsg,
              });
            });
            
            // Count successful inserts
            results.successCount = studentsToInsert.length - error.writeErrors.length;
          } else if (error.name === 'ValidationError') {
            results.errors.push({
              error: error.message,
            });
          } else {
            throw error;
          }
        }
      }

      // Add validation errors to results
      results.errors = [...validationErrors, ...results.errors];
      results.failureCount = results.totalRows - results.successCount;

      // Create audit log
      await createAuditLog({
        admin: req.admin,
        action: `Uploaded ${results.successCount} students via Excel (${results.failureCount} failed)`,
        entity: 'Student',
        entityId: null,
        oldValue: null,
        newValue: { results },
        ipAddress: req.ip,
      });

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      res.json({
        message: 'Upload processing completed',
        results,
      });
    } catch (error) {
      // Clean up file on error
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.status(500).json({ 
        message: 'Error processing Excel file',
        error: error.message 
      });
    }
  });
};
