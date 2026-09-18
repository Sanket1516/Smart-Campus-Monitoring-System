const request = require('supertest');
const app = require('../server');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');

jest.mock('../models/Student');
jest.mock('../models/DeviceAllocation');
jest.mock('../services/auditService');
jest.mock('../services/deviceAllocationService');
jest.mock('../services/fingerprintService');
jest.mock('../socket', () => ({ attachSocketServer: jest.fn() }));
jest.mock('../jobs/terminalJobs', () => ({ startTerminalJobs: jest.fn() }));
jest.mock('../jobs/hostellerJobs', () => ({ startHostellerJobs: jest.fn() }));
jest.mock('../utils/metrics', () => ({
  register: { metrics: jest.fn().mockResolvedValue('metrics'), contentType: 'text/plain' },
  metricsMiddleware: (req, res, next) => next()
}));

// Mock authentication middleware to pass automatically
jest.mock('../middleware/auth', () => {
  return {
    protect: (req, res, next) => {
      req.admin = { _id: 'admin123', role: 'admin' };
      next();
    },
    authorize: (...roles) => (req, res, next) => next()
  };
});

describe('Student API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/students/:sapId', () => {
    it('should return a student if sapId exists', async () => {
      const mockStudent = { sapId: '500000000', name: 'John Doe', isActive: true };
      
      const mockQuery = {
        populate: jest.fn().mockResolvedValue(mockStudent)
      };
      Student.findOne.mockReturnValue(mockQuery);

      const res = await request(app).get('/api/students/500000000');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('sapId', '500000000');
    });

    it('should return 404 if student not found', async () => {
      const mockQuery = {
        populate: jest.fn().mockResolvedValue(null)
      };
      Student.findOne.mockReturnValue(mockQuery);

      const res = await request(app).get('/api/students/123');

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toBe('Student not found');
    });
  });
});
