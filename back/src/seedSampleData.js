/*
  back/src/seedSampleData.js
  - Seeds sample data for local development and testing
  - Creates sample employees in `cut` group, attendance, deductions, and savings
  - Run: `cd back && npm run seed`
*/
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const Attendance = require('./models/Attendance');
const Deduction = require('./models/Deduction');
const Saving = require('./models/Saving');

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/payroll_db';

async function seed() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to mongo for seeding');

  await Employee.deleteMany({});
  await Attendance.deleteMany({});
  await Deduction.deleteMany({});
  await Saving.deleteMany({});

  // Create two employees in cut group
  const emp1 = await Employee.create({ name: 'Alice Johnson', phone: '555-1234', base_salary: 30000, payroll_group: 'cut', has_20_deduction: true, has_10day_holding: false });
  const emp2 = await Employee.create({ name: 'Bob Smith', phone: '555-5678', base_salary: 24000, payroll_group: 'cut', has_20_deduction: false, has_10day_holding: true });

  // Attendance for 2026-01
  await Attendance.create({ employee: emp1._id, month: '2026-01', days_worked: 30, days_absent: 0, start_date: new Date('2026-01-01T00:00:00.000Z'), end_date: new Date('2026-01-30T00:00:00.000Z') });
  await Attendance.create({ employee: emp2._id, month: '2026-01', days_worked: 20, days_absent: 10, start_date: new Date('2026-01-01T00:00:00.000Z'), end_date: new Date('2026-01-30T00:00:00.000Z') });

  // deductions
  await Deduction.create({ employee: emp2._id, type: 'debt', amount: 500, reason: 'loan repayment', month: '2026-01' });

  // saving
  await Saving.create({ employee: emp1._id, amount: 200, accumulated_total: 0 });

  console.log('Seeding done');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
