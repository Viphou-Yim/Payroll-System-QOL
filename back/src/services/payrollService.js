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

function roundDown(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}

function roundUp(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

function toUtcDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function getDaysInclusive(startDate, endDate) {
  return Math.floor((endDate - startDate) / 86400000) + 1;
}

function normalizeSalaryHistory(salaryHistory = []) {
  return (Array.isArray(salaryHistory) ? salaryHistory : [])
    .map((entry) => ({
      amount: Number(entry?.amount),
      effectiveFrom: toUtcDateOnly(entry?.effective_from)
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount >= 0 && entry.effectiveFrom)
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom);
}

function getEffectiveSalaryAtDate({ baseSalary, history, targetDate }) {
  let amount = baseSalary;
  for (const row of history) {
    if (row.effectiveFrom <= targetDate) {
      amount = row.amount;
      continue;
    }
    break;
  }
  return amount;
}

function buildSalarySegments({ baseSalary, salaryHistory = [], periodStart, periodEnd }) {
  const start = toUtcDateOnly(periodStart);
  const end = toUtcDateOnly(periodEnd);
  if (!start || !end || end < start) return [];

  const history = normalizeSalaryHistory(salaryHistory);
  const starts = [start.getTime()];

  for (const row of history) {
    if (row.effectiveFrom > start && row.effectiveFrom <= end) {
      starts.push(row.effectiveFrom.getTime());
    }
  }

  const sortedStarts = Array.from(new Set(starts)).sort((a, b) => a - b);
  const segments = [];

  for (let index = 0; index < sortedStarts.length; index += 1) {
    const segmentStart = new Date(sortedStarts[index]);
    const nextStart = sortedStarts[index + 1] ? new Date(sortedStarts[index + 1]) : null;
    const segmentEnd = nextStart ? addUtcDays(nextStart, -1) : end;
    if (segmentEnd < segmentStart) continue;

    const days = getDaysInclusive(segmentStart, segmentEnd);
    const amount = getEffectiveSalaryAtDate({ baseSalary, history, targetDate: segmentStart });
    segments.push({
      startDate: segmentStart,
      endDate: segmentEnd,
      days,
      amount
    });
  }

  return segments;
}

function calculateSegmentedGross({
  baseSalary,
  salaryHistory,
  periodStart,
  periodEnd,
  normalizedWorkedDays,
  useDailyRateForPartialMonth,
  roundDecimals
}) {
  const segments = buildSalarySegments({
    baseSalary,
    salaryHistory,
    periodStart,
    periodEnd
  });

  if (!segments.length) {
    let gross = baseSalary;
    if (useDailyRateForPartialMonth && normalizedWorkedDays < 30) {
      gross = (baseSalary / 30) * normalizedWorkedDays;
    }
    return round(gross, roundDecimals);
  }

  const totalPeriodDays = segments.reduce((sum, segment) => sum + segment.days, 0);
  if (!totalPeriodDays) return round(baseSalary, roundDecimals);

  const shouldUseWorkedDays = useDailyRateForPartialMonth;
  let gross = 0;
  for (const segment of segments) {
    const workedDaysForSegment = shouldUseWorkedDays
      ? (normalizedWorkedDays * segment.days) / totalPeriodDays
      : segment.days;
    gross += (segment.amount / 30) * workedDaysForSegment;
  }

  return round(gross, roundDecimals);
}

function calculatePayrollForEmployee({ employee, daysWorked = 0, staticDeductions = [], saving = null, bonuses = [], config = {} }) {
  const roundDecimals = typeof config.roundDecimals === 'number' ? config.roundDecimals : 2;
  const workedDaysDecimals = typeof config.workedDaysDecimals === 'number' ? config.workedDaysDecimals : 1;
  const flat20Amount = typeof config.flat20Amount === 'number' ? config.flat20Amount : parseFloat(process.env.CUT_GROUP_20_DEDUCTION_AMOUNT || '20');
  const holdingDays = typeof config.holdingDays === 'number' ? config.holdingDays : parseFloat(process.env.CUT_GROUP_10DAY_HOLDING_DAYS || '10');
  // Whether to apply cut rules (flat $20 profile deduction, 10-day holding). Default true for backward compatibility
  const applyCuts = typeof config.applyCuts === 'boolean' ? config.applyCuts : true;
  const applyHolding = typeof config.applyHolding === 'boolean' ? config.applyHolding : applyCuts;
  const applySavings = typeof config.applySavings === 'boolean' ? config.applySavings : true;
  const useDailyRateForPartialMonth = typeof config.useDailyRateForPartialMonth === 'boolean' ? config.useDailyRateForPartialMonth : true;
  // payroll group (e.g., 'cut', 'no-cut', 'monthly')
  const payrollGroup = typeof config.payrollGroup === 'string' ? config.payrollGroup : 'cut';
  const payPeriodStart = config.payPeriodStart || null;
  const payPeriodEnd = config.payPeriodEnd || null;

  const base = employee.base_salary;
  const normalizedWorkedDays = roundDown(Math.max(0, Number(daysWorked) || 0), workedDaysDecimals);
  let gross = calculateSegmentedGross({
    baseSalary: base,
    salaryHistory: employee.salary_history,
    periodStart: payPeriodStart,
    periodEnd: payPeriodEnd,
    normalizedWorkedDays,
    useDailyRateForPartialMonth,
    roundDecimals
  });

  let totalBonuses = 0;
  for (const b of bonuses || []){
    totalBonuses += b.amount || 0;
  }
  gross = round(totalBonuses+ gross, roundDecimals);

  let totalDeductions = 0;
  const deductionsApplied = [];

  if (applyCuts && employee.has_20_deduction) {
    const amount = roundUp(flat20Amount, roundDecimals);
    totalDeductions += amount;
    deductionsApplied.push({ type: 'profile_20_flat', amount, reason: `flat $${amount} profile deduction` });
  }

  // static deductions
  for (const d of staticDeductions || []) {
    // monthly_debt entries are only applied when running payroll for 'monthly' group AND the month is complete (daysWorked >= 30)
    if (d.type === 'monthly_debt' && payrollGroup === 'monthly' && normalizedWorkedDays < 30) {
      // skip applying yet; will be applied when month reaches 30 days
      continue;
    }
    const deductionAmount = roundUp(d.amount || 0, roundDecimals);
    totalDeductions += deductionAmount;
    deductionsApplied.push({ type: d.type, amount: deductionAmount, reason: d.reason || '' });
  }

  let carryoverSavings = 0;
  if (applySavings && saving && saving.amount > 0) {
    const savingAmount = roundUp(saving.amount, roundDecimals);
    totalDeductions += savingAmount;
    deductionsApplied.push({ type: 'savings', amount: savingAmount, reason: 'monthly saving' });
    carryoverSavings = round((saving.accumulated_total || 0) + savingAmount, roundDecimals);
  }

  let withheld = 0;
  if (applyHolding && employee.has_10day_holding) {
    const holdAmount = roundUp((Number(base) / 30) * holdingDays, roundDecimals);
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
