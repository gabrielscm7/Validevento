const express = require('express');
const authController = require('./auth.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/me
router.get('/me', authMiddleware, authController.me);

// POST /api/auth/logout (tratado no cliente, mas exposto para padrão de API)
router.post('/logout', (req, res) => {
  return res.status(200).json({ message: 'Logout realizado com sucesso no servidor (limpe o token localmente).' });
});

module.exports = router;
