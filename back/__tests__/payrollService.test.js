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
    // hold = 1000/30*10 = 333.333... -> 333.34 (rounded up), plus flat 20 => total > gross -> net 0
    expect(res.totalDeductions).toBe(353.34);
    expect(res.net).toBe(0);
  });

  test('Worked days are rounded down to one decimal for partial month', () => {
    const emp = { base_salary: 30000, has_20_deduction: false, has_10day_holding: false };
    const res = calculatePayrollForEmployee({ employee: emp, daysWorked: 15.677, staticDeductions: [], saving: null, config: { roundDecimals: 2 } });

    // daysWorked -> 15.6, daily = 30000/30 = 1000, gross = 15600
    expect(res.gross).toBe(15600);
    expect(res.net).toBe(15600);
  });

  test('No-cut group ignores profile and holding', () => {
    const emp = { base_salary: 30000, has_20_deduction: true, has_10day_holding: true };
    const res = calculatePayrollForEmployee({ employee: emp, daysWorked: 30, staticDeductions: [], saving: null, config: { roundDecimals: 2, flat20Amount: 20, holdingDays: 10, applyCuts: false } });

    expect(res.gross).toBe(30000);
    expect(res.totalDeductions).toBe(0);
    expect(res.deductionsApplied.length).toBe(0);
    expect(res.net).toBe(30000);
  });

  test('First-month partial setup can disable profile deductions and savings while using daily pay', () => {
    const emp = { base_salary: 30000, has_20_deduction: true, has_10day_holding: true };
    const saving = { amount: 200, accumulated_total: 0 };

    const res = calculatePayrollForEmployee({
      employee: emp,
      daysWorked: 20,
      staticDeductions: [],
      saving,
      config: {
        roundDecimals: 2,
        flat20Amount: 20,
        holdingDays: 10,
        useDailyRateForPartialMonth: true,
        applyCuts: false,
        applySavings: false
      }
    });

    expect(res.gross).toBe(20000);
    expect(res.totalDeductions).toBe(0);
    expect(res.net).toBe(20000);
    expect(res.withheld).toBe(0);
    expect(res.carryoverSavings).toBe(0);
  });

  test('After first full month setup can keep fixed monthly salary and enable profile deductions/savings', () => {
    const emp = { base_salary: 30000, has_20_deduction: true, has_10day_holding: true };
    const saving = { amount: 200, accumulated_total: 300 };

    const res = calculatePayrollForEmployee({
      employee: emp,
      daysWorked: 20,
      staticDeductions: [],
      saving,
      config: {
        roundDecimals: 2,
        flat20Amount: 20,
        holdingDays: 10,
        useDailyRateForPartialMonth: false,
        applyCuts: true,
        applySavings: true
      }
    });

    // gross remains fixed monthly salary even with partial days when daily-rate mode is off
    expect(res.gross).toBe(30000);
    // flat 20 + hold(10000) + saving(200)
    expect(res.totalDeductions).toBe(10220);
    expect(res.net).toBe(19780);
    expect(res.withheld).toBe(10000);
    expect(res.carryoverSavings).toBe(500);
  });

  test('Mid-period salary change is prorated by effective date for worked days', () => {
    const emp = {
      base_salary: 30000,
      salary_history: [{ amount: 36000, effective_from: '2026-01-16' }],
      has_20_deduction: false,
      has_10day_holding: false
    };

    const res = calculatePayrollForEmployee({
      employee: emp,
      daysWorked: 30,
      staticDeductions: [],
      saving: null,
      config: {
        roundDecimals: 2,
        payPeriodStart: '2026-01-01',
        payPeriodEnd: '2026-01-30',
        useDailyRateForPartialMonth: true
      }
    });

    // 15 days at 30000 + 15 days at 36000
    expect(res.gross).toBe(33000);
    expect(res.net).toBe(33000);
  });

  test('Multiple salary changes in one period are segmented correctly', () => {
    const emp = {
      base_salary: 30000,
      salary_history: [
        { amount: 33000, effective_from: '2026-01-11' },
        { amount: 36000, effective_from: '2026-01-21' }
      ],
      has_20_deduction: false,
      has_10day_holding: false
    };

    const res = calculatePayrollForEmployee({
      employee: emp,
      daysWorked: 30,
      staticDeductions: [],
      saving: null,
      config: {
        roundDecimals: 2,
        payPeriodStart: '2026-01-01',
        payPeriodEnd: '2026-01-30',
        useDailyRateForPartialMonth: true
      }
    });

    // 10 days each at 30000, 33000, 36000
    expect(res.gross).toBe(33000);
    expect(res.net).toBe(33000);
  });
});
