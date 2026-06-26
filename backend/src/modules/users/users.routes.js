const { Router } = require('express');
const usersController = require('./users.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');

const router = Router();

router.use(authMiddleware, requireRole('admin'));

router.get('/',    usersController.list);
router.post('/',   usersController.create);
router.put('/:id', usersController.update);
router.delete('/:id', usersController.remove);

module.exports = router;
