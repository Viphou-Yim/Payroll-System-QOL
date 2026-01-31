const { calculatePayrollForEmployee } = require('../src/services/payrollService');

describe('payrollService monthly group behavior', () => {
  test('monthly group pays full base regardless of days worked', () => {
    const emp = { base_salary: 30000, has_20_deduction: true, has_10day_holding: false };
    const res = calculatePayrollForEmployee({ employee: emp, daysWorked: 20, staticDeductions: [], saving: null, config: { roundDecimals: 2, flat20Amount: 20, holdingDays: 10, payrollGroup: 'monthly', applyCuts: true } });
    expect(res.gross).toBe(30000);
  });

  test('monthly_debt is not applied before month end', () => {
    const emp = { base_salary: 30000, has_20_deduction: false, has_10day_holding: false };
    const staticDeds = [{ type: 'monthly_debt', amount: 500 }];
    const res = calculatePayrollForEmployee({ employee: emp, daysWorked: 20, staticDeductions: staticDeds, saving: null, config: { roundDecimals: 2, payrollGroup: 'monthly' } });
    expect(res.totalDeductions).toBe(0);
    expect(res.deductionsApplied.some(d => d.type === 'monthly_debt')).toBeFalsy();
  });

  test('monthly_debt is applied at month end', () => {
    const emp = { base_salary: 30000, has_20_deduction: false, has_10day_holding: false };
    const staticDeds = [{ type: 'monthly_debt', amount: 500, reason: 'monthly loan' }];
    const res = calculatePayrollForEmployee({ employee: emp, daysWorked: 30, staticDeductions: staticDeds, saving: null, config: { roundDecimals: 2, payrollGroup: 'monthly' } });
    expect(res.totalDeductions).toBe(500);
    expect(res.deductionsApplied.some(d => d.type === 'monthly_debt')).toBeTruthy();
  });
});