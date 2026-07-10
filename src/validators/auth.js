function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (!password || password.length < 6) {
    return 'Password must be at least 6 characters';
  }
  return null;
}

function validateSignup(body) {
  const errors = [];
  if (!body.email || !validateEmail(body.email)) {
    errors.push('Valid email is required');
  }
  const passwordError = validatePassword(body.password);
  if (passwordError) {
    errors.push(passwordError);
  }
  if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim().length === 0) {
    errors.push('Full name is required');
  }
  return errors.length > 0 ? errors : null;
}

function validateLogin(body) {
  const errors = [];
  if (!body.email || !validateEmail(body.email)) {
    errors.push('Valid email is required');
  }
  if (!body.password) {
    errors.push('Password is required');
  }
  return errors.length > 0 ? errors : null;
}

function validateOAuth(body) {
  const errors = [];
  if (!body.accessToken && !body.identityToken) {
    errors.push('accessToken or identityToken is required');
  }
  return errors.length > 0 ? errors : null;
}

function validateRefresh(body) {
  const errors = [];
  if (!body.refreshToken) {
    errors.push('refreshToken is required');
  }
  return errors.length > 0 ? errors : null;
}

function validateForgotPassword(body) {
  const errors = [];
  if (!body.email || !validateEmail(body.email)) {
    errors.push('Valid email is required');
  }
  return errors.length > 0 ? errors : null;
}

function validateResetPassword(body) {
  const errors = [];
  if (!body.accessToken) {
    errors.push('accessToken is required');
  }
  const passwordError = validatePassword(body.newPassword);
  if (passwordError) {
    errors.push(passwordError);
  }
  return errors.length > 0 ? errors : null;
}

function validateCompleteProfile(body) {
  const errors = [];
  if (!body.role || !['CUSTOMER', 'ARTISAN'].includes(body.role)) {
    errors.push('role must be CUSTOMER or ARTISAN');
  }
  if (!body.phone || typeof body.phone !== 'string') {
    errors.push('Phone number is required');
  }
  return errors.length > 0 ? errors : null;
}

module.exports = {
  validateSignup,
  validateLogin,
  validateOAuth,
  validateRefresh,
  validateForgotPassword,
  validateResetPassword,
  validateCompleteProfile,
};
