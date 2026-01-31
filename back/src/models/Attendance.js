const mongoose = require('mongoose');
/*
  back/src/models/Attendance.js
  - Stores the attendance per employee per month
  - month format: YYYY-MM
  - Used to calculate pro-rated gross salary (base/30 * days_worked)
*/

const AttendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  month: { type: String, required: true }, // format YYYY-MM
  days_worked: { type: Number, required: true }, //is this needed tho?
  days_absent: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);
