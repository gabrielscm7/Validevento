const { Router } = require('express');
const adminController = require('./admin.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');

const router = Router();

router.use(authMiddleware, requireRole('admin'));

router.post('/reset', adminController.reset);
router.post('/cancel-tickets', adminController.cancelTickets);

module.exports = router;
