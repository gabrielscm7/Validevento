const validationService = require('./validation.service');

/**
 * Validação por QRCode (recebe CPF bruto e valida)
 */
async function validateQRCode(req, res) {
  try {
    const { cpf_raw, event_id, terminal_id } = req.body;
    const validatorId = req.user.id;

    if (!cpf_raw || !event_id) {
      return res.status(400).json({ error: 'Parâmetros cpf_raw e event_id são obrigatórios.' });
    }

    const result = await validationService.validateQRCode(event_id, terminal_id, validatorId, cpf_raw);
    
    // Conforme SPEC 4.3, respostas específicas para cada estado:
    if (result.status === 'not_found') {
      return res.status(200).json({ status: 'not_found' }); // retorna 200 com status not_found
    }

    if (result.status === 'blocked') {
      return res.status(200).json(result); // retorna status blocked
    }

    if (result.status === 'invalid_status') {
      return res.status(200).json(result); // retorna status de erro interno
    }

    return res.status(200).json(result); // authorized ou duplicate
  } catch (error) {
    console.error('Erro na validação do QRCode:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Validação Manual (após encontrar participante via busca, clica em confirmar)
 */
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

/**
 * Busca por nome parcial ou por CPF
 */
async function search(req, res) {
  try {
    const { q, cpf, event_id } = req.query;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id é obrigatório para realizar buscas.' });
    }

    if (!q && !cpf) {
      return res.status(400).json({ error: 'Forneça o parâmetro q (busca por nome) ou cpf (busca por CPF).' });
    }

    const results = await validationService.searchTickets(event_id, q, cpf);
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Erro na busca de tickets:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  validateQRCode,
  validateManual,
  search
};
