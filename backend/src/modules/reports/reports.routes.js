const { Router } = require('express');
const reportsController = require('./reports.controller');
const authMiddleware = require('../../middleware/auth');
const { eventAccess, requireEventRole } = require('../../middleware/eventAccess');

const router = Router();

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// GET /api/events/:eventId/reports/md — supervisor/admin/master
router.get(
  '/:eventId/reports/md',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  reportsController.md
);

// GET /api/events/:eventId/reports/csv
router.get(
  '/:eventId/reports/csv',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  reportsController.csv
);

// GET /api/events/:eventId/reports/audit
router.get(
  '/:eventId/reports/audit',
  eventAccess,
  requireEventRole('supervisor', 'admin', 'master'),
  reportsController.audit
);

module.exports = router;
