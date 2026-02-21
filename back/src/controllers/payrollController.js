/*
  back/src/controllers/payrollController.js
  - Controller layer: HTTP handlers for payroll operations
  - Responsibilities:
    * Batch payroll generating for a single payroll_group
    * One employee payroll run at a time
    * Can undo and Recalculate payroll for that month
    * Manage holds (list/clear) and savings (list/update)
    * Starts/stops a monthly scheduler
  - Uses `payrollService` for core calculation logic and persists payroll records & deductions
*/
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Deduction = require('../models/Deduction');
const Bonuses = require('../models/Bonuses')
const Saving = require('../models/Saving');
const PayrollRecord = require('../models/PayrollRecord');
const payrollService = require('../services/payrollService');
const schedulerService = require('../services/schedulerService');

// Configurable defaults
const ROUND_DECIMALS = parseInt(process.env.ROUND_DECIMALS || '2', 10);
const CUT_GROUP_20_DEDUCTION_AMOUNT = parseFloat(process.env.CUT_GROUP_20_DEDUCTION_AMOUNT || '20');
const CUT_GROUP_10DAY_HOLDING_DAYS = parseFloat(process.env.CUT_GROUP_10DAY_HOLDING_DAYS || '10');


// Main function: displays payroll for a month for a specific payroll group
const Idempotency = require('../models/Idempotency');

function isValidMonth(month) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function toYearMonth(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getCurrentYearMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getEmploymentPeriodConfig(employee, payrollMonth, daysWorked) {
  const startMonth = toYearMonth(employee?.start_date);
  if (!startMonth) {
    return {
      useDailyRateForPartialMonth: true,
      applyProfileDeductionsAndSavings: true
    };
  }

  const isFirstEmploymentMonth = startMonth === payrollMonth;
  const isFirstMonthPartial = isFirstEmploymentMonth && (Number(daysWorked) || 0) < 30;

  return {
    useDailyRateForPartialMonth: isFirstEmploymentMonth,
    applyProfileDeductionsAndSavings: !isFirstMonthPartial
  };
}

async function generatePayrollForMonth(req, res) {
  try {
    const { month, payroll_group, force = false } = req.body;
    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || '').toString();

    if (!month || !payroll_group) return res.status(400).json({ message: 'month and payroll_group are required (month as YYYY-MM).' });
    if (!isValidMonth(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });

    // If Idempotency-Key provided and not force, ensure not re-processing
    if (idempotencyKey && !force) {
      const existingId = await Idempotency.findOne({ key: idempotencyKey, payroll_group, month });
      if (existingId) return res.status(409).json({ message: 'Duplicate request (idempotency key) - already processed' });
    }

    // Determine whether cut rules (flat $20 / holding) should be applied for this payroll group
    const applyCutsForGroup = payroll_group !== 'no-cut';

    const employees = await Employee.find({ payroll_group, active: true });
    const results = [];

    for (const emp of employees) {
      // Idempotency: skip if payroll already exists unless force is true
      const existing = await PayrollRecord.findOne({ employee: emp._id, month });
      if (existing && !force) {
        results.push({ employee: emp._id, skipped: true, reason: 'already_generated' });
        continue;
      }

      // If force=true, revert previous state and delete existing
      if (existing && force) {
        const savingRec = await Saving.findOne({ employee: emp._id });
        if (savingRec && typeof existing.carryover_savings === 'number') {
          const prev = Math.max(0, (existing.carryover_savings || 0) - (savingRec.amount || 0));
          savingRec.accumulated_total = prev;
          await savingRec.save();
        }
        await Deduction.deleteMany({ employee: emp._id, month, type: 'hold' });
        await PayrollRecord.deleteMany({ employee: emp._id, month });
      }

      const attendance = await Attendance.findOne({ employee: emp._id, month });
      const daysWorked = attendance ? attendance.days_worked : 0;
      const bonuses = await Bonuses.find({ employee: emp._id, month });

      const staticDeds = await Deduction.find({ employee: emp._id, month });
      const saving = await Saving.findOne({ employee: emp._id });
      const employmentPeriodConfig = getEmploymentPeriodConfig(emp, month, daysWorked);
      const priorHoldRecord = await PayrollRecord.findOne({ employee: emp._id, withheld_amount: { $gt: 0 } });
      const applyHoldingForEmployee = applyCutsForGroup && employmentPeriodConfig.applyProfileDeductionsAndSavings && !priorHoldRecord;

      const calc = payrollService.calculatePayrollForEmployee({
        employee: emp,
        daysWorked,
        staticDeductions: staticDeds,
        saving,
        bonuses,
        config: {
          roundDecimals: ROUND_DECIMALS,
          flat20Amount: CUT_GROUP_20_DEDUCTION_AMOUNT,
          holdingDays: CUT_GROUP_10DAY_HOLDING_DAYS,
          applyCuts: applyCutsForGroup && employmentPeriodConfig.applyProfileDeductionsAndSavings,
          applyHolding: applyHoldingForEmployee,
          applySavings: employmentPeriodConfig.applyProfileDeductionsAndSavings,
          useDailyRateForPartialMonth: employmentPeriodConfig.useDailyRateForPartialMonth,
          payrollGroup: payroll_group
        }
      });

      // Persist changes: update saving accumulated_total and create 'hold' deduction record if withheld
      if (saving && saving.amount > 0) {
        saving.accumulated_total = calc.carryoverSavings;
        await saving.save();
      }

      if (calc.withheld > 0) {
        await Deduction.create({ employee: emp._id, type: 'hold', amount: calc.withheld, reason: `${CUT_GROUP_10DAY_HOLDING_DAYS} day holding`, month });
      }

      const payrollRecord = await PayrollRecord.create({
        employee: emp._id,
        month,
        gross_salary: calc.gross,
        total_deductions: calc.totalDeductions,
        bonuses: calc.totalBonuses ?? 0,
        net_salary: calc.net,
        deductions: calc.deductionsApplied,
        withheld_amount: calc.withheld,
        carryover_savings: calc.carryoverSavings
      });

      // If this is a monthly payroll run and monthly_debt entries were applied, remove the monthly_debt deduction records for this month
      if (payroll_group === 'monthly' && daysWorked >= 30) {
        await Deduction.deleteMany({ employee: emp._id, month, type: 'monthly_debt' });
      }

      results.push({ employee: emp._id, payrollRecord });
    }

    // Save idempotency record for this run
    if (idempotencyKey) {
      await Idempotency.findOneAndUpdate(
        { key: idempotencyKey },
        { key: idempotencyKey, payroll_group, month, createdAt: new Date() },
        { upsert: true }
      );
    }

    return res.json({ month, payroll_group, count: results.length, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Single employee payroll run
async function generatePayrollForEmployee(req, res) {
  try {
    const { employeeId, month, force = false, idempotencyKey = '' } = req.body;
    const headerKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || '').toString();
    const keyToUse = idempotencyKey || headerKey;

    if (!employeeId || !month) return res.status(400).json({ message: 'employeeId and month are required.' });
    if (!isValidMonth(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });

    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    // Idempotency check: skip if payroll exists for this employee+month unless force
    const existing = await PayrollRecord.findOne({ employee: emp._id, month });
    if (existing && !force) return res.status(409).json({ message: 'Payroll already generated for this employee and month. Use force=true to override.' });

    // If Idempotency-Key provided and not force, ensure not re-processing
    if (keyToUse && !force) {
      const existingId = await Idempotency.findOne({ key: keyToUse, payroll_group: emp.payroll_group || 'cut', month });
      if (existingId) return res.status(409).json({ message: 'Duplicate request (idempotency key) - already processed' });
    }

    if (existing && force) {
      // revert saving and remove holds before re-running
      const savingRec = await Saving.findOne({ employee: emp._id });
      if (savingRec && typeof existing.carryover_savings === 'number') {
        const prev = Math.max(0, (existing.carryover_savings || 0) - (savingRec.amount || 0));
        savingRec.accumulated_total = prev;
        await savingRec.save();
      }
      await Deduction.deleteMany({ employee: emp._id, month, type: 'hold' });
      await PayrollRecord.deleteMany({ employee: emp._id, month });
    }

    // Use the employee's payroll_group to decide whether cut rules apply (default to 'cut')
    const empPayrollGroup = emp.payroll_group || 'cut';
    const applyCutsForEmployee = empPayrollGroup !== 'no-cut';
    const bonuses = await Bonuses.find({ employee: emp._id, month });

    const attendance = await Attendance.findOne({ employee: emp._id, month });
    const daysWorked = attendance ? attendance.days_worked : 0;
    const staticDeds = await Deduction.find({ employee: emp._id, month });
    const saving = await Saving.findOne({ employee: emp._id });
    const employmentPeriodConfig = getEmploymentPeriodConfig(emp, month, daysWorked);
    const priorHoldRecord = await PayrollRecord.findOne({ employee: emp._id, withheld_amount: { $gt: 0 } });
    const applyHoldingForEmployee = applyCutsForEmployee && employmentPeriodConfig.applyProfileDeductionsAndSavings && !priorHoldRecord;

    const calc = payrollService.calculatePayrollForEmployee({
      employee: emp,
      daysWorked,
      staticDeductions: staticDeds,
      saving,
      bonuses,
      config: {
        roundDecimals: ROUND_DECIMALS,
        flat20Amount: CUT_GROUP_20_DEDUCTION_AMOUNT,
        holdingDays: CUT_GROUP_10DAY_HOLDING_DAYS,
        applyCuts: applyCutsForEmployee && employmentPeriodConfig.applyProfileDeductionsAndSavings,
        applyHolding: applyHoldingForEmployee,
        applySavings: employmentPeriodConfig.applyProfileDeductionsAndSavings,
        useDailyRateForPartialMonth: employmentPeriodConfig.useDailyRateForPartialMonth,
        payrollGroup: empPayrollGroup
      }
    });

    if (saving && saving.amount > 0) {
      saving.accumulated_total = calc.carryoverSavings;
      await saving.save();
    }

    if (calc.withheld > 0) {
      await Deduction.create({ employee: emp._id, type: 'hold', amount: calc.withheld, reason: `${CUT_GROUP_10DAY_HOLDING_DAYS} day holding`, month });
    }

    const payrollRecord = await PayrollRecord.create({
      employee: emp._id,
      month,
      gross_salary: calc.gross,
      total_deductions: calc.totalDeductions,
      bonuses: calc.totalBonuses ?? 0,
      net_salary: calc.net,
      deductions: calc.deductionsApplied,
      withheld_amount: calc.withheld,
      carryover_savings: calc.carryoverSavings
    });

    // If this is a monthly payroll run and monthly_debt entries were applied, remove the monthly_debt deduction records for this month
    if (empPayrollGroup === 'monthly' && daysWorked >= 30) {
      await Deduction.deleteMany({ employee: emp._id, month, type: 'monthly_debt' });
    }

    // Persist idempotency record for this run if key provided
    if (keyToUse) {
      await Idempotency.findOneAndUpdate(
        { key: keyToUse },
        { key: keyToUse, payroll_group: empPayrollGroup, month, createdAt: new Date() },
        { upsert: true }
      );
    }

    return res.json({ payrollRecord });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Scheduler: start monthly job (persisted)
async function startMonthlyScheduler(req, res) {
  try {
    const { payroll_group, cronExpression } = req.body;
    const group = payroll_group || 'cut';
    const expr = cronExpression || '0 5 1 * *'; // at 05:00 on day 1 of every month

    // start & persist scheduler via service; provide job runner
    const cfg = await schedulerService.start({
      payroll_group: group,
      cronExpression: expr,
      jobRunner: async (groupName) => {
        const month = new Date().toISOString().slice(0,7);
        console.log('Running scheduled payroll for', groupName, 'month', month);
        await module.exports.generatePayrollForMonth({ body: { month, payroll_group: groupName } }, { json: () => {} });
      }
    });

    return res.json({ message: 'Scheduler started', cron: cfg.cronExpression, payroll_group: cfg.payroll_group });
  } catch (err) {
    console.error('startMonthlyScheduler error', err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

async function stopScheduler(req, res) {
  try {
    const { payroll_group } = req.body || {};
    const group = payroll_group || 'cut';
    const cfg = await schedulerService.stop(group);
    if (!cfg) return res.status(400).json({ message: 'No scheduler found for group' });
    return res.json({ message: 'Scheduler stopped', payroll_group: cfg.payroll_group });
  } catch (err) {
    console.error('stopScheduler error', err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

function getSchedulerStatus(req, res) {
  const { payroll_group } = req.query;
  return res.json(schedulerService.getStatus(payroll_group));
}

async function getPayrollRecords(req, res) {
  const { month } = req.query;
  const query = month ? { month } : {};
  const records = await PayrollRecord.find(query).populate('employee');
  res.json(records);
}

// Update a single payroll record fields
async function updatePayrollRecord(req, res) {
  try {
    const { id } = req.params;
    const fields = ['gross_salary', 'total_deductions', 'net_salary', 'bonuses', 'withheld_amount', 'carryover_savings'];
    const update = {};
    for (const f of fields) {
      if (typeof req.body[f] === 'number' && !Number.isNaN(req.body[f])) {
        update[f] = req.body[f];
      }
    }
    const rec = await PayrollRecord.findByIdAndUpdate(id, update, { new: true });
    if (!rec) return res.status(404).json({ message: 'record not found' });
    return res.json(rec);
  } catch (err) {
    console.error('updatePayrollRecord error', err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Delete a single payroll record and revert related effects
async function deletePayrollRecord(req, res) {
  try {
    const { id } = req.params;
    const record = await PayrollRecord.findById(id).populate('employee');
    if (!record) return res.status(404).json({ message: 'record not found' });

    const emp = record.employee;
    if (emp) {
      const saving = await Saving.findOne({ employee: emp._id });
      if (saving && typeof record.carryover_savings === 'number') {
        const prev = Math.max(0, (record.carryover_savings || 0) - (saving.amount || 0));
        saving.accumulated_total = prev;
        await saving.save();
      }

      if (Array.isArray(record.deductions)) {
        for (const d of record.deductions) {
          if (d.type === 'monthly_debt') {
            await Deduction.create({ employee: emp._id, type: 'monthly_debt', amount: d.amount, reason: d.reason || 'restored from delete', month: record.month });
          }
        }
      }

      await Deduction.deleteMany({ employee: emp._id, month: record.month, type: 'hold' });
    }

    await PayrollRecord.deleteOne({ _id: id });
    return res.json({ message: 'record deleted' });
  } catch (err) {
    console.error('deletePayrollRecord error', err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Server-side CSV export for payroll records. Supports ?month=YYYY-MM
async function exportPayrollCsv(req, res) {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ message: 'month is required (YYYY-MM)' });

    const query = { month };
    const records = await PayrollRecord.find(query).populate('employee');

    const header = ['Employee','EmployeeId','Month','Gross','TotalDeductions','Net','Withheld','CarryoverSavings','Bonuses','DeductionsJSON'];
    const rows = [header.join(',')];

    for (const r of records) {
      const emp = r.employee ? r.employee.name : (r.employee || '');
      const empId = r.employee && r.employee._id ? r.employee._id : (r.employee || '');
      const deductionsJson = JSON.stringify(r.deductions || []);
      const cells = [emp, empId, r.month, r.gross_salary, r.total_deductions, r.net_salary, r.withheld_amount, r.carryover_savings, r.bonuses, deductionsJson];
      const escaped = cells.map(v => {
        if (v === null || v === undefined) return '';
        const s = typeof v === 'string' ? v : String(v);
        if (s.includes(',') || s.includes('\n') || s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      });
      rows.push(escaped.join(','));
    }

    const csv = rows.join('\n');
    const filename = `payroll_records_${month}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error('exportPayrollCsv error', err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Undo payroll for a month: delete payroll records, remove holds created for that month, and revert savings
async function undoPayrollForMonth(req, res) {
  try {
    const { month, payroll_group } = req.body;
    if (!month) return res.status(400).json({ message: 'month is required (YYYY-MM).' });

    // Find payroll records for month
    const records = await PayrollRecord.find({ month }).populate('employee');
    const employeeIds = records.map(r => (r.employee ? r.employee._id : r.employee));

    // Revert savings for each record
    for (const r of records) {
      const emp = r.employee;
      if (!emp) continue;
      const saving = await Saving.findOne({ employee: emp._id });
      if (saving && typeof r.carryover_savings === 'number') {
        // previous accumulated total should be carryover_savings - saving.amount
        const prev = Math.max(0, (r.carryover_savings || 0) - (saving.amount || 0));
        saving.accumulated_total = prev;
        await saving.save();
      }

      // Re-create monthly_debt deductions from payroll record deductions if they were applied during generation
      if (Array.isArray(r.deductions)) {
        for (const d of r.deductions) {
          if (d.type === 'monthly_debt') {
            // recreate the monthly debt deduction record for the employee and month
            await Deduction.create({ employee: emp._id, type: 'monthly_debt', amount: d.amount, reason: d.reason || 'restored from undo', month });
          }
        }
      }
    }

    // Delete hold deductions created for this month because '10-day holding' or type 'hold'
    const deleteHolds = await Deduction.deleteMany({ employee: { $in: employeeIds }, month, type: 'hold' });

    // Delete payroll records
    const deleteRecords = await PayrollRecord.deleteMany({ month });

    return res.json({ message: 'Undo complete', deletedPayrollRecords: deleteRecords.deletedCount, deletedHoldDeductions: deleteHolds.deletedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Recalculate: undo then generate
async function recalculatePayrollForMonth(req, res) {
  try {
    const { month, payroll_group } = req.body;
    if (!month || !payroll_group) return res.status(400).json({ message: 'month and payroll_group are required.' });

    // Undo (call via exports so tests can spy/mocking work correctly)
    await module.exports.undoPayrollForMonth({ body: { month, payroll_group } }, { json: () => {} });
    // Generate
    return await module.exports.generatePayrollForMonth({ body: { month, payroll_group } }, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Holds listing
async function getHolds(req, res) {
  const { month } = req.query;
  const q = { type: 'hold' };
  if (month) q.month = month;
  const holds = await Deduction.find(q).populate('employee');
  res.json(holds);
}

// Employees list for admin UI
async function listEmployees(req, res) {
  try {
    const employees = await Employee.find({ active: true }).select('_id name payroll_group phone base_salary');
    return res.json(employees);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Employees list including active/inactive (for employees management table)
async function listAllEmployees(req, res) {
  try {
    const employees = await Employee.find({}).select('_id name payroll_group phone active base_salary has_20_deduction has_10day_holding has_debt_deduction start_date').sort({ name: 1 });
    return res.json(employees);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Update employee profile fields (admin)
async function updateEmployee(req, res) {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const {
      name,
      phone,
      base_salary,
      payroll_group,
      has_20_deduction,
      has_10day_holding,
      has_debt_deduction,
      start_date
    } = req.body || {};

    const nextName = name === undefined ? employee.name : String(name || '').trim();
    const nextPhone = phone === undefined ? employee.phone : String(phone || '').trim();
    const nextGroup = payroll_group === undefined ? employee.payroll_group : String(payroll_group || '').trim();
    const nextBaseSalary = base_salary === undefined ? Number(employee.base_salary) : Number(base_salary);
    const nextHas20 = has_20_deduction === undefined ? !!employee.has_20_deduction : !!has_20_deduction;
    const nextHas10dayHolding = has_10day_holding === undefined ? !!employee.has_10day_holding : !!has_10day_holding;
    const nextHasDebt = has_debt_deduction === undefined ? !!employee.has_debt_deduction : !!has_debt_deduction;

    if (!nextName) return res.status(400).json({ message: 'name is required' });
    if (Number.isNaN(nextBaseSalary)) return res.status(400).json({ message: 'base_salary must be a number' });

    const allowed = ['cut', 'no-cut', 'monthly'];
    if (!allowed.includes(nextGroup)) {
      return res.status(400).json({ message: `payroll_group must be one of: ${allowed.join(', ')}` });
    }
    if ((nextHas20 || nextHas10dayHolding) && nextGroup === 'no-cut') {
      return res.status(400).json({
        message: 'payroll_group "no-cut" is incompatible with selected payroll flags',
        compatible_groups: ['cut', 'monthly']
      });
    }

    const duplicate = await Employee.findOne({
      _id: { $ne: id },
      name: nextName,
      phone: nextPhone,
      active: true
    });
    if (duplicate) {
      return res.status(409).json({ message: 'Another active employee already has the same name + phone' });
    }

    const update = {
      name: nextName,
      phone: nextPhone,
      base_salary: nextBaseSalary,
      payroll_group: nextGroup,
      has_20_deduction: nextHas20,
      has_10day_holding: nextHas10dayHolding,
      has_debt_deduction: nextHasDebt
    };

    if (start_date !== undefined) {
      update.start_date = start_date ? new Date(start_date) : null;
    }

    const updated = await Employee.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .select('_id name payroll_group phone active base_salary has_20_deduction has_10day_holding has_debt_deduction start_date');

    return res.json({ message: 'Employee updated', employee: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Update employee active status
async function updateEmployeeStatus(req, res) {
  try {
    const { id } = req.params;
    const { active } = req.body || {};
    if (typeof active !== 'boolean') {
      return res.status(400).json({ message: 'active (boolean) is required' });
    }

    const employee = await Employee.findByIdAndUpdate(
      id,
      { active },
      { new: true, runValidators: true }
    ).select('_id name payroll_group phone active');

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    let released_hold_amount = 0;
    if (active === false) {
      const holds = await Deduction.find({ employee: id, type: 'hold' });
      released_hold_amount = (holds || []).reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
      if (released_hold_amount > 0) {
        await Bonuses.create({
          employee: id,
          amount: released_hold_amount,
          reason: '10-day holding payout on exit',
          month: getCurrentYearMonth()
        });
        await Deduction.deleteMany({ employee: id, type: 'hold' });
      }
    }

    return res.json({ message: 'Employee status updated', employee, released_hold_amount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

async function payoutSavingsForFestival(req, res) {
  try {
    const { festival, month, employeeId } = req.body || {};
    const allowed = ['khmer_new_year', 'pchum_ben'];
    if (!festival || !allowed.includes(festival)) {
      return res.status(400).json({ message: `festival must be one of: ${allowed.join(', ')}` });
    }
    if (!month || !isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    let savings = [];
    if (employeeId) {
      const oneSaving = await Saving.findOne({ employee: employeeId });
      savings = oneSaving ? [oneSaving] : [];
    } else {
      savings = await Saving.find({ accumulated_total: { $gt: 0 } });
    }

    let totalPayout = 0;
    let employeesPaid = 0;
    for (const saving of savings) {
      if (!saving || (Number(saving.accumulated_total) || 0) <= 0) continue;
      const amount = Number(saving.accumulated_total) || 0;
      await Bonuses.create({
        employee: saving.employee,
        amount,
        reason: `Savings payout (${festival})`,
        month
      });
      saving.accumulated_total = 0;
      await saving.save();
      totalPayout += amount;
      employeesPaid += 1;
    }

    return res.json({ message: 'Savings payout completed', festival, month, employees_paid: employeesPaid, total_payout: totalPayout });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}


// Create employee (admin)
async function createEmployee(req, res) {
  try {
    const {
      name,
      phone = '',
      base_salary,
      payroll_group,
      has_20_deduction = false,
      has_10day_holding = false,
      has_debt_deduction = false,
      start_date,
      active = true
    } = req.body || {};

    if (!name || typeof name !== 'string') return res.status(400).json({ message: 'name is required' });
    if (base_salary === undefined || base_salary === null || Number.isNaN(Number(base_salary))) {
      return res.status(400).json({ message: 'base_salary is required and must be a number' });
    }
    const pg = String(payroll_group || '').trim();
    if (!pg) return res.status(400).json({ message: 'payroll_group is required' });
    const allowed = ['cut','no-cut','monthly'];
    if (!allowed.includes(pg)) return res.status(400).json({ message: `payroll_group must be one of: ${allowed.join(', ')}` });

    const has20 = !!has_20_deduction;
    const has10dayHolding = !!has_10day_holding;
    const hasDebt = !!has_debt_deduction;

    const compatibleGroups = allowed.filter((group) => {
      if ((has20 || has10dayHolding) && group === 'no-cut') return false;
      return true;
    });

    if (!compatibleGroups.includes(pg)) {
      return res.status(400).json({
        message: `payroll_group "${pg}" is incompatible with selected payroll flags`,
        compatible_groups: compatibleGroups
      });
    }

    // basic duplicate guard (name+phone)
    const existing = await Employee.findOne({ name: name.trim(), phone: phone.trim(), active: true });
    if (existing) return res.status(409).json({ message: 'Employee already exists (same name + phone)' });

    const emp = await Employee.create({
      name: name.trim(),
      phone: phone.trim(),
      base_salary: Number(base_salary),
      payroll_group: pg,
      has_20_deduction: has20,
      has_10day_holding: has10dayHolding,
      has_debt_deduction: hasDebt,
      start_date: start_date ? new Date(start_date) : undefined,
      active: !!active
    });

    return res.status(201).json({ message: 'Employee created', employee: emp });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// delete a hold payroll by id
async function clearHold(req, res) {
  try {
    const { deductionId } = req.body;
    if (!deductionId) return res.status(400).json({ message: 'deductionId is required' });
    const d = await Deduction.findByIdAndDelete(deductionId);
    if (!d) return res.status(404).json({ message: 'Hold not found' });
    return res.json({ message: 'Hold cleared', deduction: d });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Attendance endpoints
async function upsertAttendance(req, res) {
  try {
    const {
      employeeId,
      month,
      days_worked,
      days_absent = 0,
      extra_deduction_amount = 0,
      penalty_amount = 0
    } = req.body;
    if (!employeeId || !month || typeof days_worked !== 'number') return res.status(400).json({ message: 'employeeId, month, and days_worked (number) are required' });
    if (!isValidMonth(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });
    if (days_worked < 0 || days_worked > 31) return res.status(400).json({ message: 'days_worked must be between 0 and 31' });
    if (days_absent < 0) return res.status(400).json({ message: 'days_absent must be non-negative' });
    if (Number(extra_deduction_amount) < 0) return res.status(400).json({ message: 'extra_deduction_amount must be non-negative' });
    if (Number(penalty_amount) < 0) return res.status(400).json({ message: 'penalty_amount must be non-negative' });

    const roundedDaysWorked = Math.floor(days_worked * 10) / 10;
    const roundedDaysAbsent = Math.ceil((Number(days_absent) || 0) * 10) / 10;
    const roundedExtraDeduction = Math.ceil((Number(extra_deduction_amount) || 0) * 100) / 100;
    const roundedPenalty = Math.ceil((Number(penalty_amount) || 0) * 100) / 100;

    // ensure employee exists
    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    const rec = await Attendance.findOneAndUpdate(
      { employee: employeeId, month },
      { days_worked: roundedDaysWorked, days_absent: roundedDaysAbsent },
      { upsert: true, new: true }
    );

    const attendanceExtraReason = 'Attendance extra deduction';
    const attendancePenaltyReason = 'Attendance penalty';

    if (roundedExtraDeduction > 0) {
      await Deduction.findOneAndUpdate(
        { employee: employeeId, month, type: 'other', reason: attendanceExtraReason },
        { amount: roundedExtraDeduction },
        { upsert: true, new: true }
      );
    } else {
      await Deduction.deleteOne({ employee: employeeId, month, type: 'other', reason: attendanceExtraReason });
    }

    if (roundedPenalty > 0) {
      await Deduction.findOneAndUpdate(
        { employee: employeeId, month, type: 'damage', reason: attendancePenaltyReason },
        { amount: roundedPenalty },
        { upsert: true, new: true }
      );
    } else {
      await Deduction.deleteOne({ employee: employeeId, month, type: 'damage', reason: attendancePenaltyReason });
    }

    return res.json({
      message: 'Attendance saved',
      record: rec,
      extra_deduction_amount: roundedExtraDeduction,
      penalty_amount: roundedPenalty
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

async function listAttendance(req, res) {
  try {
    const { employeeId, month } = req.query;
    const q = {};
    if (employeeId) q.employee = employeeId;
    if (month) q.month = month;
    const list = await Attendance.find(q).populate('employee');
    return res.json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Savings endpoints
async function getSavings(req, res) {
  const savings = await Saving.find({}).populate('employee');
  res.json(savings);
}

async function updateSaving(req, res) {
  try {
    const { employeeId } = req.params;
    const { amount, resetAccumulated } = req.body;
    const saving = await Saving.findOne({ employee: employeeId });
    if (!saving) return res.status(404).json({ message: 'Saving record not found for employee' });
    if (typeof amount === 'number') {
      saving.amount = amount;
    }
    if (resetAccumulated) {
      saving.accumulated_total = 0;
    }
    await saving.save();
    return res.json({ message: 'Saving updated', saving });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Create a generic deduction record (supports `monthly_debt`)
async function createDeduction(req, res) {
  try {
    const { employeeId, type, amount, reason, month } = req.body;
    if (!employeeId || !type || typeof amount !== 'number' || !month) return res.status(400).json({ message: 'employeeId, type, amount (number), and month (YYYY-MM) are required' });
    const d = await Deduction.create({ employee: employeeId, type, amount, reason, month });
    return res.json({ message: 'Deduction created', deduction: d });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// List deductions (filter by month and/or type)
async function listDeductions(req, res) {
  try {
    const { month, type, page = '1', limit = '20', employeeName } = req.query;
    const q = {};
    if (month) q.month = month;
    if (type) q.type = type;

    // If employeeName filter is provided, find employee ids matching the name
    if (employeeName) {
      const employees = await Employee.find({ name: new RegExp(employeeName, 'i') }, '_id');
      const ids = employees.map(e => e._id);
      q.employee = { $in: ids };
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

    const total = await Deduction.countDocuments(q);
    const pages = Math.ceil(total / lim) || 1;

    const listQuery = Deduction.find(q).populate('employee').skip((p - 1) * lim).limit(lim).sort({ createdAt: -1 });
    const list = await listQuery;

    return res.json({ total, page: p, limit: lim, pages, data: list });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Update a deduction (amount, reason)
async function updateDeduction(req, res) {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const d = await Deduction.findById(id);
    if (!d) return res.status(404).json({ message: 'Deduction not found' });
    if (typeof amount === 'number') d.amount = amount;
    if (typeof reason === 'string') d.reason = reason;
    await d.save();
    return res.json({ message: 'Deduction updated', deduction: d });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Delete a deduction by id
async function deleteDeduction(req, res) {
  try {
    const { id } = req.params;
    const d = await Deduction.findByIdAndDelete(id);
    if (!d) return res.status(404).json({ message: 'Deduction not found' });
    return res.json({ message: 'Deduction deleted', deduction: d });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Create a bonus record
async function createBonus(req, res) {
  try {
    const { employeeId, type, amount, reason, month } = req.body;
    if (!employeeId || typeof amount !== 'number' || !month) return res.status(400).json({ message: 'employeeId, type, amount (number), and month (YYYY-MM) are required' });
    const d = await Bonuses.create({ employee: employeeId, amount, reason, month });
    return res.json({ message: 'Bonus has been added', bonuses: d });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Delete a bonus record
async function deleteBonus(req, res) {
  try {
    const { id } = req.params;
    const bonus = await Bonuses.findByIdAndDelete(id);
    if (!bonus) return res.status(404).json({ message: 'Bonus not found' });
    return res.json({ message: 'Bonus deleted', bonus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

module.exports = {
  generatePayrollForMonth,
  getPayrollRecords,
  updatePayrollRecord,
  deletePayrollRecord,
  exportPayrollCsv,
  generatePayrollForEmployee,
  startMonthlyScheduler,
  stopScheduler,
  getSchedulerStatus,
  undoPayrollForMonth,
  recalculatePayrollForMonth,
  getHolds,
  clearHold,
  listEmployees,
  listAllEmployees,
  updateEmployee,
  updateEmployeeStatus,
  createEmployee,
  getSavings,
  updateSaving,
  payoutSavingsForFestival,
  upsertAttendance,
  listAttendance,
  createDeduction,
  listDeductions,
  updateDeduction,
  deleteDeduction,
  createBonus,
  deleteBonus
};
