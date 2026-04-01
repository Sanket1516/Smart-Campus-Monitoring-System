const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const serializeAdmin = (admin) => ({
  id: admin._id,
  username: admin.username,
  name: admin.name,
  email: admin.email,
  phone: admin.phone,
  role: admin.role,
  isActive: admin.isActive,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
});

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const admin = await Admin.findOne({ username }).select('+password');
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (admin.isActive === false) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const token = signToken(admin._id);

    res.json({
      token,
      admin: serializeAdmin(admin),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({
    admin: serializeAdmin(req.admin),
  });
};

// POST /api/auth/register (admin only)
exports.register = async (req, res) => {
  try {
    const { username, password, name, email, phone, role } = req.body;

    const existing = await Admin.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const admin = await Admin.create({ username, password, name, email, phone, role });

    res.status(201).json({
      admin: serializeAdmin(admin),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/staff
exports.getStaff = async (_req, res) => {
  try {
    const staff = await Admin.find()
      .select('username name email phone role isActive createdAt updatedAt')
      .sort({ role: 1, name: 1 });

    res.json({ staff });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/auth/staff/:id
exports.updateStaff = async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;

    const staff = await Admin.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, role },
      { new: true, runValidators: true }
    ).select('username name email phone role isActive createdAt updatedAt');

    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    res.json({ staff });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/auth/staff/:id
exports.deactivateStaff = async (req, res) => {
  try {
    if (String(req.admin._id) === req.params.id) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }

    const staff = await Admin.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select('username name email phone role isActive createdAt updatedAt');

    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    res.json({ staff });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
