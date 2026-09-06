const { Router } = require('express');
const batchesController = require('./batches.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccess } = require('../../middleware/eventAccess');

// Roteador aninhado por evento (Fase 2) — montado em /api/events
const router = Router();

router.use(authMiddleware);

// GET /api/events/:eventId/batches
router.get('/:eventId/batches', eventAccess, batchesController.listEventBatches);

// POST /api/events/:eventId/batches — admin/master
router.post(
  '/:eventId/batches',
  requireRole('admin', 'master'),
  eventAccess,
  batchesController.createEventBatch
);

// PUT /api/events/:eventId/batches/:batchId — admin/master
router.put(
  '/:eventId/batches/:batchId',
  requireRole('admin', 'master'),
  eventAccess,
  batchesController.updateEventBatch
);

// DELETE /api/events/:eventId/batches/:batchId — admin/master
router.delete(
  '/:eventId/batches/:batchId',
  requireRole('admin', 'master'),
  eventAccess,
  batchesController.deleteEventBatch
);

module.exports = router;
