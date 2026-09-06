const { Router } = require('express');
const eventConfigController = require('./event-config.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccess, requireEventRole } = require('../../middleware/eventAccess');

const router = Router();

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// GET /api/events/:eventId/config — admin/supervisor/master
router.get(
  '/:eventId/config',
  eventAccess,
  requireEventRole('admin', 'supervisor', 'master'),
  eventConfigController.getConfig
);

// PUT /api/events/:eventId/config — admin/master
router.put(
  '/:eventId/config',
  requireRole('admin', 'master'),
  eventAccess,
  eventConfigController.updateConfig
);

// PATCH /api/events/:eventId/config/checkout — supervisor/admin/master
router.patch(
  '/:eventId/config/checkout',
  requireRole('supervisor', 'admin', 'master'),
  eventAccess,
  eventConfigController.toggleCheckout
);

module.exports = router;
