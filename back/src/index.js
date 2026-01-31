/*
  back/src/index.js
  - Server entry point for the Payroll backend
  - Loads environment variables and starts Express + MongoDB connection
  - Serves static admin UI from `public/` and mounts API routes under `/api/payroll`
  - Env vars of note: MONGODB_URI, PORT, ROUND_DECIMALS, CUT_GROUP_20_DEDUCTION_AMOUNT
*/
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 4000;
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/payroll_db';

mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Mongo connection error', err);
    process.exit(1);
  });
