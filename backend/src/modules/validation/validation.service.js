const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ensureTerminal(client, eventId, terminalId) {
  if (!terminalId) return null;
  if (!UUID_RE.test(terminalId)) return null;
  await client.query(
    `INSERT INTO terminals (id, event_id, name, last_seen_at, online)
     VALUES ($1, $2, 'Terminal Móvel', NOW(), true)
     ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW(), online = true`,
    [terminalId, eventId]
  );
  return terminalId;
}

async function validateQRCode(eventId, terminalId, validatorId, ticketCode, tenantId) {
  const normalizedCode = ticketCode.trim().toLowerCase();
  if (!isValidUUIDv4(normalizedCode)) {
    return { status: 'not_found' };
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, validated_at, tenant_id
       FROM tickets
       WHERE event_id = $1 AND LOWER(ticket_code) = $2
         AND ($3::uuid IS NULL OR tenant_id = $3)
       FOR UPDATE`,
      [eventId, normalizedCode, tenantId || null]
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

    const safeTerminalId = await ensureTerminal(client, eventId, terminalId);

    if (ticket.status === 'validated') {
      // BUG-01: ingresso já validado (reentrada sem permissão) é DUPLICATA.
      await client.query(
        `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, terminal_id, validator_id, is_duplicate, synced)
         VALUES ($1, $2, $3, 'qrcode', $4, $5, true, true)`,
        [ticket.id, eventId, ticket.tenant_id, safeTerminalId, validatorId || null]
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
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
       VALUES ($1, $2, $3, 'qrcode', $4, $5, false, true, $6)
       RETURNING id`,
      [ticket.id, eventId, ticket.tenant_id, safeTerminalId, validatorId || null, now]
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

async function validateManual(eventId, terminalId, validatorId, ticketId, tenantId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, validated_at, tenant_id
       FROM tickets
       WHERE id = $1 AND event_id = $2
         AND ($3::uuid IS NULL OR tenant_id = $3)
       FOR UPDATE`,
      [ticketId, eventId, tenantId || null]
    );

    if (ticketRes.rowCount === 0) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }

    const ticket = ticketRes.rows[0];
    const safeTerminalId = await ensureTerminal(client, eventId, terminalId);

    if (ticket.status === 'blocked') {
      await client.query('COMMIT');
      return { status: 'blocked', ticket_code: ticket.ticket_code };
    }

    if (ticket.status === 'validated') {
      // BUG-01: ingresso já validado (reentrada sem permissão) é DUPLICATA.
      await client.query(
        `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, terminal_id, validator_id, is_duplicate, synced)
         VALUES ($1, $2, $3, 'manual', $4, $5, true, true)`,
        [ticket.id, eventId, ticket.tenant_id, safeTerminalId, validatorId || null]
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
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
       VALUES ($1, $2, $3, 'manual', $4, $5, false, true, $6)
       RETURNING id`,
      [ticket.id, eventId, ticket.tenant_id, safeTerminalId, validatorId || null, now]
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

async function searchTickets(eventId, queryText, tenantId) {
  if (!queryText || queryText.length < 3) {
    throw new Error('A busca requer no mínimo 3 caracteres.');
  }

  const normalized = queryText.trim().toLowerCase();

  const result = await db.query(
    `SELECT id as ticket_id, ticket_code, display_name, batch, status
     FROM tickets
     WHERE event_id = $1 AND (display_name ILIKE $2 OR LOWER(ticket_code) LIKE $3)
       AND ($4::uuid IS NULL OR tenant_id = $4)
     LIMIT 10`,
    [eventId, `%${normalized}%`, `%${normalized}%`, tenantId || null]
  );

  return result.rows;
}

async function lookupTicket(eventId, ticketCode, tenantId) {
  const normalizedCode = ticketCode.trim().toLowerCase();
  if (!isValidUUIDv4(normalizedCode)) {
    return { status: 'not_found' };
  }

  const result = await db.query(
    `SELECT ticket_code, display_name, batch, status, validated_at
     FROM tickets
     WHERE event_id = $1 AND LOWER(ticket_code) = $2
       AND ($3::uuid IS NULL OR tenant_id = $3)`,
    [eventId, normalizedCode, tenantId || null]
  );

  if (result.rowCount === 0) {
    return { status: 'not_found' };
  }

  const t = result.rows[0];
  return {
    status: t.status,
    ticket_code: t.ticket_code,
    display_name: t.display_name,
    batch: t.batch,
    first_entry_at: t.validated_at
  };
}

module.exports = {
  lookupTicket,
  validateQRCode,
  validateManual,
  searchTickets
};
