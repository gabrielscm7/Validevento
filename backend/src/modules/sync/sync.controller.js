const syncService = require('./sync.service');

function sendError(res, error) {
  return res.status(error.status || 500).json({ error: error.message });
}

/**
 * GET /api/sync/snapshot?event_id=X&since=ISO&terminal_id=Y
 * Snapshot incremental (todos os tickets ou apenas os alterados desde `since`),
 * incluindo event_config e master_ticket.
 */
async function getSnapshot(req, res) {
  try {
    const { event_id: eventId, since, terminal_id: terminalId } = req.query;

    if (!eventId) {
      return res.status(400).json({ error: 'event_id é obrigatório para obter snapshot.' });
    }

    const snapshot = await syncService.getSnapshot(
      eventId,
      since,
      req.tenantId,
      terminalId
    );
    return res.status(200).json(snapshot);
  } catch (error) {
    console.error('Erro ao obter snapshot:', error.message);
    return sendError(res, error);
  }
}

/**
 * POST /api/sync/logs
 * Persiste logs gerados offline no terminal. Idempotente.
 */
async function syncLogs(req, res) {
  try {
    const { event_id: eventId, terminal_id: terminalId, logs } = req.body;
    const validatorId = req.user.id;

    if (!eventId) {
      return res.status(400).json({ error: 'event_id é obrigatório.' });
    }
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({
        error: 'logs deve ser um array contendo os registros de entrada offline.',
      });
    }

    const result = await syncService.processOfflineLogs(
      eventId,
      terminalId,
      validatorId,
      logs,
      req.tenantId
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro ao sincronizar logs offline:', error.message);
    return sendError(res, error);
  }
}

/**
 * POST /api/sync/heartbeat
 * Atualiza o terminal (online) ou cria se não existir.
 */
async function heartbeat(req, res) {
  try {
    const { event_id: eventId, terminal_id: terminalId, name } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'event_id é obrigatório para registrar heartbeat.' });
    }

    const terminalUUID = await syncService.registerHeartbeat(
      eventId,
      terminalId,
      name,
      req.tenantId
    );

    return res.status(200).json({
      ok: true,
      server_time: new Date(),
      terminal_id: terminalUUID,
    });
  } catch (error) {
    console.error('Erro no heartbeat do terminal:', error.message);
    return sendError(res, error);
  }
}

module.exports = {
  getSnapshot,
  syncLogs,
  heartbeat,
};
