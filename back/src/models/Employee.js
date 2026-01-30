const mongoose = require('mongoose');
/*
  back/src/models/Employee.js
  - Employee master record
  - Fields:
    * name, base_salary, payroll_group
    * has_20_deduction: flat $20 profile deduction
    * has_10day_holding: whether to withhold 10-day holding
    * start_date, active
  - Used by payroll generation to determine applicable rules per employee
*/

const EmployeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  base_salary: { type: Number, required: true },
  payroll_group: { type: String, required: true },
  has_20_deduction: { type: Boolean, default: false },
  has_10day_holding: { type: Boolean, default: false },
  start_date: { type: Date },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Employee', EmployeeSchema);
