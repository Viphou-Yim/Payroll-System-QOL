const request = require('supertest');
const app = require('../src/app');
const Attendance = require('../src/models/Attendance');
const Employee = require('../src/models/Employee');
const Deduction = require('../src/models/Deduction');

jest.mock('../src/models/Attendance');
jest.mock('../src/models/Employee');
jest.mock('../src/models/Deduction');

describe('Attendance routes', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST /api/payroll/attendance upserts a record', async () => {
    Employee.findById.mockResolvedValue({ _id: 'emp1', name: 'Employee 1' });
    Attendance.findOneAndUpdate.mockResolvedValue({ _id: 'a1', employee: 'emp1', month: '2026-02', days_worked: 18 });
    Deduction.deleteOne.mockResolvedValue({ deletedCount: 0 });
    Deduction.findOneAndUpdate.mockResolvedValue({});

    const res = await request(app)
      .post('/api/payroll/attendance')
      .set('x-api-key', 'test-api-key')
      .send({ employeeId: 'emp1', month: '2026-02', start_date: '2026-02-03', end_date: '2026-02-20', days_absent: 0 })
      .expect(200);

    expect(res.body.message).toBe('Attendance saved');
    expect(res.body.record).toHaveProperty('_id', 'a1');
    expect(Attendance.findOneAndUpdate).toHaveBeenCalledWith(
      { employee: 'emp1', month: '2026-02' },
      {
        days_worked: 18,
        days_absent: 0,
        start_date: new Date('2026-02-03T00:00:00.000Z'),
        end_date: new Date('2026-02-20T00:00:00.000Z')
      },
      { upsert: true, new: true }
    );
  });

  test('POST /api/payroll/attendance calculates worked days from period and rounds absent up', async () => {
    Employee.findById.mockResolvedValue({ _id: 'emp1', name: 'Employee 1' });
    Attendance.findOneAndUpdate.mockResolvedValue({ _id: 'a2', employee: 'emp1', month: '2026-02', days_worked: 15.6, days_absent: 2.4 });
    Deduction.deleteOne.mockResolvedValue({ deletedCount: 0 });
    Deduction.findOneAndUpdate.mockResolvedValue({});

    await request(app)
      .post('/api/payroll/attendance')
      .set('x-api-key', 'test-api-key')
      .send({ employeeId: 'emp1', month: '2026-02', start_date: '2026-02-10', end_date: '2026-02-25', days_absent: 2.301 })
      .expect(200);

    expect(Attendance.findOneAndUpdate).toHaveBeenCalledWith(
      { employee: 'emp1', month: '2026-02' },
      {
        days_worked: 13.6,
        days_absent: 2.4,
        start_date: new Date('2026-02-10T00:00:00.000Z'),
        end_date: new Date('2026-02-25T00:00:00.000Z')
      },
      { upsert: true, new: true }
    );
  });

  test('POST /api/payroll/attendance auto-splits cross-month period', async () => {
    Employee.findById.mockResolvedValue({ _id: 'emp1', name: 'Employee 1' });
    Deduction.deleteOne.mockResolvedValue({ deletedCount: 0 });
    Deduction.findOneAndUpdate.mockResolvedValue({});
    Attendance.findOneAndUpdate
      .mockResolvedValueOnce({ _id: 'febRec', employee: 'emp1', month: '2026-02', days_worked: 6.4, days_absent: 2.6 })
      .mockResolvedValueOnce({ _id: 'marRec', employee: 'emp1', month: '2026-03', days_worked: 3.6, days_absent: 1.4 });

    const res = await request(app)
      .post('/api/payroll/attendance')
      .set('x-api-key', 'test-api-key')
      .send({ employeeId: 'emp1', month: '2026-02', start_date: '2026-02-20', end_date: '2026-03-05', days_absent: 4 })
      .expect(200);

    expect(res.body.split_applied).toBe(true);
    expect(Attendance.findOneAndUpdate).toHaveBeenCalledTimes(2);

    expect(Attendance.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { employee: 'emp1', month: '2026-02' },
      {
        days_worked: 6.4,
        days_absent: 2.6,
        start_date: new Date('2026-02-20T00:00:00.000Z'),
        end_date: new Date('2026-02-28T00:00:00.000Z')
      },
      { upsert: true, new: true }
    );

    expect(Attendance.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { employee: 'emp1', month: '2026-03' },
      {
        days_worked: 3.6,
        days_absent: 1.4,
        start_date: new Date('2026-03-01T00:00:00.000Z'),
        end_date: new Date('2026-03-05T00:00:00.000Z')
      },
      { upsert: true, new: true }
    );
  });

  test('POST /api/payroll/attendance rejects invalid input', async () => {
    const res = await request(app).post('/api/payroll/attendance').set('x-api-key', 'test-api-key').send({ employeeId: 'emp1', month: '2026-13', start_date: '2026-02-01', end_date: '2026-02-25', days_absent: 1 }).expect(400);
    expect(res.body.message).toMatch(/month must be YYYY-MM/);

    const res2 = await request(app).post('/api/payroll/attendance').set('x-api-key', 'test-api-key').send({ employeeId: 'emp1', month: '2026-02', start_date: '2026-02-01', end_date: '2026-02-25', days_absent: -5 }).expect(400);
    expect(res2.body.message).toMatch(/days_absent must be non-negative number/);

    const res3 = await request(app).post('/api/payroll/attendance').set('x-api-key', 'test-api-key').send({ employeeId: 'emp1', month: '2026-02', start_date: '2026-02-20', end_date: '2026-02-10', days_absent: 0 }).expect(400);
    expect(res3.body.message).toMatch(/end_date must be on or after start_date/);
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