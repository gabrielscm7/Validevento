/**
 * Controller de portões (Fase 2).
 */
const gatesService = require('./gates.service');
const { auditLog } = require('../../middleware/audit');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || error.message,
    details: error.code ? error.message : undefined,
  });
}

// GET /api/events/:eventId/gates
async function list(req, res) {
  try {
    const gates = await gatesService.listGates(req.event.id);
    return res.status(200).json(gates);
  } catch (error) {
    return sendError(res, error);
  }
}

// POST /api/events/:eventId/gates
async function create(req, res) {
  try {
    const { name } = req.body;
    const gate = await gatesService.createGate({ eventId: req.event.id, name });

    req.params.eventId = req.event.id;
    await auditLog(req, 'gate_created', 'gate', gate.id, { name: gate.name });

    return res.status(201).json(gate);
  } catch (error) {
    return sendError(res, error);
  }
}

// PATCH /api/events/:eventId/gates/:gateId/open
async function open(req, res) {
  try {
    const gate = await gatesService.openGate({
      eventId: req.event.id,
      gateId: req.params.gateId,
      openedBy: req.user.id,
    });

    req.params.eventId = req.event.id;
    await auditLog(req, 'gate_opened', 'gate', req.params.gateId, {});

    return res.status(200).json(gate);
  } catch (error) {
    return sendError(res, error);
  }
}

// PATCH /api/events/:eventId/gates/:gateId/close
async function close(req, res) {
  try {
    const gate = await gatesService.closeGate({
      eventId: req.event.id,
      gateId: req.params.gateId,
      closedBy: req.user.id,
    });

    req.params.eventId = req.event.id;
    await auditLog(req, 'gate_closed', 'gate', req.params.gateId, {});

    return res.status(200).json(gate);
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { list, create, open, close };
