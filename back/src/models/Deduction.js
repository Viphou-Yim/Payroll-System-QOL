const mongoose = require('mongoose');
/*
  back/src/models/Deduction.js
  - Generic deduction entries
  - type: savings | debt | damage | hold | other
  - amount and optional reason; associated month YYYY-MM
  - Hold status are used for 10-day withholding and can be cleared later
*/

const DeductionSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  type: { type: String, enum: ['savings', 'debt', 'damage', 'hold', 'other'], default: 'other' },
  amount: { type: Number, required: true },
  reason: { type: String },
  month: { type: String, required: true } // month deducted (YYYY-MM)
}, { timestamps: true });

module.exports = mongoose.model('Deduction', DeductionSchema);
