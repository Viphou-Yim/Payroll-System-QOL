const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password';
const ADMIN_ROLE = process.env.ADMIN_ROLE || 'admin';

const users = [];

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username and password are required' });
  // direct comparison (no bcrypt) for simplicity as requested
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    // set session user
    req.session.user = { username, role: ADMIN_ROLE };
    return res.json({ message: 'ok', user: req.session.user });
  }
  const match = users.find(u => (u.username === username || u.email === username) && u.password === password);
  if (match) {
    req.session.user = { username: match.username, role: 'user' };
    return res.json({ message: 'ok', user: req.session.user });
  }
  return res.status(401).json({ message: 'invalid credentials' });
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
  const exists = users.find(u => u.username === username || u.email === email);
  if (exists) return res.status(409).json({ message: 'username or email already exists' });
  users.push({ username, email, password });
  return res.json({ message: 'signup ok' });
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

module.exports = { login, logout, me, signup };