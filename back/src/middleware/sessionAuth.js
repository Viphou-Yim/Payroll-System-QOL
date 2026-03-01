// sessionAuth.js - session based auth with optional API key fallback
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
<<<<<<< HEAD
const ADMIN_ROLE = process.env.ADMIN_ROLE || 'admin';
=======
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a

function getUserFromReq(req) {
  // API key fallback
  const headerKey = (req.headers['x-api-key'] || req.headers.authorization || '').toString().replace(/^Bearer\s+/i, '');
  if (ADMIN_API_KEY && headerKey === ADMIN_API_KEY) {
<<<<<<< HEAD
    return { username: 'api-key', role: ADMIN_ROLE };
=======
    return { username: 'api-key', role: 'admin' };
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a
  }
  // session user
  if (req.session && req.session.user) return req.session.user;
  return null;
}

function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ message: 'Not authenticated' });
  req.user = user;
  return next();
}

function requireAdmin(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ message: 'Not authenticated' });
<<<<<<< HEAD
  if (user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
=======
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a
  req.user = user;
  return next();
}

module.exports = { requireAuth, requireAdmin, getUserFromReq };