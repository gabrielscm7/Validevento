const express = require('express');
const validationController = require('./validation.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// Todas as rotas de validação requerem autenticação (validador, supervisor ou admin)
router.use(authMiddleware);

// POST /api/validation/qrcode
router.post('/qrcode', validationController.validateQRCode);

// POST /api/validation/manual
router.post('/manual', validationController.validateManual);

// GET /api/validation/search
router.get('/search', validationController.search);

module.exports = router;
