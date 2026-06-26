const dashboardService = require('./dashboard.service');

async function getSummary(req, res) {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });
    
    const data = await dashboardService.getSummary(event_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getBatches(req, res) {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });
    
    const data = await dashboardService.getBatches(event_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getFlow(req, res) {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });
    
    const data = await dashboardService.getFlow(event_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getAlerts(req, res) {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });
    
    const data = await dashboardService.getAlerts(event_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getTerminals(req, res) {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });
    
    const data = await dashboardService.getTerminals(event_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getLiveFeed(req, res) {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });
    
    const data = await dashboardService.getLiveFeed(event_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function exportCSV(req, res) {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });

    const logs = await dashboardService.getExportData(event_id);

    // Gerar string CSV
    let csvContent = 'id_log,ticket_code,hash_cpf,timestamp,tipo_entrada,validador,terminal,duplicata\n';
    
    for (const log of logs) {
      const row = [
        log.id_log,
        log.ticket_code,
        log.hash_cpf,
        log.timestamp ? new Date(log.timestamp).toISOString() : '',
        log.entry_type,
        `"${(log.validator_name || '').replace(/"/g, '""')}"`,
        `"${(log.terminal_name || '').replace(/"/g, '""')}"`,
        log.is_duplicate ? 'true' : 'false'
      ].join(',');
      csvContent += row + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=logs-evento-${event_id}.csv`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('Erro na exportação de logs:', error.message);
    return res.status(500).json({ error: 'Erro ao gerar exportação de logs em CSV.' });
  }
}

async function getTickets(req, res) {
  try {
    const { event_id, search, status, batch, page = 1, limit = 50 } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });

    const data = await dashboardService.getTickets(event_id, {
      search, status, batch,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getSummary,
  getBatches,
  getFlow,
  getAlerts,
  getTerminals,
  getLiveFeed,
  exportCSV,
  getTickets
};
