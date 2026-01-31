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
const cron = require('node-cron');

// Configurable defaults
const ROUND_DECIMALS = parseInt(process.env.ROUND_DECIMALS || '2', 10);
const CUT_GROUP_20_DEDUCTION_AMOUNT = parseFloat(process.env.CUT_GROUP_20_DEDUCTION_AMOUNT || '20');
const CUT_GROUP_10DAY_HOLDING_DAYS = parseFloat(process.env.CUT_GROUP_10DAY_HOLDING_DAYS || '10');

let schedulerJob = null;

// Main function: displays payroll for a month for a specific payroll group
async function generatePayrollForMonth(req, res) {
  try {
    const { month, payroll_group } = req.body;
    if (!month || !payroll_group) return res.status(400).json({ message: 'month and payroll_group are required (month as YYYY-MM).' });

    // Determine whether cut rules (flat $20 / holding) should be applied for this payroll group
    const applyCutsForGroup = payroll_group !== 'no-cut';

    const employees = await Employee.find({ payroll_group, active: true });
    const results = [];

    for (const emp of employees) {
      const attendance = await Attendance.findOne({ employee: emp._id, month });
      const daysWorked = attendance ? attendance.days_worked : 0;
      const bonuses = await Bonuses.find({ employee: emp._id, month });

      const staticDeds = await Deduction.find({ employee: emp._id, month });
      const saving = await Saving.findOne({ employee: emp._id });

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
          applyCuts: applyCutsForGroup,
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
        bonuses: calc.totalBonuses,
        net_salary: calc.net,
        deductions: calc.deductionsApplied,
        withheld_amount: calc.withheld,
        carryover_savings: calc.carryoverSavings
      });

      // If this is a monthly payroll run and monthly_debt entries were applied, remove the monthly_debt deduction records for this month
      if (payroll_group === 'monthly' && daysWorked >= 30) {
        const monthlyDebtDeleted = await Deduction.deleteMany({ employee: emp._id, month, type: 'monthly_debt' });
        // Add a note to deductionsApplied if the service didn't include it (it will already be included when applied)
        // (we keep this to ensure applied monthly debts are removed from future runs)
      }

      results.push({ employee: emp._id, payrollRecord });
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
    const { employeeId, month } = req.body;
    if (!employeeId || !month) return res.status(400).json({ message: 'employeeId and month are required.' });

    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    // Use the employee's payroll_group to decide whether cut rules apply (default to 'cut')
    const empPayrollGroup = emp.payroll_group || 'cut';
    const applyCutsForEmployee = empPayrollGroup !== 'no-cut';
    const bonuses = await Bonuses.find({ employee: emp._id, month });

    const attendance = await Attendance.findOne({ employee: emp._id, month });
    const daysWorked = attendance ? attendance.days_worked : 0;
    const staticDeds = await Deduction.find({ employee: emp._id, month });
    const saving = await Saving.findOne({ employee: emp._id });

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
        applyCuts: applyCutsForEmployee,
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
      bonuses: calc.totalBonuses,
      net_salary: calc.net,
      deductions: calc.deductionsApplied,
      withheld_amount: calc.withheld,
      carryover_savings: calc.carryoverSavings
    });

    // If this is a monthly payroll run and monthly_debt entries were applied, remove the monthly_debt deduction records for this month
    if (empPayrollGroup === 'monthly' && daysWorked >= 30) {
      await Deduction.deleteMany({ employee: emp._id, month, type: 'monthly_debt' });
    }

    return res.json({ payrollRecord });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal error', error: err.message });
  }
}

// Scheduler: start monthly job (defaults to run at 05:00 on day 1)
function startMonthlyScheduler(req, res) {
  const { payroll_group, cronExpression } = req.body;
  const group = payroll_group || 'cut';
  const expr = cronExpression || '0 5 1 * *'; // at 05:00 on day 1 of every month

  if (schedulerJob) return res.status(400).json({ message: 'Scheduler already running' });

  schedulerJob = cron.schedule(expr, async () => {
    console.log('Running scheduled payroll for', group);
    try {
      const month = new Date().toISOString().slice(0,7); // YYYY-MM
      await generatePayrollForMonth({ body: { month, payroll_group: group } }, { json: () => {} });
    } catch (err) {
      console.error('Scheduled run error', err);
    }
  });

  return res.json({ message: 'Scheduler started', cron: expr, payroll_group: group });
}

function stopScheduler(req, res) {
  if (schedulerJob) {
    schedulerJob.stop();
    schedulerJob = null;
    return res.json({ message: 'Scheduler stopped' });
  }
  return res.status(400).json({ message: 'No scheduler running' });
}

function getSchedulerStatus(req, res) {
  return res.json({ running: !!schedulerJob });
}

async function getPayrollRecords(req, res) {
  const { month } = req.query;
  const query = month ? { month } : {};
  const records = await PayrollRecord.find(query).populate('employee');
  res.json(records);
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
    const { employeeId, amount, reason, month } = req.body;
    if (!employeeId || typeof amount !== 'number' || !month) {
      return res.status(400).json({ message: 'employeeId, amount (number), and month (YYYY-MM) are required' });
    }
    const bonus = await Bonuses.create({ employee: employeeId, amount, reason, month });
    return res.json({ message: 'Bonus created', bonus });
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
  generatePayrollForEmployee,
  startMonthlyScheduler,
  stopScheduler,
  getSchedulerStatus,
  undoPayrollForMonth,
  recalculatePayrollForMonth,
  getHolds,
  clearHold,
  getSavings,
  updateSaving,
  createDeduction,
  listDeductions,
  updateDeduction,
  deleteDeduction,
  createBonus,
  deleteBonus
};
