const batchesService = require('./batches.service');

async function list(req, res) {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });
    const data = await batchesService.listBatches(event_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function create(req, res) {
  try {
    const { event_id, name, capacity } = req.body;
    if (!event_id || !name) return res.status(400).json({ error: 'event_id e name são obrigatórios.' });
    const batch = await batchesService.createBatch({ eventId: event_id, name, capacity });
    return res.status(201).json(batch);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const batch = await batchesService.updateBatch(id, req.body);
    if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
    return res.status(200).json(batch);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    const batch = await batchesService.deleteBatch(id);
    if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
    return res.status(200).json({ message: 'Lote removido.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// ────────────────────────────────────────────────
// Endpoints aninhados por evento (Fase 2)
// ────────────────────────────────────────────────
const { auditLog } = require('../../middleware/audit');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || error.message,
    details: error.code ? error.message : undefined,
  });
}

async function listEventBatches(req, res) {
  try {
    const data = await batchesService.listEventBatches(req.event.id);
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
}

async function createEventBatch(req, res) {
  try {
    const { name, description } = req.body;
    const batch = await batchesService.createEventBatch({
      eventId: req.event.id,
      tenantId: req.event.tenant_id,
      name,
      description,
    });

    req.params.eventId = req.event.id;
    await auditLog(req, 'batch_created', 'batch', batch.id, { name: batch.name });

    return res.status(201).json(batch);
  } catch (error) {
    return sendError(res, error);
  }
}

async function updateEventBatch(req, res) {
  try {
    const { batchId } = req.params;
    const batch = await batchesService.updateEventBatch(req.event.id, batchId, req.body);
    if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'batch_updated', 'batch', batchId, req.body);

    return res.status(200).json(batch);
  } catch (error) {
    return sendError(res, error);
  }
}

async function deleteEventBatch(req, res) {
  try {
    const { batchId } = req.params;
    const removed = await batchesService.deleteEventBatch(req.event.id, batchId);
    if (!removed) return res.status(404).json({ error: 'Lote não encontrado.' });

    req.params.eventId = req.event.id;
    await auditLog(req, 'batch_deleted', 'batch', batchId, {});

    return res.status(200).json({ message: 'Lote removido.' });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { list, create, update, remove, listEventBatches, createEventBatch, updateEventBatch, deleteEventBatch };
