const request = require('supertest');
const app = require('../server');
const Admin = require('../models/Admin');
const Hostel = require('../models/Hostel');

jest.mock('../models/Admin');
jest.mock('../models/Hostel');

// Mock socket.io and jobs
jest.mock('../socket', () => ({ attachSocketServer: jest.fn() }));
jest.mock('../jobs/terminalJobs', () => ({ startTerminalJobs: jest.fn() }));
jest.mock('../jobs/hostellerJobs', () => ({ startHostellerJobs: jest.fn() }));
jest.mock('../services/auditService', () => ({ createAuditLog: jest.fn() }));
jest.mock('../utils/metrics', () => ({
  register: { metrics: jest.fn().mockResolvedValue('metrics'), contentType: 'text/plain' },
  metricsMiddleware: (req, res, next) => next()
}));

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return token and admin data for valid credentials', async () => {
      const mockAdmin = {
        _id: 'admin123',
        username: 'testadmin',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(true)
      };

      Admin.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockAdmin)
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testadmin', password: 'password123' });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.admin).toHaveProperty('username', 'testadmin');
    });

    it('should return 401 for invalid credentials', async () => {
      Admin.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testadmin', password: 'wrongpassword' });

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should return 400 if username or password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testadmin' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Username and password are required');
    });
  });
});
