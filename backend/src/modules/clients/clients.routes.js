const { Router } = require('express');
const clientsController = require('./clients.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');

const router = Router();

// Gestão de clientes é exclusiva do perfil Master
router.use(authMiddleware, requireRole('master'));

router.get('/',          clientsController.list);
router.post('/',         clientsController.create);
router.get('/:id',       clientsController.detail);
router.put('/:id',       clientsController.update);
router.patch('/:id/suspend',  clientsController.suspend);
router.patch('/:id/activate', clientsController.activate);
router.get('/:id/usage', clientsController.usage);

module.exports = router;
