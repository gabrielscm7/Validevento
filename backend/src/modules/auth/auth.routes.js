const express = require('express');
const authController = require('./auth.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// POST /api/auth/login — CPF (com ou sem formatação) + senha
router.post('/login', authController.login);

// POST /api/auth/verify-email — ativação por token + definição de senha
router.post('/verify-email', authController.verifyEmail);

// POST /api/auth/forgot-password — solicita link de recuperação por e-mail
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password — redefine senha via token
router.post('/reset-password', authController.resetPassword);

// POST /api/auth/resend-verification — reenvia e-mail de ativação
router.post('/resend-verification', authController.resendVerification);

// GET /api/auth/me
router.get('/me', authMiddleware, authController.me);

// POST /api/auth/logout
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
