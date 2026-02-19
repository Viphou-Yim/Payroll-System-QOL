const request = require('supertest');
const app = require('../src/app');
const Deduction = require('../src/models/Deduction');
const Employee = require('../src/models/Employee');

jest.mock('../src/models/Deduction');
jest.mock('../src/models/Employee');

describe('Payroll routes', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST /api/payroll/deductions creates a monthly_debt', async () => {
    Deduction.create.mockResolvedValue({ _id: 'd1', employee: 'emp1', type: 'monthly_debt', amount: 500, month: '2026-01' });

    const res = await request(app)
      .post('/api/payroll/deductions')
      .set('x-api-key', 'test-api-key')
      .send({ employeeId: 'emp1', type: 'monthly_debt', amount: 500, month: '2026-01', reason: 'loan' })
      .expect(200);

    expect(res.body.message).toBe('Deduction created');
    expect(res.body.deduction).toHaveProperty('_id', 'd1');
    expect(Deduction.create).toHaveBeenCalledWith(expect.objectContaining({ employee: 'emp1', type: 'monthly_debt', amount: 500, month: '2026-01' }));
  });

  test('POST /api/payroll/deductions returns 400 on missing fields', async () => {
    const res = await request(app).post('/api/payroll/deductions').set('x-api-key', 'test-api-key').send({ employeeId: 'emp1', type: 'monthly_debt', month: '2026-01' }).expect(400);
    expect(res.body.message).toMatch(/required/);
  });

  test('POST /api/payroll/employees creates employee for compatible flags+group', async () => {
    Employee.findOne.mockResolvedValue(null);
    Employee.create.mockResolvedValue({ _id: 'e1', name: 'Alice', payroll_group: 'cut' });

    const res = await request(app)
      .post('/api/payroll/employees')
      .set('x-api-key', 'test-api-key')
      .send({
        name: 'Alice',
        phone: '555-0001',
        base_salary: 30000,
        payroll_group: 'cut',
        has_20_deduction: true,
        has_10day_holding: false,
        has_debt_deduction: false
      })
      .expect(201);

    expect(res.body.message).toBe('Employee created');
    expect(Employee.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Alice',
      payroll_group: 'cut',
      has_20_deduction: true
    }));
  });

  test('POST /api/payroll/employees rejects no-cut when cut flags are enabled', async () => {
    Employee.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/payroll/employees')
      .set('x-api-key', 'test-api-key')
      .send({
        name: 'Bob',
        phone: '555-0002',
        base_salary: 28000,
        payroll_group: 'no-cut',
        has_20_deduction: true,
        has_10day_holding: false,
        has_debt_deduction: false
      })
      .expect(400);

    expect(res.body.message).toMatch(/incompatible/i);
    expect(res.body.compatible_groups).toEqual(expect.arrayContaining(['cut', 'monthly']));
    expect(Employee.create).not.toHaveBeenCalled();
  });

  test('POST /api/payroll/employees allows only monthly when debt flag is enabled', async () => {
    Employee.findOne.mockResolvedValue(null);

    const bad = await request(app)
      .post('/api/payroll/employees')
      .set('x-api-key', 'test-api-key')
      .send({
        name: 'Carol',
        phone: '555-0003',
        base_salary: 25000,
        payroll_group: 'cut',
        has_20_deduction: false,
        has_10day_holding: false,
        has_debt_deduction: true
      })
      .expect(400);

    expect(bad.body.compatible_groups).toEqual(['monthly']);

    Employee.create.mockResolvedValue({ _id: 'e3', name: 'Carol', payroll_group: 'monthly' });
    const good = await request(app)
      .post('/api/payroll/employees')
      .set('x-api-key', 'test-api-key')
      .send({
        name: 'Carol',
        phone: '555-0003',
        base_salary: 25000,
        payroll_group: 'monthly',
        has_20_deduction: false,
        has_10day_holding: false,
        has_debt_deduction: true
      })
      .expect(201);

    expect(good.body.message).toBe('Employee created');
  });
});