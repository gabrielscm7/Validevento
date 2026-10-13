const { Router } = require('express');
const terminalsController = require('./terminals.controller');
const authMiddleware = require('../../middleware/auth');
const requireRole = require('../../middleware/roles');
const { eventAccess } = require('../../middleware/eventAccess');

// ── Rotas autenticadas (montadas em /api/events) ──
const eventsRouter = Router();
eventsRouter.use(authMiddleware);

// POST /api/events/:eventId/terminals/generic — cria terminal de acesso rápido
eventsRouter.post(
  '/:eventId/terminals/generic',
  requireRole('admin', 'supervisor', 'master'),
  eventAccess,
  terminalsController.createGeneric
);

// GET /api/events/:eventId/terminals — lista terminais (inclui genéricos)
eventsRouter.get(
  '/:eventId/terminals',
  requireRole('admin', 'supervisor', 'master'),
  eventAccess,
  terminalsController.list
);

// ── Rotas públicas (montadas em /api/terminal) — sem login ──
const publicRouter = Router();
const bySlug = terminalsController.resolveGenericTerminal;

publicRouter.get('/join/:slug', bySlug, terminalsController.join);
publicRouter.post('/join/:slug/open', bySlug, terminalsController.open);

publicRouter.get('/:slug/gates', bySlug, terminalsController.gates);
publicRouter.get('/:slug/gate', bySlug, terminalsController.getGate);
publicRouter.patch('/:slug/gate', bySlug, terminalsController.setGate);

publicRouter.get('/:slug/snapshot', bySlug, terminalsController.snapshot);
publicRouter.post('/:slug/logs', bySlug, terminalsController.logs);
publicRouter.post('/:slug/heartbeat', bySlug, terminalsController.heartbeat);

publicRouter.get('/:slug/lookup', bySlug, terminalsController.lookup);
publicRouter.get('/:slug/search', bySlug, terminalsController.search);
publicRouter.post('/:slug/qrcode', bySlug, terminalsController.qrcode);
publicRouter.post('/:slug/manual', bySlug, terminalsController.manual);
publicRouter.post('/:slug/checkout', bySlug, terminalsController.checkout);
publicRouter.post('/:slug/master', bySlug, terminalsController.master);

module.exports = { eventsRouter, publicRouter };
