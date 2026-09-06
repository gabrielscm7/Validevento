const { Router } = require('express');
const multer = require('multer');
const invitationsController = require('./invitations.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccess } = require('../../middleware/eventAccess');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authMiddleware);

// GET /api/events/:eventId/master-ticket — supervisor/admin/master
router.get(
  '/:eventId/master-ticket',
  requireRole('supervisor', 'admin', 'master'),
  eventAccess,
  invitationsController.getMasterTicket
);

// POST /api/events/:eventId/master-ticket — admin/master
router.post(
  '/:eventId/master-ticket',
  requireRole('admin', 'master'),
  eventAccess,
  invitationsController.createMasterTicket
);

// DELETE /api/events/:eventId/master-ticket — admin/master
router.delete(
  '/:eventId/master-ticket',
  requireRole('admin', 'master'),
  eventAccess,
  invitationsController.deactivateMasterTicket
);

// POST /api/events/:eventId/invitations — supervisor/admin/master
router.post(
  '/:eventId/invitations',
  requireRole('supervisor', 'admin', 'master'),
  eventAccess,
  invitationsController.createInvitation
);

// POST /api/events/:eventId/invitations/bulk — admin/master (CSV)
router.post(
  '/:eventId/invitations/bulk',
  requireRole('admin', 'master'),
  eventAccess,
  upload.single('file'),
  invitationsController.bulkInvitations
);

module.exports = router;
