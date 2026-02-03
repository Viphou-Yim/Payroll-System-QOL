const request = require('supertest');
const app = require('../src/app');

describe('Generate validation', () => {
  test('POST /api/payroll/generate returns 400 on missing fields', async () => {
    const res = await request(app).post('/api/payroll/generate').send({}).expect(400);
    expect(res.body.errors).toBeDefined();
  });

  test('POST /api/payroll/generate rejects invalid month', async () => {
    const res = await request(app).post('/api/payroll/generate').send({ month: '2026-13', payroll_group: 'cut' }).expect(400);
    expect(res.body.errors[0].msg).toMatch(/month must be YYYY-MM/);
  });

  test('POST /api/payroll/generate/employee rejects invalid month', async () => {
    const res = await request(app).post('/api/payroll/generate/employee').send({ employeeId: 'e1', month: '2026-13' }).expect(400);
    expect(res.body.errors[0].msg).toMatch(/month must be YYYY-MM/);
  });
});