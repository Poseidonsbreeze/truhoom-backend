const { Router } = require('express');
const { requireAuth } = require('../middlewares/auth');
const {
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
} = require('../controllers/auth');

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/apple', appleLogin);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', requireAuth(), getMe);
router.post('/complete-profile', requireAuth(), completeProfile);

module.exports = router;
