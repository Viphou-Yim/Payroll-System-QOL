/*
  back/src/services/payrollService.js
  - logic for payroll rules kept separate for tests
  - Exports `calculatePayrollForEmployee` which takes an employee, attendance, static deductions, and saving
  - Config in `config` file (roundDecimals, flat20Amount, holdingDays)
  - Returns detailed breakdown: gross, totalDeductions, net, deductionsApplied, withheld, carryoverSavings
*/
function round(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function calculatePayrollForEmployee({ employee, daysWorked = 0, staticDeductions = [], saving = null, config = {} }) {
  const roundDecimals = typeof config.roundDecimals === 'number' ? config.roundDecimals : 2;
  const flat20Amount = typeof config.flat20Amount === 'number' ? config.flat20Amount : parseFloat(process.env.CUT_GROUP_20_DEDUCTION_AMOUNT || '20');
  const holdingDays = typeof config.holdingDays === 'number' ? config.holdingDays : parseFloat(process.env.CUT_GROUP_10DAY_HOLDING_DAYS || '10');

  const base = employee.base_salary;
  let gross = base;
  if (daysWorked < 30) {
    gross = (base / 30) * daysWorked;
  }
  gross = round(gross, roundDecimals);

  let totalDeductions = 0;
  const deductionsApplied = [];

  if (employee.has_20_deduction) {
    const amount = round(flat20Amount, roundDecimals);
    totalDeductions += amount;
    deductionsApplied.push({ type: 'profile_20_flat', amount, reason: `flat $${amount} profile deduction` });
  }

  // static deductions
  for (const d of staticDeductions || []) {
    totalDeductions += d.amount;
    deductionsApplied.push({ type: d.type, amount: d.amount, reason: d.reason || '' });
  }

  let carryoverSavings = 0;
  if (saving && saving.amount > 0) {
    totalDeductions += saving.amount;
    deductionsApplied.push({ type: 'savings', amount: saving.amount, reason: 'monthly saving' });
    carryoverSavings = round((saving.accumulated_total || 0) + saving.amount, roundDecimals);
  }

  let withheld = 0;
  if (employee.has_10day_holding) {
    const holdAmount = round((base / 30) * holdingDays, roundDecimals);
    totalDeductions += holdAmount;
    withheld = holdAmount;
    deductionsApplied.push({ type: 'hold', amount: holdAmount, reason: `${holdingDays} day holding` });
  }

  const net = round(Math.max(0, gross - totalDeductions), roundDecimals);

  return {
    gross,
    totalDeductions: round(totalDeductions, roundDecimals),
    net,
    deductionsApplied,
    withheld,
    carryoverSavings
  };
}

module.exports = { calculatePayrollForEmployee };
