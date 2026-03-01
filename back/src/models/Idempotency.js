const mongoose = require('mongoose');

const IdempotencySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  payroll_group: { type: String, required: true },
  month: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Idempotency', IdempotencySchema);
