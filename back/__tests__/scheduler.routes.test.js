const request = require('supertest');
const app = require('../src/app');
const Scheduler = require('../src/models/Scheduler');

jest.mock('../src/models/Scheduler');

describe('Scheduler endpoints', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST /api/payroll/schedule/start persists scheduler config', async () => {
    Scheduler.findOneAndUpdate.mockResolvedValue({ _id: 's1', payroll_group: 'cut', cronExpression: '*/5 * * * *' });

    const res = await request(app)
      .post('/api/payroll/schedule/start')
      .set('x-api-key', 'test-api-key')
      .send({ payroll_group: 'cut', cronExpression: '*/5 * * * *' })
      .expect(200);

    expect(res.body.message).toBe('Scheduler started');
    expect(res.body.payroll_group).toBe('cut');
    expect(Scheduler.findOneAndUpdate).toHaveBeenCalled();
  });

  test('POST /api/payroll/schedule/stop disables scheduler', async () => {
    Scheduler.findOneAndUpdate.mockResolvedValue({ _id: 's1', payroll_group: 'cut', enabled: false });

    const res = await request(app)
      .post('/api/payroll/schedule/stop')
      .set('x-api-key', 'test-api-key')
      .send({ payroll_group: 'cut' })
      .expect(200);

    expect(res.body.message).toBe('Scheduler stopped');
    expect(Scheduler.findOneAndUpdate).toHaveBeenCalled();
  });
});