// Simple API key / Bearer token middleware
// If ADMIN_API_KEY is not set, middleware is a no-op (useful for local dev / tests)
module.exports = function (req, res, next) {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return next();

  // Accept 'x-api-key' header or 'Authorization: Bearer <token>'
  const header = (req.headers['x-api-key'] || '').toString() || (req.headers.authorization || '').toString().replace(/^Bearer\s+/i, '');
  if (header === key) return next();

  return res.status(401).json({ message: 'Unauthorized' });
};