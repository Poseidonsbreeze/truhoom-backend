const AuthService = require('../services/auth');
function requireAuth(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing or malformed authorization header' });
      const profile = await AuthService.authenticate(header.slice(7));
      if (allowedRoles.length && !allowedRoles.includes(profile.role.name)) return res.status(403).json({ error: 'Insufficient permissions' });
      req.user = { id: profile.authId, email: profile.email, role: profile.role.name, profileId: profile.id };
      next();
    } catch (error) { next(error); }
  };
}
module.exports = { requireAuth };
