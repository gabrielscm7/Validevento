const db = require('../../config/database');

async function getSnapshot(eventId, since, tenantId) {
  let queryText = `
    SELECT id, event_id, ticket_code, batch, display_name, status, updated_at, validated_at
    FROM tickets
    WHERE event_id = $1
      AND ($3::uuid IS NULL OR tenant_id = $3)
  `;
  const params = [eventId];

  if (since) {
    queryText += ' AND updated_at > $2';
    params.push(new Date(since));
  }
  params.push(tenantId || null);

  const result = await db.query(queryText, params);

  return {
    tickets: result.rows,
    last_sync_at: new Date(),
    total: result.rowCount
  };
}

async function processOfflineLogs(eventId, terminalId, validatorId, logs, tenantId) {
  const processedLogs = [];
  const errors = [];

  if (terminalId) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (isUUID.test(terminalId)) {
      try {
        await db.query(
          `INSERT INTO terminals (id, event_id, name, last_seen_at, online)
           VALUES ($1, $2, 'Terminal Móvel', NOW(), true)
           ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW(), online = true`,
          [terminalId, eventId]
        );
      } catch { /* silencioso — terminal pode já existir */ }
    }
  }

  for (const log of logs) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const logId = log.id || log.local_id;
      const { ticket_id, entry_type, created_at } = log;

      if (!ticket_id) {
        throw new Error('ticket_id é obrigatório no log.');
      }

      const logExistsRes = await client.query(
        'SELECT id FROM entry_logs WHERE id = $1',
        [logId]
      );

      if (logExistsRes.rowCount > 0) {
        await client.query('COMMIT');
        continue;
      }

      const ticketRes = await client.query(
        'SELECT status, validated_at, tenant_id FROM tickets WHERE id = $1 AND event_id = $2',
        [ticket_id, eventId]
      );

      if (ticketRes.rowCount === 0) {
        throw new Error(`Ticket ${ticket_id} não encontrado neste evento.`);
      }

      const ticket = ticketRes.rows[0];

      // Isolamento por tenant: rejeita logs de tickets de outro tenant
      if (tenantId && ticket.tenant_id !== tenantId) {
        throw new Error(`Ticket ${ticket_id} não pertence ao tenant do usuário.`);
      }

      let isDuplicate = false;

      if (ticket.status === 'validated') {
        isDuplicate = true;
      } else {
        await client.query(
          `UPDATE tickets
           SET status = 'validated', validated_at = $1, updated_at = NOW()
           WHERE id = $2`,
          [created_at || new Date(), ticket_id]
        );
      }

      await client.query(
        `INSERT INTO entry_logs (id, ticket_id, event_id, tenant_id, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
        [
          logId,
          ticket_id,
          eventId,
          ticket.tenant_id,
          entry_type || 'qrcode',
          terminalId || null,
          validatorId || null,
          isDuplicate,
          created_at || new Date()
        ]
      );

      await client.query('COMMIT');
      processedLogs.push({ logId, isDuplicate });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Erro ao processar log individual ${log.id}:`, err.message);
      errors.push({ logId: log.id, reason: err.message });
    } finally {
      client.release();
    }
  }

  return {
    processed_count: processedLogs.length,
    processed: processedLogs,
    errors
  };
}

async function registerHeartbeat(eventId, terminalId, name) {
  let terminalUUID = terminalId;

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!terminalUUID || !isUUID.test(terminalUUID)) {
    const insertRes = await db.query(
      `INSERT INTO terminals (event_id, name, last_seen_at, last_sync_at, online)
       VALUES ($1, $2, NOW(), NOW(), true)
       RETURNING id`,
      [eventId, name || 'Terminal Móvel Sem Nome']
    );
    terminalUUID = insertRes.rows[0].id;
  } else {
    const updateRes = await db.query(
      `UPDATE terminals
       SET name = COALESCE($1, name), last_seen_at = NOW(), online = true
       WHERE id = $2 AND event_id = $3
       RETURNING id`,
      [name, terminalUUID, eventId]
    );

    if (updateRes.rowCount === 0) {
      await db.query(
        `INSERT INTO terminals (id, event_id, name, last_seen_at, last_sync_at, online)
         VALUES ($1, $2, $3, NOW(), NOW(), true)`,
        [terminalUUID, eventId, name || 'Terminal Restaurado']
      );
    }
  }

  return terminalUUID;
}

module.exports = {
  getSnapshot,
  processOfflineLogs,
  registerHeartbeat
};
