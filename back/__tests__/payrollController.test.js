const controller = require('../src/controllers/payrollController');
const Employee = require('../src/models/Employee');
const Attendance = require('../src/models/Attendance');
const Deduction = require('../src/models/Deduction');
const Saving = require('../src/models/Saving');
const PayrollRecord = require('../src/models/PayrollRecord');
const payrollService = require('../src/services/payrollService');

describe('payrollController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('generatePayrollForMonth - no-cut does not create hold deduction', async () => {
    const emp = { _id: 'emp1', base_salary: 30000, has_20_deduction: true, has_10day_holding: true };
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 30 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);
    jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 30000, totalDeductions: 0, net: 30000, deductionsApplied: [], withheld: 0, carryoverSavings: 0 });
    const deductionCreate = jest.spyOn(Deduction, 'create').mockResolvedValue({});
    const payrollRecordCreate = jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'pr1' });

    const req = { body: { month: '2026-01', payroll_group: 'no-cut' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(deductionCreate).not.toHaveBeenCalled();
    expect(payrollRecordCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-01', payroll_group: 'no-cut', count: 1 }));
  });

  test('generatePayrollForMonth - monthly does not apply monthly_debt before month end', async () => {
    const emp = { _id: 'empM1', base_salary: 30000, has_20_deduction: false, has_10day_holding: false };
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 20 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([{ type: 'monthly_debt', amount: 500 }]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);
    jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 30000, totalDeductions: 0, net: 30000, deductionsApplied: [], withheld: 0, carryoverSavings: 0 });
    const deleteMonthly = jest.spyOn(Deduction, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    const payrollRecordCreate = jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'prM1' });

    const req = { body: { month: '2026-01', payroll_group: 'monthly' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(deleteMonthly).not.toHaveBeenCalled();
    expect(payrollRecordCreate).toHaveBeenCalled();
  });

  test('generatePayrollForMonth - monthly applies and deletes monthly_debt at month end', async () => {
    const emp = { _id: 'empM2', base_salary: 30000, has_20_deduction: false, has_10day_holding: false };
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 30 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([{ type: 'monthly_debt', amount: 500, reason: 'loan' }]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);
    jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 30000, totalDeductions: 500, net: 29500, deductionsApplied: [{ type: 'monthly_debt', amount: 500, reason: 'loan' }], withheld: 0, carryoverSavings: 0 });
    const deleteMonthly = jest.spyOn(Deduction, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
    const payrollRecordCreate = jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'prM2', deductions: [{ type: 'monthly_debt', amount: 500 }] });

    const req = { body: { month: '2026-01', payroll_group: 'monthly' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(deleteMonthly).toHaveBeenCalledWith(expect.objectContaining({ employee: emp._id, month: '2026-01', type: 'monthly_debt' }));
    expect(payrollRecordCreate).toHaveBeenCalled();
  });

  test('generatePayrollForMonth - cut creates hold deduction when withheld > 0', async () => {
    const emp = { _id: 'emp2', base_salary: 24000, has_20_deduction: false, has_10day_holding: true };
    jest.spyOn(Employee, 'find').mockResolvedValue([emp]);
    jest.spyOn(Attendance, 'findOne').mockResolvedValue({ days_worked: 20 });
    jest.spyOn(Deduction, 'find').mockResolvedValue([]);
    jest.spyOn(Saving, 'findOne').mockResolvedValue(null);
    jest.spyOn(payrollService, 'calculatePayrollForEmployee').mockReturnValue({ gross: 16000, totalDeductions: 8500, net: 7500, deductionsApplied: [], withheld: 8000, carryoverSavings: 0 });
    const deductionCreate = jest.spyOn(Deduction, 'create').mockResolvedValue({});
    const payrollRecordCreate = jest.spyOn(PayrollRecord, 'create').mockResolvedValue({ id: 'pr2' });

    const req = { body: { month: '2026-01', payroll_group: 'cut' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await controller.generatePayrollForMonth(req, res);

    expect(deductionCreate).toHaveBeenCalledWith(expect.objectContaining({ employee: emp._id, type: 'hold', amount: 8000, month: '2026-01' }));
    expect(payrollRecordCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-01', payroll_group: 'cut', count: 1 }));
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
});