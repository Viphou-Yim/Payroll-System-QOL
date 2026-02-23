const request = require('supertest');
const app = require('../src/app');
const Employee = require('../src/models/Employee');
const Attendance = require('../src/models/Attendance');
const Deduction = require('../src/models/Deduction');

jest.mock('../src/models/Employee');
jest.mock('../src/models/Attendance');
jest.mock('../src/models/Deduction');

describe('Auth and session', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST /api/auth/login and /me', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'passwd' }).expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user).toBeDefined();
    expect(me.body.user.username).toBe('admin');
  });

  test('POST /api/payroll/attendance blocked without auth', async () => {
    await request(app).post('/api/payroll/attendance').send({ employeeId: 'emp1', month: '2026-02', start_date: '2026-02-01', end_date: '2026-02-10', days_absent: 0 }).expect(401);
  });

  test('POST /api/payroll/attendance allowed after login', async () => {
    Employee.findById.mockResolvedValue({ _id: 'emp1', name: 'Alice' });
    Attendance.findOneAndUpdate.mockResolvedValue({ _id: 'a1', employee: 'emp1', month: '2026-02', days_worked: 10 });
    Deduction.deleteOne.mockResolvedValue({ deletedCount: 0 });
    Deduction.findOneAndUpdate.mockResolvedValue({});

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'passwd' }).expect(200);
    const res = await agent.post('/api/payroll/attendance').send({ employeeId: 'emp1', month: '2026-02', start_date: '2026-02-01', end_date: '2026-02-10', days_absent: 0 }).expect(200);
    expect(res.body.message).toBe('Attendance saved');
  });
});