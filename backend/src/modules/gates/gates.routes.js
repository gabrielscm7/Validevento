const { Router } = require('express');
const gatesController = require('./gates.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccess } = require('../../middleware/eventAccess');

const router = Router();

router.use(authMiddleware);

// GET /api/events/:eventId/gates
router.get('/:eventId/gates', eventAccess, gatesController.list);

// POST /api/events/:eventId/gates — supervisor/admin/master
router.post(
  '/:eventId/gates',
  requireRole('supervisor', 'admin', 'master'),
  eventAccess,
  gatesController.create
);

// PATCH /api/events/:eventId/gates/:gateId/open — supervisor/admin/master
router.patch(
  '/:eventId/gates/:gateId/open',
  requireRole('supervisor', 'admin', 'master'),
  eventAccess,
  gatesController.open
);

// PATCH /api/events/:eventId/gates/:gateId/close — supervisor/admin/master
router.patch(
  '/:eventId/gates/:gateId/close',
  requireRole('supervisor', 'admin', 'master'),
  eventAccess,
  gatesController.close
);

module.exports = router;
