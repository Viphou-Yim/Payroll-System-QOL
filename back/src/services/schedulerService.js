const cron = require('node-cron');
const Scheduler = require('../models/Scheduler');

// In-memory map of active jobs (keyed by payroll_group)
const jobs = new Map();

function startJob(payroll_group, expr, jobRunner) {
  // stop existing
  if (jobs.has(payroll_group)) {
    try { jobs.get(payroll_group).stop(); } catch (e) { console.error('Failed stopping existing job', e); }
  }

  const job = cron.schedule(expr, async () => {
    try {
      await Scheduler.findOneAndUpdate({ payroll_group }, { lastRunAt: new Date() });
      await jobRunner(payroll_group);
    } catch (err) {
      console.error('Scheduled job error', err);
    }
  });

  jobs.set(payroll_group, job);
  return job;
}

async function init(jobRunner) {
  // Load enabled scheduler configs and start jobs
  const configs = await Scheduler.find({ enabled: true });
  for (const cfg of configs) {
    startJob(cfg.payroll_group, cfg.cronExpression, jobRunner);
  }
  return configs;
}

async function start({ payroll_group, cronExpression, jobRunner }) {
  const cfg = await Scheduler.findOneAndUpdate(
    { payroll_group },
    { cronExpression, enabled: true },
    { upsert: true, new: true }
  );
  startJob(payroll_group, cronExpression, jobRunner);
  return cfg;
}

async function stop(payroll_group) {
  const cfg = await Scheduler.findOneAndUpdate({ payroll_group }, { enabled: false }, { new: true });
  const job = jobs.get(payroll_group);
  if (job) {
    try { job.stop(); } catch (e) { console.error('Failed to stop job', e); }
    jobs.delete(payroll_group);
  }
  return cfg;
}

function getStatus(payroll_group) {
  if (payroll_group) return { running: jobs.has(payroll_group) };
  return { running: jobs.size > 0, runningGroups: Array.from(jobs.keys()) };
}

module.exports = { init, start, stop, getStatus };
