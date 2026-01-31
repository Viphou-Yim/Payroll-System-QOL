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

function calculatePayrollForEmployee({ employee, daysWorked = 0, staticDeductions = [], saving = null, bonuses = [], config = {} }) {
  const roundDecimals = typeof config.roundDecimals === 'number' ? config.roundDecimals : 2;
  const flat20Amount = typeof config.flat20Amount === 'number' ? config.flat20Amount : parseFloat(process.env.CUT_GROUP_20_DEDUCTION_AMOUNT || '20');
  const holdingDays = typeof config.holdingDays === 'number' ? config.holdingDays : parseFloat(process.env.CUT_GROUP_10DAY_HOLDING_DAYS || '10');
  // Whether to apply cut rules (flat $20 profile deduction, 10-day holding). Default true for backward compatibility
  const applyCuts = typeof config.applyCuts === 'boolean' ? config.applyCuts : true;
  // payroll group (e.g., 'cut', 'no-cut', 'monthly')
  const payrollGroup = typeof config.payrollGroup === 'string' ? config.payrollGroup : 'cut';

  const base = employee.base_salary;
  let gross = base;
  // For 'monthly' group, pay full base regardless of days worked (monthly pays at month end)
  if (payrollGroup !== 'monthly' && daysWorked < 30) {
    gross = (base / 30) * daysWorked;
  }
  gross = round(gross, roundDecimals);

  let totalBonuses = 0;
  for (const b of bonuses || []){
    totalBonuses += b.amount || 0;
  }
  gross = round(totalBonuses+ gross, roundDecimals);

  let totalDeductions = 0;
  const deductionsApplied = [];

  if (applyCuts && employee.has_20_deduction) {
    const amount = round(flat20Amount, roundDecimals);
    totalDeductions += amount;
    deductionsApplied.push({ type: 'profile_20_flat', amount, reason: `flat $${amount} profile deduction` });
  }

  // static deductions
  for (const d of staticDeductions || []) {
    // monthly_debt entries are only applied when running payroll for 'monthly' group AND the month is complete (daysWorked >= 30)
    if (d.type === 'monthly_debt' && payrollGroup === 'monthly' && daysWorked < 30) {
      // skip applying yet; will be applied when month reaches 30 days
      continue;
    }
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
  if (applyCuts && employee.has_10day_holding) {
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
    totalBonuses,
    deductionsApplied,
    withheld,
    carryoverSavings
  };
}

module.exports = { calculatePayrollForEmployee };
