const request = require('supertest');
const app = require('../src/app');
const Idempotency = require('../src/models/Idempotency');
const Employee = require('../src/models/Employee');
const PayrollRecord = require('../src/models/PayrollRecord');

jest.mock('../src/models/Idempotency');
jest.mock('../src/models/Employee');
jest.mock('../src/models/PayrollRecord');

describe('Generate payroll idempotency', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST /api/payroll/generate with same Idempotency-Key returns 409 if previously processed', async () => {
    Idempotency.findOne.mockResolvedValue({ key: 'abc' });

    const res = await request(app)
      .post('/api/payroll/generate')
<<<<<<< HEAD
=======
      .set('x-api-key', 'test-api-key')
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a
      .set('Idempotency-Key', 'abc')
      .send({ month: '2026-02', payroll_group: 'cut' })
      .expect(409);

    expect(res.body.message).toMatch(/Duplicate request/);
    expect(Idempotency.findOne).toHaveBeenCalledWith({ key: 'abc', payroll_group: 'cut', month: '2026-02' });
  });

  test('POST /api/payroll/generate with Idempotency-Key creates record after processing', async () => {
    Idempotency.findOne.mockResolvedValue(null);
    Employee.find.mockResolvedValue([]);
    Idempotency.findOneAndUpdate.mockResolvedValue({ key: 'abc' });

    const res = await request(app)
      .post('/api/payroll/generate')
<<<<<<< HEAD
=======
      .set('x-api-key', 'test-api-key')
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a
      .set('Idempotency-Key', 'abc')
      .send({ month: '2026-02', payroll_group: 'cut' })
      .expect(200);

    expect(res.body.month).toBe('2026-02');
    expect(Idempotency.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'abc' },
      expect.objectContaining({ key: 'abc', payroll_group: 'cut', month: '2026-02' }),
      { upsert: true }
    );
  });
});