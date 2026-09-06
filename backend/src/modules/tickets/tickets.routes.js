const { Router } = require('express');
const ticketsController = require('./tickets.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccess } = require('../../middleware/eventAccess');

const router = Router();

router.use(authMiddleware);

// GET /api/events/:eventId/tickets — paginação + filtros
router.get('/:eventId/tickets', eventAccess, ticketsController.list);

// PATCH /api/events/:eventId/tickets/:ticketId/block — admin/master
router.patch(
  '/:eventId/tickets/:ticketId/block',
  requireRole('admin', 'master'),
  eventAccess,
  ticketsController.block
);

// PATCH /api/events/:eventId/tickets/:ticketId/unblock — admin/master
router.patch(
  '/:eventId/tickets/:ticketId/unblock',
  requireRole('admin', 'master'),
  eventAccess,
  ticketsController.unblock
);

module.exports = router;
