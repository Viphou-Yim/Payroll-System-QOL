const ADMIN_USER = process.env.ADMIN_USER || 'admin';
let adminPassword = process.env.ADMIN_PASSWORD || 'password';
const ADMIN_ROLE = process.env.ADMIN_ROLE || 'admin';
const User = require('../models/User');

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username and password are required' });
  // direct comparison (no bcrypt) for simplicity as requested
  if (username === ADMIN_USER && password === adminPassword) {
    // set session user
    req.session.user = { username, role: ADMIN_ROLE };
    return res.json({ message: 'ok', user: req.session.user });
  }
  try {
    const match = await User.findOne({
      $or: [{ username }, { email: username }],
      password,
    }).lean();
    if (match) {
      req.session.user = { username: match.username, role: match.role || 'user' };
      return res.json({ message: 'ok', user: req.session.user });
    }
    return res.status(401).json({ message: 'invalid credentials' });
  } catch (error) {
    return res.status(500).json({ message: 'login failed' });
  }
}

async function signup(req, res) {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'username, email, and password are required' });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
  if (!emailOk) return res.status(400).json({ message: 'invalid email format' });
  if (!passwordOk) return res.status(400).json({ message: 'password must be at least 8 characters and include a letter and a number' });
  try {
    const normalizedEmail = String(email).toLowerCase();
    const exists = await User.findOne({
      $or: [{ username }, { email: normalizedEmail }],
    }).lean();
    if (exists) return res.status(409).json({ message: 'username or email already exists' });
    await User.create({ username, email: normalizedEmail, password, role: 'user' });
    return res.json({ message: 'signup ok' });
  } catch (error) {
    return res.status(500).json({ message: 'signup failed' });
  }
}

async function logout(req, res) {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: 'error logging out' });
    res.clearCookie('connect.sid');
    return res.json({ message: 'logged out' });
  });
}

function me(req, res) {
  if (req.session && req.session.user) return res.json({ user: req.session.user });
  return res.status(401).json({ message: 'not authenticated' });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'currentPassword and newPassword are required' });
  }
  const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword);
  if (!passwordOk) {
    return res.status(400).json({ message: 'password must be at least 8 characters and include a letter and a number' });
  }
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: 'not authenticated' });
  }
  const username = req.session.user.username;
  if (username === ADMIN_USER) {
    if (currentPassword !== adminPassword) {
      return res.status(400).json({ message: 'current password is incorrect' });
    }
    adminPassword = newPassword;
    return res.json({ message: 'password updated' });
  }
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ message: 'user not found' });
  if (user.password !== currentPassword) {
    return res.status(400).json({ message: 'current password is incorrect' });
  }
  user.password = newPassword;
  await user.save();
  return res.json({ message: 'password updated' });
}

module.exports = { login, logout, me, signup, changePassword };