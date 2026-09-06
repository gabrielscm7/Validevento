const { Router } = require('express');
const eventsController = require('./events.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccess } = require('../../middleware/eventAccess');

const router = Router();

// Rota legada v1 (terminal) — antes do catch-all de :eventId
router.get('/active', authMiddleware, eventsController.getActive);

// Autenticação obrigatória em todas as rotas abaixo
router.use(authMiddleware);

// GET /api/events — lista eventos do tenant
router.get('/', eventsController.list);

// POST /api/events — cria evento (admin/master)
router.post('/', requireRole('admin', 'master'), eventsController.create);

// GET /api/events/:eventId — evento completo (usuário da equipe ou admin/master)
router.get('/:eventId', eventAccess, eventsController.getById);

// PUT /api/events/:eventId — edita evento (admin/master)
router.put('/:eventId', requireRole('admin', 'master'), eventAccess, eventsController.update);

// PATCH /api/events/:eventId/status — transição de status (admin/master)
router.patch('/:eventId/status', requireRole('admin', 'master'), eventAccess, eventsController.changeStatus);

module.exports = router;
