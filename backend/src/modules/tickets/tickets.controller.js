/**
 * Controller de ingressos (Fase 2).
 */
const ticketsService = require('./tickets.service');
const { auditLog } = require('../../middleware/audit');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || error.message,
    details: error.code ? error.message : undefined,
  });
}

// GET /api/events/:eventId/tickets
async function list(req, res) {
  try {
    const data = await ticketsService.listTickets({
      eventId: req.event.id,
      tenantId: req.event.tenant_id,
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      batch: req.query.batch,
    });
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

// PATCH /api/events/:eventId/tickets/:ticketId/block
async function block(req, res) {
  try {
    const ticket = await ticketsService.blockTicket({
      eventId: req.event.id,
      ticketId: req.params.ticketId,
      tenantId: req.event.tenant_id,
    });
    if (!ticket) return res.status(404).json({ error: 'Ingresso não encontrado.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'ticket_blocked', 'ticket', req.params.ticketId, {
      ticket_code: ticket.ticket_code,
    });

    return res.status(200).json(ticket);
  } catch (error) {
    return sendError(res, error);
  }
}

// PATCH /api/events/:eventId/tickets/:ticketId/unblock
async function unblock(req, res) {
  try {
    const ticket = await ticketsService.unblockTicket({
      eventId: req.event.id,
      ticketId: req.params.ticketId,
      tenantId: req.event.tenant_id,
    });
    if (!ticket) return res.status(404).json({ error: 'Ingresso não encontrado.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'ticket_unblocked', 'ticket', req.params.ticketId, {
      ticket_code: ticket.ticket_code,
    });

    return res.status(200).json(ticket);
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { list, block, unblock };
