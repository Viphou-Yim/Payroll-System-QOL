const { calculatePayrollForEmployee } = require('../src/services/payrollService');

describe('payrollService.calculatePayrollForEmployee', () => {
  test('Full month with flat $20 and savings', () => {
    const emp = { base_salary: 30000, has_20_deduction: true, has_10day_holding: false };
    const saving = { amount: 200, accumulated_total: 0 };

    const res = calculatePayrollForEmployee({ employee: emp, daysWorked: 30, staticDeductions: [], saving, config: { roundDecimals: 2, flat20Amount: 20, holdingDays: 10 } });

    expect(res.gross).toBe(30000);
    expect(res.totalDeductions).toBe(220);
    expect(res.net).toBe(29780);
    expect(res.deductionsApplied.some(d => d.type === 'profile_20_flat')).toBeTruthy();
    expect(res.carryoverSavings).toBe(200);
  });

  test('Partial month with 10-day holding and debt', () => {
    const emp = { base_salary: 24000, has_20_deduction: false, has_10day_holding: true };
    const staticDeds = [{ type: 'debt', amount: 500 }];

    const res = calculatePayrollForEmployee({ employee: emp, daysWorked: 20, staticDeductions: staticDeds, saving: null, config: { roundDecimals: 2, flat20Amount: 20, holdingDays: 10 } });

    // gross = 24000/30*20 = 16000
    expect(res.gross).toBe(16000);
    // hold = 24000/30*10 = 8000, debt 500
    expect(res.totalDeductions).toBe(8500);
    expect(res.net).toBe(7500);
    expect(res.withheld).toBe(8000);
  });

  test('Rounding and floor at zero', () => {
    const emp = { base_salary: 1000, has_20_deduction: true, has_10day_holding: true };
    const res = calculatePayrollForEmployee({ employee: emp, daysWorked: 7, staticDeductions: [], saving: null, config: { roundDecimals: 2, flat20Amount: 20, holdingDays: 10 } });

    // gross = 1000/30*7 = 233.333... -> 233.33
    expect(res.gross).toBe(233.33);
    // hold = 1000/30*10 = 333.333... -> 333.33, plus flat 20 => total > gross -> net 0
    expect(res.totalDeductions).toBe(353.33);
    expect(res.net).toBe(0);
  });
});
