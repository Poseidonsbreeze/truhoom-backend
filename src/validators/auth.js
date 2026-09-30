function validateEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
    return 'Password must be between 8 and 256 characters';
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
  if (!body.role || !['CUSTOMER', 'ARTISAN'].includes(body.role)) {
    errors.push('role must be CUSTOMER or ARTISAN');
  }
  return errors.length > 0 ? errors : null;
}

function validateLogin(body) {
  const errors = [];
  if (!body.email || !validateEmail(body.email)) {
    errors.push('Valid email is required');
  }
  if (typeof body.password !== 'string' || !body.password || body.password.length > 256) {
    errors.push('Password is required');
  }
  return errors.length > 0 ? errors : null;
}

function validateRefresh(body) {
  const errors = [];
  if (typeof body.refreshToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.refreshToken)) {
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
  if (typeof body.accessToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.accessToken)) {
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
  if (!body.phone || typeof body.phone !== 'string') {
    errors.push('Phone number is required');
  }
  return errors.length > 0 ? errors : null;
}

module.exports = {
  validateSignup,
  validateLogin,
  validateRefresh,
  validateForgotPassword,
  validateResetPassword,
  validateCompleteProfile,
};
