const mongoose = require('mongoose');
/*
  back/src/models/Saving.js
  - Monthly saving setup per employee
  - `amount` is deducted each payroll run and `accumulated_total` is incremented
*/

const SavingSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  amount: { type: Number, required: true }, // monthly saving amount
  accumulated_total: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Saving', SavingSchema);
