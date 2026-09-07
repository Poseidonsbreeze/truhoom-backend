const { createClient } = require('@supabase/supabase-js');
const { prisma } = require('../config/database');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findOrCreateProfile(supabaseUser, role) {
  let profile = await prisma.profile.findUnique({
    where: { authId: supabaseUser.id },
    include: { role: true },
  });

  if (!profile) {
    const roleRecord = await prisma.role.findUnique({
      where: { name: role || 'CUSTOMER' },
    });

    if (!roleRecord) {
      throw new Error(`Role "${role || 'CUSTOMER'}" not found`);
    }

    profile = await prisma.profile.create({
      data: {
        authId: supabaseUser.id,
        fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
        email: supabaseUser.email,
        roleId: roleRecord.id,
        avatarUrl: supabaseUser.user_metadata?.avatar_url || null,
      },
      include: { role: true },
    });
  }

  return profile;
}

const AuthService = {
  async signup({ email, password, fullName }) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (authError) {
      throw new Error(authError.message);
    }

    const supabaseUser = authData.user;
    let profile = null;

    if (supabaseUser) {
      profile = await findOrCreateProfile(supabaseUser, 'CUSTOMER');
    }

    return {
      user: supabaseUser,
      session: authData.session,
      profile,
    };
  },

  async login({ email, password }) {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      throw new Error(authError.message);
    }

    const supabaseUser = authData.user;
    const profile = supabaseUser ? await findOrCreateProfile(supabaseUser) : null;

    return {
      user: supabaseUser,
      session: authData.session,
      profile,
    };
  },

  async oauthLogin({ provider, accessToken }) {
    if (provider === 'google' && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
      const error = new Error('Google authentication is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
      error.status = 503;
      error.code = 'OAUTH_NOT_CONFIGURED';
      throw error;
    }

    if (provider === 'apple' && (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY)) {
      const error = new Error('Apple authentication is not configured. Please set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY environment variables.');
      error.status = 503;
      error.code = 'OAUTH_NOT_CONFIGURED';
      throw error;
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
      provider,
      token: accessToken,
    });

    if (authError) {
      throw new Error(authError.message);
    }

    const supabaseUser = authData.user;
    const profile = supabaseUser ? await findOrCreateProfile(supabaseUser) : null;

    return {
      user: supabaseUser,
      session: authData.session,
      profile,
    };
  },

  async logout(accessToken) {
    if (accessToken) {
      const { error } = await supabaseAdmin.auth.admin.signOut(accessToken);
      if (error) {
        const { error: userError } = await supabase.auth.signOut();
        if (userError) {
          throw new Error(userError.message);
        }
      }
    } else {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw new Error(error.message);
      }
    }
  },

  async refreshSession(refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      throw new Error(error.message);
    }
    return { session: data.session, user: data.user };
  },

  async forgotPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password`,
    });
    if (error) {
      throw new Error(error.message);
    }
  },

  async resetPassword(accessToken, newPassword) {
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      throw new Error('Invalid or expired reset token');
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userData.user.id,
      { password: newPassword }
    );
    if (updateError) {
      throw new Error(updateError.message);
    }
  },

  async getProfile(authId) {
    const profile = await prisma.profile.findUnique({
      where: { authId },
      include: { role: true },
    });
    if (!profile) {
      throw new Error('Profile not found');
    }
    return profile;
  },

  async completeProfile(profileId, { role, phone, address, avatarUrl }) {
    const roleRecord = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRecord) {
      throw new Error(`Role "${role}" not found`);
    }

    const profile = await prisma.profile.update({
      where: { id: profileId },
      data: {
        roleId: roleRecord.id,
        phone,
        address,
        avatarUrl: avatarUrl || undefined,
      },
      include: { role: true },
    });

    return profile;
  },
};

module.exports = AuthService;
