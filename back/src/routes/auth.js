const express = require('express');
const router = express.Router();
const { login, logout, me, signup, changePassword } = require('../controllers/authController');
const { requireAuth } = require('../middleware/sessionAuth');

router.post('/login', login);
router.post('/signup', signup);
router.post('/logout', logout);
router.get('/me', me);
router.post('/change-password', requireAuth, changePassword);

module.exports = router;