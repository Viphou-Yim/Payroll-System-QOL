const request = require('supertest');
const app = require('../src/app');
const Deduction = require('../src/models/Deduction');

jest.mock('../src/models/Deduction');

describe('Deductions routes (list, update, delete)', () => {
  afterEach(() => jest.resetAllMocks());

  test('GET /api/payroll/deductions returns paginated list for month and type', async () => {
    const mockList = [{ _id: 'd1', employee: { _id: 'emp1', name: 'Alice' }, type: 'monthly_debt', amount: 500, month: '2026-01' }];
    Deduction.countDocuments.mockResolvedValue(1);
    Deduction.find.mockReturnValue({ populate: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(mockList) }) }) }) });

    const res = await request(app).get('/api/payroll/deductions?month=2026-01&type=monthly_debt&page=1&limit=10').set('x-api-key', 'test-api-key').expect(200);
    expect(res.body).toHaveProperty('total', 1);
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 10);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(Deduction.find).toHaveBeenCalledWith({ month: '2026-01', type: 'monthly_debt' });
  });

  test('PATCH /api/payroll/deductions/:id updates deduction', async () => {
    const doc = { _id: 'd2', amount: 500, reason: 'loan', save: jest.fn() };
    Deduction.findById.mockResolvedValue(doc);

    const res = await request(app).patch('/api/payroll/deductions/d2').set('x-api-key', 'test-api-key').send({ amount: 600, reason: 'updated' }).expect(200);
    expect(doc.amount).toBe(600);
    expect(doc.reason).toBe('updated');
    expect(doc.save).toHaveBeenCalled();
  });

  test('DELETE /api/payroll/deductions/:id deletes deduction', async () => {
    const doc = { _id: 'd3' };
    Deduction.findByIdAndDelete.mockResolvedValue(doc);
    const res = await request(app).delete('/api/payroll/deductions/d3').set('x-api-key', 'test-api-key').expect(200);
    expect(res.body.message).toBe('Deduction deleted');
    expect(Deduction.findByIdAndDelete).toHaveBeenCalledWith('d3');
  });
});