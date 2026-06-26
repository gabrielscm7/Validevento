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

module.exports = { list, create, update, remove };
