const { Router } = require('express');
const usersController = require('./users.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');

const router = Router();

// Gestão de usuários: admin do tenant ou master
router.use(authMiddleware, requireRole('admin', 'master'));

router.get('/',             usersController.list);
router.post('/',            usersController.create);
router.put('/:id',          usersController.update);
router.patch('/:id/deactivate', usersController.deactivate);

module.exports = router;
