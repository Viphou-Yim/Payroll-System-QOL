require('dotenv').config();
const express = require('express');
const cors = require('cors');

const payrollRoutes = require('./routes/payroll');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static admin UI
app.use(express.static('public'));

app.use('/api/payroll', payrollRoutes);

module.exports = app;