const express = require('express');
const syncController = require('./sync.controller');
const authMiddleware = require('../../middleware/auth');
const { eventAccessFromInput } = require('../../middleware/eventAccess');

const router = express.Router();

// Todas as rotas de sincronização necessitam de usuário logado (validator, supervisor ou admin)
router.use(authMiddleware);

// Exige acesso ao evento (tenant + event_team + evento ativo para operadores)
router.use(eventAccessFromInput);

// GET /api/sync/snapshot?event_id=uuid&since=timestamp
router.get('/snapshot', syncController.getSnapshot);

// POST /api/sync/logs
router.post('/logs', syncController.syncLogs);

// POST /api/sync/heartbeat
router.post('/heartbeat', syncController.heartbeat);

module.exports = router;
