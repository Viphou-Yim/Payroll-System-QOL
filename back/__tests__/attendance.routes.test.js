const request = require('supertest');
const app = require('../src/app');
const Attendance = require('../src/models/Attendance');
const Employee = require('../src/models/Employee');

jest.mock('../src/models/Attendance');
jest.mock('../src/models/Employee');

describe('Attendance routes', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST /api/payroll/attendance upserts a record', async () => {
    Employee.findById.mockResolvedValue({ _id: 'emp1', name: 'Employee 1' });
    Attendance.findOneAndUpdate.mockResolvedValue({ _id: 'a1', employee: 'emp1', month: '2026-02', days_worked: 25 });

    const res = await request(app)
      .post('/api/payroll/attendance')
      .set('x-api-key', 'test-api-key')
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

  test('POST /api/payroll/attendance rounds worked down and absent up', async () => {
    Employee.findById.mockResolvedValue({ _id: 'emp1', name: 'Employee 1' });
    Attendance.findOneAndUpdate.mockResolvedValue({ _id: 'a2', employee: 'emp1', month: '2026-02', days_worked: 15.6, days_absent: 2.4 });

    await request(app)
      .post('/api/payroll/attendance')
      .set('x-api-key', 'test-api-key')
      .send({ employeeId: 'emp1', month: '2026-02', days_worked: 15.677, days_absent: 2.301 })
      .expect(200);

    expect(Attendance.findOneAndUpdate).toHaveBeenCalledWith(
      { employee: 'emp1', month: '2026-02' },
      { days_worked: 15.6, days_absent: 2.4 },
      { upsert: true, new: true }
    );
  });

  test('POST /api/payroll/attendance rejects invalid input', async () => {
    const res = await request(app).post('/api/payroll/attendance').set('x-api-key', 'test-api-key').send({ employeeId: 'emp1', month: '2026-13', days_worked: 25 }).expect(400);
    expect(res.body.message).toMatch(/month must be YYYY-MM/);

    const res2 = await request(app).post('/api/payroll/attendance').set('x-api-key', 'test-api-key').send({ employeeId: 'emp1', month: '2026-02', days_worked: -5 }).expect(400);
    expect(res2.body.message).toMatch(/days_worked must be number 0-31/);
  });

  test('GET /api/payroll/attendance returns list', async () => {
    Attendance.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([{ _id: 'a1' }])
    });
    const res = await request(app).get('/api/payroll/attendance?employeeId=emp1').set('x-api-key', 'test-api-key').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(Attendance.find).toHaveBeenCalledWith({ employee: 'emp1' });
  });
});