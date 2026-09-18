const request = require('supertest');
const app = require('../server');
const Student = require('../models/Student');
const EntryLog = require('../models/EntryLog');

jest.mock('../models/Student');
jest.mock('../models/EntryLog');
jest.mock('../models/AlertLog');
jest.mock('../models/UnauthorizedLog');
jest.mock('../models/AccessControlLog');
jest.mock('../models/HostellerRequest');
jest.mock('../services/configService', () => ({ isPastCurfew: jest.fn().mockResolvedValue(false) }));
jest.mock('../socket', () => ({ 
  attachSocketServer: jest.fn(), 
  getIo: jest.fn().mockReturnValue({ emit: jest.fn() }),
  emitScanBlocked: jest.fn(),
  emitScanUnauthorized: jest.fn(),
  emitScanLive: jest.fn(),
  emitWardenRequired: jest.fn()
}));
jest.mock('../jobs/terminalJobs', () => ({ startTerminalJobs: jest.fn() }));
jest.mock('../jobs/hostellerJobs', () => ({ startHostellerJobs: jest.fn() }));
jest.mock('../services/notification', () => ({
  notifyParent: jest.fn().mockResolvedValue()
}));
jest.mock('../utils/metrics', () => ({
  register: { metrics: jest.fn().mockResolvedValue('metrics'), contentType: 'text/plain' },
  metricsMiddleware: (req, res, next) => next()
}));

// Mock authentication
jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    req.admin = { _id: 'admin123', role: 'guard' };
    next();
  },
  authorize: (...roles) => (req, res, next) => next()
}));

describe('Scan API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/scan', () => {
    it('should process a scan for a valid student', async () => {
      const mockStudent = { 
        _id: 'student123', 
        sapId: '500000000', 
        name: 'John Doe', 
        isActive: true,
        studentType: 'day_scholar',
        hostel: null
      };

      Student.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockStudent)
        })
      });

      EntryLog.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({ status: 'exited' })
      });
      EntryLog.create.mockResolvedValue({ _id: 'scanlog123', sapId: '500000000', entryTime: new Date(), status: 'entered' });

      const res = await request(app)
        .post('/api/scan')
        .send({ sapId: '500000000', direction: 'entry', terminalId: 'term1' });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('authorized', true);
      expect(res.body.student).toHaveProperty('sapId', '500000000');
    });

    it('should return 404 if student not found', async () => {
      Student.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null)
        })
      });

      const res = await request(app)
        .post('/api/scan')
        .send({ sapId: '123', direction: 'entry', terminalId: 'term1' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toBe('UNAUTHORIZED: SAP ID not found in database');
    });
  });
});
