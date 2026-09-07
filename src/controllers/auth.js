const AuthService = require('../services/auth');
const {
  validateSignup,
  validateLogin,
  validateOAuth,
  validateRefresh,
  validateForgotPassword,
  validateResetPassword,
  validateCompleteProfile,
} = require('../validators/auth');

async function signup(req, res, next) {
  try {
    const errors = validateSignup(req.body);
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const result = await AuthService.signup({
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.fullName,
    });

    res.status(201).json({
      message: 'Signup successful. Check your email for confirmation.',
      user: result.user,
      session: result.session,
      profile: result.profile,
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const errors = validateLogin(req.body);
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const result = await AuthService.login({
      email: req.body.email,
      password: req.body.password,
    });

    res.status(200).json({
      message: 'Login successful',
      user: result.user,
      session: result.session,
      profile: result.profile,
    });
  } catch (err) {
    next(err);
  }
}

async function googleLogin(req, res, next) {
  try {
    const errors = validateOAuth(req.body);
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const result = await AuthService.oauthLogin({
      provider: 'google',
      accessToken: req.body.accessToken,
    });

    res.status(200).json({
      message: 'Google sign-in successful',
      user: result.user,
      session: result.session,
      profile: result.profile,
    });
  } catch (err) {
    if (err.code === 'OAUTH_NOT_CONFIGURED') {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

async function appleLogin(req, res, next) {
  try {
    const errors = validateOAuth(req.body);
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const result = await AuthService.oauthLogin({
      provider: 'apple',
      accessToken: req.body.identityToken,
    });

    res.status(200).json({
      message: 'Apple sign-in successful',
      user: result.user,
      session: result.session,
      profile: result.profile,
    });
  } catch (err) {
    if (err.code === 'OAUTH_NOT_CONFIGURED') {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    await AuthService.logout(accessToken);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const errors = validateRefresh(req.body);
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const result = await AuthService.refreshSession(req.body.refreshToken);

    res.status(200).json({
      message: 'Session refreshed',
      session: result.session,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const errors = validateForgotPassword(req.body);
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    await AuthService.forgotPassword(req.body.email);

    res.status(200).json({ message: 'Password reset email sent' });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const errors = validateResetPassword(req.body);
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    await AuthService.resetPassword(req.body.accessToken, req.body.newPassword);

    res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const profile = await AuthService.getProfile(req.user.id);

    res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
      profile,
    });
  } catch (err) {
    next(err);
  }
}

async function completeProfile(req, res, next) {
  try {
    const errors = validateCompleteProfile(req.body);
    if (errors) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const profile = await AuthService.completeProfile(req.user.profileId, {
      role: req.body.role,
      phone: req.body.phone,
      address: req.body.address,
      avatarUrl: req.body.avatarUrl,
    });

    res.status(200).json({
      message: 'Profile completed',
      profile,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signup,
  login,
  googleLogin,
  appleLogin,
  logout,
  refresh,
  forgotPassword,
  resetPassword,
  getMe,
  completeProfile,
};
