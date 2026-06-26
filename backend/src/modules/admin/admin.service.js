const db = require('../../config/database');

async function resetEventData(eventId) {
  await db.query('DELETE FROM entry_logs WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM tickets WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM terminals WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM batches WHERE event_id = $1', [eventId]);
}

async function resetAll() {
  await db.query('DELETE FROM entry_logs');
  await db.query('DELETE FROM tickets');
  await db.query('DELETE FROM terminals');
  await db.query('DELETE FROM batches');
  await db.query('DELETE FROM events');
  await db.query('DELETE FROM users');
}

async function cancelTickets({ eventId, ticketCodes }) {
  const result = await db.query(
    `UPDATE tickets SET status = 'blocked', updated_at = NOW()
     WHERE event_id = $1 AND ticket_code = ANY($2::varchar[])
       AND status != 'validated'
     RETURNING ticket_code, status`,
    [eventId, ticketCodes]
  );
  return result.rows;
}

async function cancelBatch({ eventId, batchName }) {
  const result = await db.query(
    `UPDATE tickets SET status = 'blocked', updated_at = NOW()
     WHERE event_id = $1 AND batch = $2 AND status != 'validated'
     RETURNING ticket_code, status`,
    [eventId, batchName]
  );
  return result.rows;
}

module.exports = { resetEventData, resetAll, cancelTickets, cancelBatch };
