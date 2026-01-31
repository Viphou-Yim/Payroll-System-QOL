const mongoose = require('mongoose');
/*
  back/src/models/PayrollRecord.js
  - Stores the output of a payroll run for an employee for a month
  - Key fields: gross_salary, total_deductions, net_salary
  - `deductions` includes breakdown; `withheld_amount` represents any holding (10-day)
  - `carryover_savings` stores the updated accumulated total after this run
*/

const PayrollRecordSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  month: { type: String, required: true },
  gross_salary: { type: Number, required: true },
  total_deductions: { type: Number, required: true },
  bonuses: { type: Number, required: true, default: 0, min: 0 },
  net_salary: { type: Number, required: true },
  deductions: [{ type: mongoose.Schema.Types.Mixed }],
  withheld_amount: { type: Number, default: 0 },
  carryover_savings: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('PayrollRecord', PayrollRecordSchema);
