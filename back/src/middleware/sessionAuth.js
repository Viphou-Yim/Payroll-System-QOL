// sessionAuth.js - session based auth with optional API key fallback
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';

function getUserFromReq(req) {
  // API key fallback
  const headerKey = (req.headers['x-api-key'] || req.headers.authorization || '').toString().replace(/^Bearer\s+/i, '');
  if (ADMIN_API_KEY && headerKey === ADMIN_API_KEY) {
    return { username: 'api-key', role: 'admin' };
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
  req.user = user;
  return next();
}

module.exports = { requireAuth, requireAdmin, getUserFromReq };