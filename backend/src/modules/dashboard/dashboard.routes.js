const { Router } = require('express');
const dashboardController = require('./dashboard.controller');
const authMiddleware = require('../../middleware/auth');
const { eventAccess, requireEventRole } = require('../../middleware/eventAccess');

const router = Router();

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// GET /api/events/:eventId/dashboard/* — supervisor/admin/master
// (role EFETIVA considera role_override da equipe)
router.get(
  '/:eventId/dashboard/summary',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  dashboardController.getSummary
);

router.get(
  '/:eventId/dashboard/flow',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  dashboardController.getFlow
);

router.get(
  '/:eventId/dashboard/batches',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  dashboardController.getBatches
);

router.get(
  '/:eventId/dashboard/alerts',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  dashboardController.getAlerts
);

router.get(
  '/:eventId/dashboard/terminals',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  dashboardController.getTerminals
);

router.get(
  '/:eventId/dashboard/live-feed',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  dashboardController.getLiveFeed
);

router.get(
  '/:eventId/dashboard/speed',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  dashboardController.getSpeed
);

module.exports = router;
