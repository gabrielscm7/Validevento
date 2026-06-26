const adminService = require('./admin.service');

async function reset(req, res) {
  try {
    const { event_id } = req.body;
    if (event_id) {
      await adminService.resetEventData(event_id);
      return res.status(200).json({
        message: 'Dados do evento resetados com sucesso.',
        event_id,
      });
    }
    await adminService.resetAll();
    return res.status(200).json({ message: 'Todos os dados foram resetados.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function cancelTickets(req, res) {
  try {
    const { event_id, ticket_codes, batch } = req.body;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });

    if (batch) {
      const updated = await adminService.cancelBatch({ eventId: event_id, batchName: batch });
      return res.status(200).json({ message: `${updated.length} ingressos cancelados.`, cancelled: updated });
    }
    if (ticket_codes && ticket_codes.length > 0) {
      const updated = await adminService.cancelTickets({ eventId: event_id, ticketCodes: ticket_codes });
      return res.status(200).json({ message: `${updated.length} ingressos cancelados.`, cancelled: updated });
    }
    return res.status(400).json({ error: 'Informe ticket_codes ou batch.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { reset, cancelTickets };
