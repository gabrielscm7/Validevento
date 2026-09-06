/**
 * Controller de eventos (Fase 2).
 */
const eventsService = require('./events.service');
const { auditLog } = require('../../middleware/audit');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || error.message,
    details: error.code ? error.message : undefined,
  });
}

// GET /api/events — lista eventos do tenant
async function list(req, res) {
  try {
    const status = req.query.status;
    const data = await eventsService.listEvents({
      tenantId: req.tenantId,
      isMaster: req.user.role === 'master',
      status,
      filterTenantId: req.user.role === 'master' ? req.query.tenant_id : null,
    });
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

// POST /api/events — cria evento vinculado ao tenant (admin/master)
async function create(req, res) {
  try {
    const { name, date, expected_start, location, capacity, responsible, banner_url, logo_url, tenant_id } = req.body;

    // Master informa o tenant no corpo; admin usa o próprio tenant do JWT
    const tenantId = req.user.role === 'master' ? (tenant_id || req.tenantId) : req.tenantId;

    const event = await eventsService.createEvent({
      tenantId,
      name,
      date,
      expectedStart: expected_start,
      location,
      capacity,
      responsible,
      bannerUrl: banner_url,
      logoUrl: logo_url,
      createdBy: req.user.id,
    });

    // Garante event_id no log (helper lê req.params.eventId ou body.event_id)
    req.params.eventId = event.id;
    await auditLog(req, 'event_created', 'event', event.id, { name: event.name, status: event.status });

    return res.status(201).json(event);
  } catch (error) {
    return sendError(res, error);
  }
}

// GET /api/events/:eventId — evento completo + config + estatísticas
async function getById(req, res) {
  try {
    const data = await eventsService.getEventById(req.event.id);
    if (!data) return res.status(404).json({ error: 'Evento não encontrado.' });
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

// PUT /api/events/:eventId — edita dados do evento (não se fechado)
async function update(req, res) {
  try {
    const updated = await eventsService.updateEvent(req.event.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Evento não encontrado.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'event_updated', 'event', req.event.id, {
      name: updated.name,
      status: updated.status,
    });

    return res.status(200).json(updated);
  } catch (error) {
    return sendError(res, error);
  }
}

// PATCH /api/events/:eventId/status — transição de status
async function changeStatus(req, res) {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'missing_fields', details: 'status é obrigatório.' });

    const result = await eventsService.changeEventStatus(req.event.id, status);
    if (!result) return res.status(404).json({ error: 'Evento não encontrado.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'event_status_changed', 'event', req.event.id, {
      from: result.transition.from,
      to: result.transition.to,
      opened_at: result.transition.opened_at || null,
      closed_at: result.transition.closed_at || null,
    });

    return res.status(200).json(result.event);
  } catch (error) {
    return sendError(res, error);
  }
}

// GET /api/events/active — rota legada da v1 (terminal). Mantida.
async function getActive(req, res) {
  try {
    const event = await eventsService.getActiveEvent();
    if (!event) return res.status(404).json({ error: 'Nenhum evento ativo encontrado.' });
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json(event);
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { list, create, getById, update, changeStatus, getActive };
