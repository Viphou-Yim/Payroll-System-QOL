const request = require('supertest');
const app = require('../src/app');
const Deduction = require('../src/models/Deduction');

jest.mock('../src/models/Deduction');

describe('Payroll routes', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST /api/payroll/deductions creates a monthly_debt', async () => {
    Deduction.create.mockResolvedValue({ _id: 'd1', employee: 'emp1', type: 'monthly_debt', amount: 500, month: '2026-01' });

    const res = await request(app)
      .post('/api/payroll/deductions')
      .send({ employeeId: 'emp1', type: 'monthly_debt', amount: 500, month: '2026-01', reason: 'loan' })
      .expect(200);

    expect(res.body.message).toBe('Deduction created');
    expect(res.body.deduction).toHaveProperty('_id', 'd1');
    expect(Deduction.create).toHaveBeenCalledWith(expect.objectContaining({ employee: 'emp1', type: 'monthly_debt', amount: 500, month: '2026-01' }));
  });

  test('POST /api/payroll/deductions returns 400 on missing fields', async () => {
    const res = await request(app).post('/api/payroll/deductions').send({ employeeId: 'emp1', type: 'monthly_debt', month: '2026-01' }).expect(400);
    expect(res.body.message).toMatch(/required/);
  });
});