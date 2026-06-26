const syncService = require('./sync.service');

/**
 * Endpoint para obter instantâneo incremental de ingressos
 */
async function getSnapshot(req, res) {
  try {
    const { event_id, since } = req.query;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id é obrigatório para obter snapshot.' });
    }

    const snapshot = await syncService.getSnapshot(event_id, since);
    return res.status(200).json(snapshot);
  } catch (error) {
    console.error('Erro ao obter snapshot:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Endpoint para sincronizar logs de entrada ocorridos offline no terminal
 */
async function syncLogs(req, res) {
  try {
    const { event_id, terminal_id, logs } = req.body;
    const validatorId = req.user.id;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id é obrigatório.' });
    }

    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ error: 'logs deve ser um array contendo os registros de entrada offline.' });
    }

    const result = await syncService.processOfflineLogs(event_id, terminal_id, validatorId, logs);
    
    // Atualiza a data de última sincronização do terminal se for fornecido terminal_id
    if (terminal_id) {
      await syncService.registerHeartbeat(event_id, terminal_id);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro ao sincronizar logs offline:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Endpoint para registro de heartbeat de terminais
 */
async function heartbeat(req, res) {
  try {
    const { event_id, terminal_id, name } = req.body;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id é obrigatório para registrar heartbeat.' });
    }

    const terminalUUID = await syncService.registerHeartbeat(event_id, terminal_id, name);
    return res.status(200).json({ status: 'alive', terminal_id: terminalUUID });
  } catch (error) {
    console.error('Erro no heartbeat do terminal:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getSnapshot,
  syncLogs,
  heartbeat
};
