const { Router } = require('express');
const eventTeamController = require('./event-team.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccess, requireEventRole } = require('../../middleware/eventAccess');

const router = Router();

router.use(authMiddleware);

// GET /api/events/:eventId/team — admin/supervisor/master
router.get(
  '/:eventId/team',
  requireRole('admin', 'supervisor', 'master'),
  eventAccess,
  eventTeamController.list
);

// POST /api/events/:eventId/team — admin/master
router.post(
  '/:eventId/team',
  requireRole('admin', 'master'),
  eventAccess,
  eventTeamController.add
);

// DELETE /api/events/:eventId/team/:userId — admin/master
router.delete(
  '/:eventId/team/:userId',
  requireRole('admin', 'master'),
  eventAccess,
  eventTeamController.remove
);

module.exports = router;
