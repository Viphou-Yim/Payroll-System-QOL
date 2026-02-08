const express = require('express');
const router = express.Router();
const { login, logout, me, signup } = require('../controllers/authController');

router.post('/login', login);
router.post('/signup', signup);
router.post('/logout', logout);
router.get('/me', me);

module.exports = router;