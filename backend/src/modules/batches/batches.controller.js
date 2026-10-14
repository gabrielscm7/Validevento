const batchesService = require('./batches.service');

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

module.exports = { listEventBatches, createEventBatch, updateEventBatch, deleteEventBatch };
