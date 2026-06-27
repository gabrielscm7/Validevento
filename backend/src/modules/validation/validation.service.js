const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');

async function validateQRCode(eventId, terminalId, validatorId, ticketCode) {
  const normalizedCode = ticketCode.trim().toLowerCase();
  if (!isValidUUIDv4(normalizedCode)) {
    return { status: 'not_found' };
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, validated_at
       FROM tickets
       WHERE event_id = $1 AND LOWER(ticket_code) = $2`,
      [eventId, normalizedCode]
    );

    if (ticketRes.rowCount === 0) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }

    const ticket = ticketRes.rows[0];

    if (ticket.status === 'blocked') {
      await client.query('COMMIT');
      return { status: 'blocked', ticket_code: ticket.ticket_code };
    }

    if (ticket.status === 'validated') {
      await client.query(
        `INSERT INTO entry_logs (ticket_id, event_id, entry_type, terminal_id, validator_id, is_duplicate, synced)
         VALUES ($1, $2, 'qrcode', $3, $4, true, true)`,
        [ticket.id, eventId, terminalId || null, validatorId || null]
      );
      await client.query('COMMIT');
      return {
        status: 'duplicate',
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        first_entry_at: ticket.validated_at
      };
    }

    const now = new Date();
    await client.query(
      `UPDATE tickets
       SET status = 'validated', validated_at = $1, updated_at = NOW()
       WHERE id = $2`,
      [now, ticket.id]
    );

    const logRes = await client.query(
      `INSERT INTO entry_logs (ticket_id, event_id, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
       VALUES ($1, $2, 'qrcode', $3, $4, false, true, $5)
       RETURNING id`,
      [ticket.id, eventId, terminalId || null, validatorId || null, now]
    );

    await client.query('COMMIT');
    return {
      status: 'authorized',
      ticket_code: ticket.ticket_code,
      display_name: ticket.display_name,
      batch: ticket.batch,
      entry_log_id: logRes.rows[0].id
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function validateManual(eventId, terminalId, validatorId, ticketId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, validated_at
       FROM tickets
       WHERE id = $1 AND event_id = $2`,
      [ticketId, eventId]
    );

    if (ticketRes.rowCount === 0) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }

    const ticket = ticketRes.rows[0];

    if (ticket.status === 'blocked') {
      await client.query('COMMIT');
      return { status: 'blocked', ticket_code: ticket.ticket_code };
    }

    if (ticket.status === 'validated') {
      await client.query(
        `INSERT INTO entry_logs (ticket_id, event_id, entry_type, terminal_id, validator_id, is_duplicate, synced)
         VALUES ($1, $2, 'manual', $3, $4, true, true)`,
        [ticket.id, eventId, terminalId || null, validatorId || null]
      );
      await client.query('COMMIT');
      return {
        status: 'duplicate',
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        first_entry_at: ticket.validated_at
      };
    }

    const now = new Date();
    await client.query(
      `UPDATE tickets
       SET status = 'validated', validated_at = $1, updated_at = NOW()
       WHERE id = $2`,
      [now, ticket.id]
    );

    const logRes = await client.query(
      `INSERT INTO entry_logs (ticket_id, event_id, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
       VALUES ($1, $2, 'manual', $3, $4, false, true, $5)
       RETURNING id`,
      [ticket.id, eventId, terminalId || null, validatorId || null, now]
    );

    await client.query('COMMIT');
    return {
      status: 'authorized',
      ticket_code: ticket.ticket_code,
      display_name: ticket.display_name,
      batch: ticket.batch,
      entry_log_id: logRes.rows[0].id
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function searchTickets(eventId, queryText) {
  if (!queryText || queryText.length < 3) {
    throw new Error('A busca requer no mínimo 3 caracteres.');
  }

  const normalized = queryText.trim().toLowerCase();

  const result = await db.query(
    `SELECT id as ticket_id, ticket_code, display_name, batch, status
     FROM tickets
     WHERE event_id = $1 AND (display_name ILIKE $2 OR LOWER(ticket_code) LIKE $3)
     LIMIT 10`,
    [eventId, `%${normalized}%`, `%${normalized}%`]
  );

  return result.rows;
}

module.exports = {
  validateQRCode,
  validateManual,
  searchTickets
};
