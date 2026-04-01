const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Admin = require('./models/Admin');
const { setIo } = require('./services/socketService');

const attachSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
        socket.handshake.query?.token;

      if (!rawToken) {
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(rawToken, process.env.JWT_SECRET);
      const admin = await Admin.findById(decoded.id).select(
        'username name email phone role isActive'
      );

      if (!admin || admin.isActive === false) {
        return next(new Error('Unauthorized socket connection'));
      }

      socket.user = {
        id: String(admin._id),
        username: admin.username,
        name: admin.name,
        role: admin.role,
      };

      return next();
    } catch (error) {
      return next(new Error('Unauthorized socket connection'));
    }
  });

  io.on('connection', (socket) => {
    const adminId = socket.user?.id;
    const role = socket.user?.role;

    if (adminId && role === 'warden') {
      socket.join(`warden:${adminId}`);
    }

    socket.on('warden:join', (targetAdminId) => {
      if (socket.user?.role === 'warden' && adminId && String(targetAdminId) === adminId) {
        socket.join(`warden:${adminId}`);
      }
    });
  });

  setIo(io);

  return io;
};

module.exports = {
  attachSocketServer,
};
