require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const payrollRoutes = require('./routes/payroll');
const authRoutes = require('./routes/auth');

const app = express();

// allow credentials so session cookie is sent
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// simple session store for single-user/local use
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret';
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// Serve static admin UI
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/payroll', payrollRoutes);

module.exports = app;