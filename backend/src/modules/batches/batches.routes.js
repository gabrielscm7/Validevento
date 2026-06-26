const { Router } = require('express');
const batchesController = require('./batches.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');

const router = Router();

router.use(authMiddleware, requireRole('admin'));

router.get('/',    batchesController.list);
router.post('/',   batchesController.create);
router.put('/:id', batchesController.update);
router.delete('/:id', batchesController.remove);

module.exports = router;
