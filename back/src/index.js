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

let serverInstance;

async function startServer() {
  if (serverInstance) {
    return serverInstance;
  }

  await mongoose.connect(MONGO);
  console.log('Connected to MongoDB');

  const schedulerService = require('./services/schedulerService');
  const payrollController = require('./controllers/payrollController');
  try {
    await schedulerService.init(async (group) => {
      const month = new Date().toISOString().slice(0, 7);
      await payrollController.generatePayrollForMonth({ body: { month, payroll_group: group } }, { json: () => {} });
    });
    console.log('Scheduler service initialized');
  } catch (err) {
    console.error('Scheduler init error', err);
  }

  await new Promise((resolve) => {
    serverInstance = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      resolve();
    });
  });

  return serverInstance;
}

async function stopServer() {
  if (serverInstance) {
    await new Promise((resolve, reject) => {
      serverInstance.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    serverInstance = null;
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Mongo connection error', err);
    process.exit(1);
  });
}

module.exports = {
  startServer,
  stopServer,
};
