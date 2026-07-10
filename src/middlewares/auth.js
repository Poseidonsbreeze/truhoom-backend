const { createClient } = require('@supabase/supabase-js');
const { prisma } = require('../config/database');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function requireAuth(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed authorization header' });
      }

      const token = authHeader.split(' ')[1];

      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !supabaseUser) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const profile = await prisma.profile.findUnique({
        where: { authId: supabaseUser.id },
        include: { role: true },
      });

      if (!profile) {
        return res.status(401).json({ error: 'Profile not found' });
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role.name)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        role: profile.role.name,
        profileId: profile.id,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireAuth };
