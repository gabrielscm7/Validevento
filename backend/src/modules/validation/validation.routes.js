const express = require('express');
const validationController = require('./validation.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');

const router = express.Router();

// Todas as rotas de validação requerem autenticação (validador, supervisor ou admin)
router.use(authMiddleware);

// GET /api/validation/lookup
router.get('/lookup', validationController.lookup);

// POST /api/validation/qrcode
router.post('/qrcode', validationController.validateQRCode);

// POST /api/validation/manual
router.post('/manual', validationController.validateManual);

// POST /api/validation/checkout — validador/supervisor/admin
router.post('/checkout', requireRole('validator', 'supervisor', 'admin', 'master'), validationController.checkout);

// POST /api/validation/master — validador/supervisor/admin
router.post('/master', requireRole('validator', 'supervisor', 'admin', 'master'), validationController.useMaster);

// GET /api/validation/search
router.get('/search', validationController.search);

module.exports = router;
