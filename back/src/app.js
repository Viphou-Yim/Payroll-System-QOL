require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
<<<<<<< HEAD
=======
const path = require('path');
const fs = require('fs');
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a

const payrollRoutes = require('./routes/payroll');
const authRoutes = require('./routes/auth');

const app = express();

// allow credentials so session cookie is sent
<<<<<<< HEAD
=======
// allow all origins to support Electron (file://) and local dev servers
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// simple session store for single-user/local use
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret';
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
<<<<<<< HEAD
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// Serve static admin UI
app.use(express.static('public'));

=======
  saveUninitialized: true,
  cookie: { httpOnly: true, secure: false, sameSite: 'lax' }
}));

// Serve static admin UI. Prefer front/public (built frontend) if present so
// packaged app shows the full frontend rather than the minimal `back/public`.
const frontPublic = path.join(__dirname, '..', '..', 'front', 'public');
if (fs.existsSync(frontPublic)) {
  app.use(express.static(frontPublic));
} else {
  app.use(express.static(path.join(__dirname, '../public')));
}

>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a
app.use('/api/auth', authRoutes);
app.use('/api/payroll', payrollRoutes);

module.exports = app;