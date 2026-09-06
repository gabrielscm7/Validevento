const db = require('../../config/database');

async function listBatches(eventId) {
  const result = await db.query(
    `SELECT b.id, b.name, b.capacity, b.created_at,
       COUNT(t.id)::integer as total_tickets,
       COUNT(CASE WHEN t.status = 'validated' THEN 1 END)::integer as validated_tickets
     FROM batches b
     LEFT JOIN tickets t ON t.batch = b.name AND t.event_id = b.event_id
     WHERE b.event_id = $1
     GROUP BY b.id, b.name, b.capacity, b.created_at
     ORDER BY b.name`,
    [eventId]
  );
  return result.rows;
}

async function createBatch({ eventId, name, capacity }) {
  const result = await db.query(
    `INSERT INTO batches (event_id, name, capacity) VALUES ($1, $2, $3)
     RETURNING id, name, capacity, created_at`,
    [eventId, name, capacity || 0]
  );
  return result.rows[0];
}

async function updateBatch(id, { name, capacity }) {
  const fields = [];
  const params = [];
  let idx = 1;
  if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
  if (capacity !== undefined) { fields.push(`capacity = $${idx++}`); params.push(capacity); }
  if (fields.length === 0) return null;
  params.push(id);
  const result = await db.query(
    `UPDATE batches SET ${fields.join(', ')} WHERE id = $${idx}
     RETURNING id, name, capacity, created_at`,
    params
  );
  return result.rows[0] || null;
}

async function deleteBatch(id) {
  const result = await db.query('DELETE FROM batches WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

// ────────────────────────────────────────────────
// Endpoints aninhados da Fase 2 (GET/POST/PUT/DELETE /api/events/:eventId/batches)
// Os lotes são registros na tabela batches (event_id, name, description),
// com contadores derivados dos tickets que carregam o rótulo batch.
// ────────────────────────────────────────────────

function apiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/** Lista lotes do evento com contagem de ingressos e ocupação. */
async function listEventBatches(eventId) {
  const result = await db.query(
    `SELECT b.id, b.name, b.description, b.created_at,
            COUNT(t.id)::integer AS qtd_gerada,
            COUNT(CASE WHEN t.status = 'validated' THEN 1 END)::integer AS qtd_validada
     FROM batches b
     LEFT JOIN tickets t ON t.batch = b.name AND t.event_id = b.event_id
     WHERE b.event_id = $1
     GROUP BY b.id, b.name, b.description, b.created_at
     ORDER BY b.name ASC`,
    [eventId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    qtd_gerada: row.qtd_gerada,
    qtd_validada: row.qtd_validada,
    occupancy_percent: row.qtd_gerada > 0
      ? Number(((row.qtd_validada / row.qtd_gerada) * 100).toFixed(2))
      : 0,
  }));
}

/** Cria um lote vinculado ao evento. */
async function createEventBatch({ eventId, tenantId, name, description }) {
  if (!name) {
    throw apiError(400, 'missing_fields', 'name é obrigatório.');
  }

  const dupRes = await db.query(
    'SELECT 1 FROM batches WHERE event_id = $1 AND LOWER(name) = LOWER($2)',
    [eventId, name]
  );
  if (dupRes.rowCount > 0) {
    throw apiError(409, 'batch_exists', 'Já existe um lote com esse nome neste evento.');
  }

  const result = await db.query(
    `INSERT INTO batches (event_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, name, description, created_at`,
    [eventId, name, description || null]
  );
  return result.rows[0];
}

/**
 * Edita nome/descrição do lote. Não permite editar se há ingressos
 * validados no lote.
 */
async function updateEventBatch(eventId, batchId, { name, description }) {
  const batchRes = await db.query(
    'SELECT id, name FROM batches WHERE id = $1 AND event_id = $2',
    [batchId, eventId]
  );
  if (batchRes.rowCount === 0) return null;

  const currentName = batchRes.rows[0].name;

  const validatedRes = await db.query(
    `SELECT 1 FROM tickets
     WHERE event_id = $1 AND batch = $2 AND status = 'validated'
     LIMIT 1`,
    [eventId, currentName]
  );
  if (validatedRes.rowCount > 0) {
    throw apiError(422, 'batch_has_validated', 'Não é possível editar lote com ingressos validados.');
  }

  const fields = [];
  const params = [];
  let idx = 1;
  if (name !== undefined) {
    fields.push(`name = $${idx++}`);
    params.push(name);
  }
  if (description !== undefined) {
    fields.push(`description = $${idx++}`);
    params.push(description);
  }
  if (fields.length === 0) {
    throw apiError(400, 'no_fields', 'Nenhum campo para atualizar.');
  }

  params.push(batchId, eventId);
  const result = await db.query(
    `UPDATE batches SET ${fields.join(', ')} WHERE id = $${idx} AND event_id = $${idx + 1}
     RETURNING id, name, description, created_at`,
    params
  );

  // Renomeia os tickets que usavam o rótulo antigo
  if (name !== undefined && name !== currentName) {
    await db.query(
      'UPDATE tickets SET batch = $1 WHERE event_id = $2 AND batch = $3',
      [name, eventId, currentName]
    );
  }

  return result.rows[0];
}

/** Exclui lote. Não permite se houver qualquer ingresso no lote. */
async function deleteEventBatch(eventId, batchId) {
  const batchRes = await db.query(
    'SELECT id, name FROM batches WHERE id = $1 AND event_id = $2',
    [batchId, eventId]
  );
  if (batchRes.rowCount === 0) return null;

  const name = batchRes.rows[0].name;
  const ticketsRes = await db.query(
    'SELECT 1 FROM tickets WHERE event_id = $1 AND batch = $2 LIMIT 1',
    [eventId, name]
  );
  if (ticketsRes.rowCount > 0) {
    throw apiError(422, 'batch_has_tickets', 'Não é possível excluir lote com ingressos.');
  }

  const result = await db.query(
    'DELETE FROM batches WHERE id = $1 AND event_id = $2 RETURNING id',
    [batchId, eventId]
  );
  return result.rows[0] || null;
}

module.exports = {
  listBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  listEventBatches,
  createEventBatch,
  updateEventBatch,
  deleteEventBatch,
};
