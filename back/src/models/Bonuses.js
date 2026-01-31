const Mongoose =  require('mongoose');
/*
  back/src/models/Bonuses.js
  - Stores bonuses assigned to employees
  - Can be one-time or recurring
  - Used to add to gross salary during payroll calculation
*/
const BonusesSchema =  new Mongoose.Schema({
    employee: {type : Mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true},
    amount: {type : Number, required: true},
    reason: {type : String, required: true},
    month: {type : String, required : true} // format YYYY-MM, required if is_recurring is false
}, { timestamps: true });

module.exports = Mongoose.model('Bonuses', BonusesSchema);