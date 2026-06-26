const express = require('express');
const dashboardController = require('./dashboard.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');

const router = express.Router();

// Todas as rotas de dashboard exigem autenticação
router.use(authMiddleware);

// Endpoints acessíveis por Administradores e Supervisores
router.get('/summary', requireRole('admin', 'supervisor'), dashboardController.getSummary);
router.get('/batches', requireRole('admin', 'supervisor'), dashboardController.getBatches);
router.get('/flow', requireRole('admin', 'supervisor'), dashboardController.getFlow);
router.get('/alerts', requireRole('admin', 'supervisor'), dashboardController.getAlerts);
router.get('/terminals', requireRole('admin', 'supervisor'), dashboardController.getTerminals);
router.get('/live-feed', requireRole('admin', 'supervisor'), dashboardController.getLiveFeed);

router.get('/tickets', requireRole('admin', 'supervisor'), dashboardController.getTickets);

// Exportação em CSV (exclusivo para Administrador conforme PRD RF-05 e RF-06)
router.get('/export', requireRole('admin'), dashboardController.exportCSV);

module.exports = router;
