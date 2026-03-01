const controller = require('../src/controllers/payrollController');
const Employee = require('../src/models/Employee');
const Attendance = require('../src/models/Attendance');
const Deduction = require('../src/models/Deduction');
const Saving = require('../src/models/Saving');
const PayrollRecord = require('../src/models/PayrollRecord');
const Idempotency = require('../src/models/Idempotency');
const Bonuses = require('../src/models/Bonuses');
const payrollService = require('../src/services/payrollService');

jest.mock('../src/models/Idempotency');
jest.mock('../src/models/PayrollRecord');
jest.mock('../src/models/Deduction');
jest.mock('../src/models/Bonuses');

describe('payrollController', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mocks for models
    jest.spyOn(Idempotency, 'findOne').mockResolvedValue(null);
    jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'pr1' });
    jest.spyOn(Deduction, 'create').mockResolvedValue({ id: 'd1' });
    jest.spyOn(Deduction, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('generatePayrollForMonth - no-cut does not create hold deduction', async () => {
    const emp = { _id: 'emp1', base_salary: 30000, has_20_deduction: true, has_10day_holding: true };
    jest.spyOn(Idempotency, 'findOne').mockResolvedValue(null);
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 30 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);
    jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 30000, totalDeductions: 0, net: 30000, deductionsApplied: [], withheld: 0, carryoverSavings: 0 });
    const deductionCreate = jest.spyOn(Deduction, 'create').mockResolvedValue({});
    const payrollRecordCreate = jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'pr1' });

    const req = { body: { month: '2026-01', payroll_group: 'no-cut' }, headers: {} };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(deductionCreate).not.toHaveBeenCalled();
    expect(payrollRecordCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-01', payroll_group: 'no-cut', count: 1 }));
  });

  test('generatePayrollForMonth - monthly does not apply monthly_debt before month end', async () => {
    const emp = { _id: 'empM1', base_salary: 30000, has_20_deduction: false, has_10day_holding: false };
    jest.spyOn(Idempotency, 'findOne').mockResolvedValue(null);
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 20 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([{ type: 'monthly_debt', amount: 500 }]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);
    jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 30000, totalDeductions: 0, net: 30000, deductionsApplied: [], withheld: 0, carryoverSavings: 0 });
    const deleteMonthly = jest.spyOn(Deduction, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    const payrollRecordCreate = jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'prM1' });

    const req = { body: { month: '2026-01', payroll_group: 'monthly' }, headers: {} };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(deleteMonthly).not.toHaveBeenCalled();
    expect(payrollRecordCreate).toHaveBeenCalled();
  });

  test('generatePayrollForMonth - monthly applies and deletes monthly_debt at month end', async () => {
    const emp = { _id: 'empM2', base_salary: 30000, has_20_deduction: false, has_10day_holding: false };
    jest.spyOn(Idempotency, 'findOne').mockResolvedValue(null);
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 30 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([{ type: 'monthly_debt', amount: 500, reason: 'loan' }]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);
    jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 30000, totalDeductions: 500, net: 29500, deductionsApplied: [{ type: 'monthly_debt', amount: 500, reason: 'loan' }], withheld: 0, carryoverSavings: 0 });
    const deleteMonthly = jest.spyOn(Deduction, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
    const payrollRecordCreate = jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'prM2', deductions: [{ type: 'monthly_debt', amount: 500 }] });

    const req = { body: { month: '2026-01', payroll_group: 'monthly' }, headers: {} };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(deleteMonthly).toHaveBeenCalledWith(expect.objectContaining({ employee: emp._id, month: '2026-01', type: 'monthly_debt' }));
    expect(payrollRecordCreate).toHaveBeenCalled();
  });

  test('generatePayrollForMonth - cut creates hold deduction when withheld > 0', async () => {
    const emp = { _id: 'emp2', base_salary: 24000, has_20_deduction: false, has_10day_holding: true };
    jest.spyOn(Idempotency, 'findOne').mockResolvedValue(null);
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 20 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);
    jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 16000, totalDeductions: 8500, net: 7500, deductionsApplied: [], withheld: 8000, carryoverSavings: 0 });
    const deductionCreate = jest.spyOn(Deduction, 'create').mockResolvedValue({});
    const payrollRecordCreate = jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'pr2' });

    const req = { body: { month: '2026-01', payroll_group: 'cut' }, headers: {} };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(deductionCreate).toHaveBeenCalledWith(expect.objectContaining({ employee: emp._id, type: 'hold', amount: 8000, month: '2026-01' }));
    expect(payrollRecordCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-01', payroll_group: 'cut', count: 1 }));
  });

  test('generatePayrollForMonth - does not re-apply 10-day hold when prior hold already exists', async () => {
    const emp = { _id: 'empHold1', base_salary: 24000, has_20_deduction: false, has_10day_holding: true };
    jest.spyOn(Idempotency, 'findOne').mockResolvedValue(null);
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 30 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);

    const payrollFindOne = jest.spyOn(PayrollRecord, 'findOne');
    payrollFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'old-pr', employee: 'empHold1', withheld_amount: 8000 });

    const calcSpy = jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 24000, totalDeductions: 0, net: 24000, deductionsApplied: [], withheld: 0, carryoverSavings: 0 });
    const deductionCreate = jest.spyOn(Deduction, 'create').mockResolvedValue({});
    jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'prHold1' });

    const req = { body: { month: '2026-02', payroll_group: 'cut' }, headers: {} };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(calcSpy).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ applyHolding: false }) }));
    expect(deductionCreate).not.toHaveBeenCalled();
  });

  test('generatePayrollForMonth - does not apply 10-day hold outside first employment month', async () => {
    const emp = {
      _id: 'empHold2',
      base_salary: 24000,
      has_20_deduction: false,
      has_10day_holding: true,
      start_date: '2026-01-05T00:00:00.000Z'
    };
    jest.spyOn(Idempotency, 'findOne').mockResolvedValue(null);
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 30 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);

    const payrollFindOne = jest.spyOn(PayrollRecord, 'findOne');
    payrollFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const calcSpy = jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 24000, totalDeductions: 0, net: 24000, deductionsApplied: [], withheld: 0, carryoverSavings: 0 });
    const deductionCreate = jest.spyOn(Deduction, 'create').mockResolvedValue({});
    jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'prHold2' });

    const req = { body: { month: '2026-02', payroll_group: 'cut' }, headers: {} };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(calcSpy).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ applyHolding: false }) }));
    expect(deductionCreate).not.toHaveBeenCalled();
  });

  test('recalculatePayrollForMonth calls undo and generate', async () => {
    const undoSpy = jest.spyOn(controller, 'undoPayrollForMonth').mockResolvedValue();
    const genSpy = jest.spyOn(controller, 'generatePayrollForMonth').mockResolvedValue();
    const req = { body: { month: '2026-01', payroll_group: 'no-cut' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.recalculatePayrollForMonth(req, res);

    expect(undoSpy).toHaveBeenCalled();
    expect(genSpy).toHaveBeenCalled();
  });

  test('undoPayrollForMonth reverts savings and deletes holds/records', async () => {
    const emp = { _id: 'emp3' };
    const record = { employee: emp, carryover_savings: 500 };
    // find and populate this is used in controller
    jest.spyOn(PayrollRecord, 'find').mockReturnValue({ populate: jest.fn().mockResolvedValue([record]) });
    const savingDoc = { employee: emp._id, amount: 200, accumulated_total: 700, save: jest.fn() };
    jest.spyOn(Saving, 'findOne').mockResolvedValue(savingDoc);
    jest.spyOn(Deduction, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
    jest.spyOn(PayrollRecord, 'deleteMany').mockResolvedValue({ deletedCount: 1 });

    const req = { body: { month: '2026-01' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.undoPayrollForMonth(req, res);

    expect(savingDoc.accumulated_total).toBe(300);
    expect(savingDoc.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Undo complete', deletedPayrollRecords: 1, deletedHoldDeductions: 1 }));
  });

  test('updateEmployeeStatus releases held salary as bonus when employee becomes inactive', async () => {
    const employeeDoc = { _id: 'empX', name: 'Exit User', active: false };
    const updateChain = { select: jest.fn().mockResolvedValue(employeeDoc) };
    jest.spyOn(Employee, 'findByIdAndUpdate').mockReturnValue(updateChain);
    jest.spyOn(Deduction, 'find').mockResolvedValue([{ amount: 500 }, { amount: 1000 }]);
    const bonusCreate = jest.spyOn(Bonuses, 'create').mockResolvedValue({ _id: 'b1' });
    const dedDelete = jest.spyOn(Deduction, 'deleteMany').mockResolvedValue({ deletedCount: 2 });

    const req = { params: { id: 'empX' }, body: { active: false } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.updateEmployeeStatus(req, res);

    expect(bonusCreate).toHaveBeenCalledWith(expect.objectContaining({ employee: 'empX', amount: 1500, reason: '10-day holding payout on exit' }));
    expect(dedDelete).toHaveBeenCalledWith({ employee: 'empX', type: 'hold' });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ released_hold_amount: 1500 }));
  });

  test('payoutSavingsForFestival creates payout bonus and resets accumulated savings', async () => {
    const savingDoc = { employee: 'emp1', accumulated_total: 240, save: jest.fn() };
    jest.spyOn(Saving, 'find').mockResolvedValue([savingDoc]);
    const bonusCreate = jest.spyOn(Bonuses, 'create').mockResolvedValue({ _id: 'bonus1' });

    const req = { body: { festival: 'khmer_new_year', month: '2026-04' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.payoutSavingsForFestival(req, res);

    expect(bonusCreate).toHaveBeenCalledWith(expect.objectContaining({ employee: 'emp1', amount: 240, month: '2026-04' }));
    expect(savingDoc.accumulated_total).toBe(0);
    expect(savingDoc.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ employees_paid: 1, total_payout: 240 }));
  });
});