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

module.exports = { listBatches, createBatch, updateBatch, deleteBatch };
