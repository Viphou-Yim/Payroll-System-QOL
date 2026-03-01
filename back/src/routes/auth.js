const express = require('express');
const router = express.Router();
<<<<<<< HEAD
const { login, logout, me } = require('../controllers/authController');

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', me);
=======
const { login, logout, me, signup, changePassword } = require('../controllers/authController');
const { requireAuth } = require('../middleware/sessionAuth');

router.post('/login', login);
router.post('/signup', signup);
router.post('/logout', logout);
router.get('/me', me);
router.post('/change-password', requireAuth, changePassword);
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a

module.exports = router;