const mongoose = require('mongoose');

const SchedulerSchema = new mongoose.Schema({
  payroll_group: { type: String, required: true, unique: true },
  cronExpression: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  lastRunAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Scheduler', SchedulerSchema);
