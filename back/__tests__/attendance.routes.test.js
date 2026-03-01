const request = require('supertest');
const app = require('../src/app');
const Attendance = require('../src/models/Attendance');

jest.mock('../src/models/Attendance');

describe('Attendance routes', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST /api/payroll/attendance upserts a record', async () => {
    Attendance.findOneAndUpdate.mockResolvedValue({ _id: 'a1', employee: 'emp1', month: '2026-02', days_worked: 25 });

    const res = await request(app)
      .post('/api/payroll/attendance')
      .send({ employeeId: 'emp1', month: '2026-02', days_worked: 25 })
      .expect(200);

    expect(res.body.message).toBe('Attendance saved');
    expect(res.body.record).toHaveProperty('_id', 'a1');
    expect(Attendance.findOneAndUpdate).toHaveBeenCalledWith(
      { employee: 'emp1', month: '2026-02' },
      { days_worked: 25, days_absent: 0 },
      { upsert: true, new: true }
    );
  });

  test('POST /api/payroll/attendance rejects invalid input', async () => {
    const res = await request(app).post('/api/payroll/attendance').send({ employeeId: 'emp1', month: '2026-13', days_worked: 25 }).expect(400);
    expect(res.body.message).toMatch(/month must be YYYY-MM/);

    const res2 = await request(app).post('/api/payroll/attendance').send({ employeeId: 'emp1', month: '2026-02', days_worked: -5 }).expect(400);
    expect(res2.body.message).toMatch(/days_worked must be between 0 and 31/);
  });

  test('GET /api/payroll/attendance returns list', async () => {
    Attendance.find.mockResolvedValue([{ _id: 'a1' }]);
    const res = await request(app).get('/api/payroll/attendance?employeeId=emp1').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(Attendance.find).toHaveBeenCalledWith({ employee: 'emp1' });
  });
});