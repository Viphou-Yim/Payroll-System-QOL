const mongoose = require('mongoose');

const DebtPaymentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  amount_paid: { type: Number, required: true, min: 0 },
  payment_date: { type: Date, required: true },
  note: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('DebtPayment', DebtPaymentSchema);
