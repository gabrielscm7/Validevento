const validationService = require('./validation.service');

async function lookup(req, res) {
  try {
    const { code, event_id } = req.query;

    if (!code || !event_id) {
      return res.status(400).json({ error: 'Parâmetros code e event_id são obrigatórios.' });
    }

    const result = await validationService.lookupTicket(event_id, code);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro na consulta do ticket:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function validateQRCode(req, res) {
  try {
    const { ticket_code, event_id, terminal_id } = req.body;
    const validatorId = req.user.id;

    if (!ticket_code || !event_id) {
      return res.status(400).json({ error: 'Parâmetros ticket_code e event_id são obrigatórios.' });
    }

    const result = await validationService.validateQRCode(event_id, terminal_id, validatorId, ticket_code);

    if (result.status === 'not_found') {
      return res.status(200).json({ status: 'not_found' });
    }

    if (result.status === 'blocked') {
      return res.status(200).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro na validação do QRCode:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function validateManual(req, res) {
  try {
    const { ticket_id, event_id, terminal_id } = req.body;
    const validatorId = req.user.id;

    if (!ticket_id || !event_id) {
      return res.status(400).json({ error: 'Parâmetros ticket_id e event_id são obrigatórios.' });
    }

    const result = await validationService.validateManual(event_id, terminal_id, validatorId, ticket_id);

    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'Ticket não encontrado.' });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro na validação manual:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function search(req, res) {
  try {
    const { q, event_id } = req.query;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id é obrigatório para realizar buscas.' });
    }

    if (!q) {
      return res.status(400).json({ error: 'Forneça o parâmetro q (busca por nome).' });
    }

    const results = await validationService.searchTickets(event_id, q);
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Erro na busca de tickets:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  lookup,
  validateQRCode,
  validateManual,
  search
};
