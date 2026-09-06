/**
 * Módulo de ingressos (Fase 2) — listagem com paginação/filtros e
 * bloqueio/desbloqueio de ingresso.
 */
const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');

function apiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Lista ingressos do evento com paginação e filtros.
 * Retorno: { data, total, page, pages, limit }
 */
async function listTickets({ eventId, tenantId, page = 1, limit = 50, status, batch }) {
  const params = [eventId];
  let where = 'WHERE t.event_id = $1';

  if (tenantId) {
    where += ` AND t.tenant_id = $${params.length + 1}`;
    params.push(tenantId);
  }
  if (status) {
    where += ` AND t.status = $${params.length + 1}`;
    params.push(status);
  }
  if (batch) {
    where += ` AND t.batch = $${params.length + 1}`;
    params.push(batch);
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (parsedPage - 1) * parsedLimit;

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total FROM tickets t ${where}`,
    params
  );
  const total = countRes.rows[0].total;
  const pages = Math.ceil(total / parsedLimit);

  params.push(parsedLimit, offset);
  const dataRes = await db.query(
    `SELECT t.id, t.ticket_code, t.batch, t.display_name, t.status, t.origin,
            t.validated_at, t.checkout_at, t.imported_at, t.updated_at
     FROM tickets t
     ${where}
     ORDER BY t.imported_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    data: dataRes.rows,
    total,
    page: parsedPage,
    pages,
    limit: parsedLimit,
  };
}

/** Busca ticket pelo id e garante que pertence ao evento + tenant. */
async function getTicketById(eventId, ticketId, tenantId) {
  if (!isValidUUIDv4(ticketId)) return null;
  const result = await db.query(
    `SELECT t.*
     FROM tickets t
     WHERE t.id = $1 AND t.event_id = $2
       AND ($3::uuid IS NULL OR t.tenant_id = $3)`,
    [ticketId, eventId, tenantId || null]
  );
  return result.rows[0] || null;
}

async function setTicketStatus({ eventId, ticketId, tenantId, newStatus, allowFromValidated = true }) {
  const ticket = await getTicketById(eventId, ticketId, tenantId);
  if (!ticket) return null;

  if (!allowFromValidated && ticket.status === 'validated') {
    throw apiError(422, 'ticket_validated', 'Não é possível desbloquear um ingresso já validado.');
  }

  const result = await db.query(
    `UPDATE tickets SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, ticket_code, batch, display_name, status, origin`,
    [newStatus, ticket.id]
  );
  return result.rows[0];
}

async function blockTicket(params) {
  return setTicketStatus({ ...params, newStatus: 'blocked', allowFromValidated: true });
}

async function unblockTicket(params) {
  return setTicketStatus({ ...params, newStatus: 'active', allowFromValidated: false });
}

module.exports = { listTickets, getTicketById, blockTicket, unblockTicket };
