const { Router } = require('express');
const eventsController = require('./events.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccessRequireTenant } = require('../../middleware/eventAccess');

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
router.get('/:eventId', eventAccessRequireTenant, eventsController.getById);

// PUT /api/events/:eventId — edita evento (admin/master)
router.put('/:eventId', requireRole('admin', 'master'), eventAccessRequireTenant, eventsController.update);

// PATCH /api/events/:eventId/status — transição de status (admin/master)
router.patch('/:eventId/status', requireRole('admin', 'master'), eventAccessRequireTenant, eventsController.changeStatus);

// POST /api/events/:eventId/reset-and-reopen — encerra (se ativo), reseta e volta a draft
router.post('/:eventId/reset-and-reopen', requireRole('admin', 'master'), eventAccessRequireTenant, eventsController.resetAndReopen);

// POST /api/events/:eventId/share — envia link do evento por e-mail à equipe (admin/master)
router.post('/:eventId/share', requireRole('admin', 'master'), eventAccessRequireTenant, eventsController.share);

// DELETE /api/events/:eventId/purge — ação irreversível para evento encerrado
router.delete('/:eventId/purge', requireRole('admin', 'master'), eventAccessRequireTenant, eventsController.purge);

module.exports = router;
