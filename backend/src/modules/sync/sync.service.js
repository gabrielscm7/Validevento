/**
 * Módulo de sincronização offline (Fase 3 — v2).
 *
 * Mantém os endpoints da v1 (/snapshot, /logs, /heartbeat) e adiciona o
 * suporte completo à v2:
 *  - snapshot incremental com event_config + master_ticket
 *  - /logs no formato ticket_code com idempotência (±5s)
 *  - heartbeat com upsert de terminal
 *  - markOfflineTerminals() executado a cada 2 minutos pelo app.js
 */
const db = require('../../config/database');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_CONFIG = {
  qrcode_field: 'ticket_code',
  manual_fields: ['display_name'],
  checkout_enabled: false,
  reentry_mode: 'none',
  duplicate_action: 'warn',
  master_ticket_enabled: false,
};

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isValidDate(value) {
  return value && !Number.isNaN(new Date(value).getTime());
}

/** Upsert do terminal (por terminal_id quando UUID; senão gera um novo). */
async function upsertTerminal(eventId, terminalId, name) {
  if (!terminalId || !UUID_RE.test(terminalId)) {
    const res = await db.query(
      `INSERT INTO terminals (event_id, name, last_seen_at, last_sync_at, online)
       VALUES ($1, $2, NOW(), NOW(), true)
       RETURNING id`,
      [eventId, name || 'Terminal Móvel']
    );
    return res.rows[0].id;
  }

  const existing = await db.query(
    'SELECT id FROM terminals WHERE id = $1 AND event_id = $2',
    [terminalId, eventId]
  );

  if (existing.rowCount > 0) {
    await db.query(
      `UPDATE terminals
       SET name = COALESCE($1, name), last_seen_at = NOW(), last_sync_at = NOW(), online = true
       WHERE id = $2 AND event_id = $3`,
      [name || null, terminalId, eventId]
    );
  } else {
    await db.query(
      `INSERT INTO terminals (id, event_id, name, last_seen_at, last_sync_at, online)
       VALUES ($1, $2, $3, NOW(), NOW(), true)`,
      [terminalId, eventId, name || 'Terminal Restaurado']
    );
  }
  return terminalId;
}

/** Garante que o evento existe e pertence ao tenant (quando houver tenant). */
async function assertEventAccess(eventId, tenantId) {
  const eventRes = await db.query(
    'SELECT id, tenant_id FROM events WHERE id = $1',
    [eventId]
  );
  if (eventRes.rowCount === 0) {
    throw apiError(404, 'Evento não encontrado.');
  }
  if (tenantId && eventRes.rows[0].tenant_id !== tenantId) {
    throw apiError(403, 'Acesso negado a este evento.');
  }
  return eventRes.rows[0];
}

// ────────────────────────────────────────────────
// Snapshot
// ────────────────────────────────────────────────

async function getEventConfig(eventId) {
  const result = await db.query(
    `SELECT qrcode_field, manual_fields, checkout_enabled,
            reentry_mode, duplicate_action, master_ticket_enabled
     FROM event_config
     WHERE event_id = $1`,
    [eventId]
  );
  if (result.rowCount === 0) return { ...DEFAULT_CONFIG };
  const row = result.rows[0];
  return {
    qrcode_field: row.qrcode_field,
    manual_fields: row.manual_fields,
    checkout_enabled: row.checkout_enabled,
    reentry_mode: row.reentry_mode,
    duplicate_action: row.duplicate_action,
    master_ticket_enabled: row.master_ticket_enabled,
  };
}

async function getMasterTicket(eventId) {
  const result = await db.query(
    `SELECT uses_count, max_uses, active
     FROM master_tickets
     WHERE event_id = $1 AND active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [eventId]
  );
  if (result.rowCount === 0) return null;
  const mt = result.rows[0];
  return {
    uses_count: mt.uses_count,
    max_uses: mt.max_uses,
    active: mt.active,
  };
}

/**
 * Snapshot incremental de ingressos do evento.
 * - Sem `since`: retorna todos os tickets do evento.
 * - Com `since`: retorna apenas tickets com updated_at > since.
 */
async function getSnapshot(eventId, since, tenantId, terminalId) {
  await assertEventAccess(eventId, tenantId);

  if (since !== undefined && since !== null && since !== '' && !isValidDate(since)) {
    throw apiError(400, 'Parâmetro since inválido. Use um timestamp ISO.');
  }

  const params = [eventId];
  let where = 'WHERE event_id = $1';
  if (tenantId) {
    where += ' AND tenant_id = $2';
    params.push(tenantId);
  }
  if (since) {
    params.push(new Date(since));
    where += ` AND updated_at > $${params.length}`;
  }

  const ticketsRes = await db.query(
    `SELECT ticket_code, display_name, batch, status, origin, checkout_at, updated_at
     FROM tickets
     ${where}
     ORDER BY updated_at ASC`,
    params
  );

  // Registra heartbeat do terminal (quando o terminal é informado na query)
  if (terminalId) {
    try {
      await upsertTerminal(eventId, terminalId);
    } catch { /* heartbeat nunca derruba o snapshot */ }
  }

  const [eventConfig, masterTicket] = await Promise.all([
    getEventConfig(eventId),
    getMasterTicket(eventId),
  ]);

  return {
    tickets: ticketsRes.rows,
    event_config: eventConfig,
    master_ticket: masterTicket,
    last_sync_at: new Date(),
    total: ticketsRes.rowCount,
  };
}

// ────────────────────────────────────────────────
// Processamento de logs offline
// ────────────────────────────────────────────────

/** Busca o ticket pelo ticket_code (v2) ou id (v1). */
async function findTicket(client, eventId, log, tenantId) {
  if (log.ticket_code) {
    const res = await client.query(
      `SELECT id, ticket_code, status, tenant_id, display_name
       FROM tickets
       WHERE event_id = $1 AND LOWER(ticket_code) = LOWER($2)
         AND ($3::uuid IS NULL OR tenant_id = $3)`,
      [eventId, String(log.ticket_code).trim(), tenantId || null]
    );
    return res.rows[0] || null;
  }
  if (log.ticket_id) {
    const res = await client.query(
      `SELECT id, ticket_code, status, tenant_id, display_name
       FROM tickets
       WHERE id = $1 AND event_id = $2
         AND ($3::uuid IS NULL OR tenant_id = $3)`,
      [log.ticket_id, eventId, tenantId || null]
    );
    return res.rows[0] || null;
  }
  return null;
}

/** Verifica idempotência: entry_log do mesmo ticket em até ±5s. */
async function findDuplicateLog(client, eventId, ticketId, entryType, createdAt, beneficiary) {
  const params = [eventId, ticketId, entryType, createdAt, createdAt, beneficiary || null];
  const res = await client.query(
    `SELECT id
     FROM entry_logs
     WHERE event_id = $1
       AND ticket_id IS NOT DISTINCT FROM $2
       AND entry_type = $3
       AND created_at BETWEEN ($4::timestamptz - interval '5 seconds')
                          AND ($5::timestamptz + interval '5 seconds')
       AND beneficiary IS NOT DISTINCT FROM $6
     LIMIT 1`,
    params
  );
  return res.rows[0] || null;
}

async function processCheckoutLog(client, eventId, ticket, log, tenantId) {
  const checkoutAt = isValidDate(log.checkout_at) ? new Date(log.checkout_at) : new Date();

  await client.query(
    `UPDATE tickets SET checkout_at = $1, updated_at = NOW() WHERE id = $2`,
    [checkoutAt, ticket.id]
  );

  // Espelha o comportamento do checkout online: marca a última entrada aberta.
  await client.query(
    `UPDATE entry_logs
     SET checkout_at = $1
     WHERE id = (
       SELECT id FROM entry_logs
       WHERE ticket_id = $2 AND event_id = $3
         AND checkout_at IS NULL AND is_duplicate = false
       ORDER BY created_at DESC
       LIMIT 1
     )`,
    [checkoutAt, ticket.id, eventId]
  );
}

async function processRegularLog(client, eventId, log, ticket, createdAt, tenantId) {
  const entryType = log.entry_type || 'qrcode';

  // Idempotência (±5s) — evita duplicatas de reenvio/rede
  const existing = await findDuplicateLog(
    client,
    eventId,
    ticket.id,
    entryType,
    createdAt,
    log.beneficiary
  );
  if (existing) {
    return { ignored: true };
  }

  if (ticket.status === 'active') {
    await client.query(
      `UPDATE tickets
       SET status = 'validated', validated_at = $1, updated_at = NOW()
       WHERE id = $2`,
      [createdAt, ticket.id]
    );
  }

  await client.query(
    `INSERT INTO entry_logs
       (ticket_id, event_id, tenant_id, entry_type, beneficiary,
        terminal_id, validator_id, is_duplicate, synced, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
    [
      ticket.id,
      eventId,
      tenantId || ticket.tenant_id,
      entryType,
      log.beneficiary || null,
      log.terminal_id || null,
      log.validator_id || null,
      log.is_duplicate === true,
      createdAt,
    ]
  );

  return { ignored: false };
}

async function processMasterLog(client, eventId, log, createdAt, tenantId, terminalId) {
  const mtRes = await client.query(
    `SELECT id, uses_count, max_uses, active
     FROM master_tickets
     WHERE event_id = $1 AND active = true
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [eventId]
  );

  if (mtRes.rowCount === 0) {
    throw new Error('Ingresso master não existe ou está inativo.');
  }

  const mt = mtRes.rows[0];
  if (mt.max_uses !== null && mt.uses_count >= mt.max_uses) {
    throw new Error('Limite de usos do ingresso master atingido.');
  }

  // Idempotência para usos master (mesmo beneficiário em ±5s)
  const existing = await client.query(
    `SELECT id FROM entry_logs
     WHERE event_id = $1 AND entry_type = 'master'
       AND beneficiary IS NOT DISTINCT FROM $2
       AND created_at BETWEEN ($3::timestamptz - interval '5 seconds')
                          AND ($3::timestamptz + interval '5 seconds')
     LIMIT 1`,
    [eventId, log.beneficiary || null, createdAt]
  );
  if (existing.rowCount > 0) {
    return { ignored: true };
  }

  await client.query(
    'UPDATE master_tickets SET uses_count = uses_count + 1 WHERE id = $1',
    [mt.id]
  );

  await client.query(
    `INSERT INTO entry_logs
       (ticket_id, event_id, tenant_id, entry_type, beneficiary,
        terminal_id, validator_id, is_duplicate, synced, created_at)
     VALUES (NULL, $1, $2, 'master', $3, $4, $5, false, true, $6)`,
    [
      eventId,
      tenantId,
      log.beneficiary || null,
      terminalId || log.terminal_id || null,
      log.validator_id || null,
      createdAt,
    ]
  );

  return { ignored: false };
}

/**
 * Persiste logs gerados offline.
 * Retorna { processed, ignored, errors: [{ local_id, reason }] }.
 */
async function processOfflineLogs(eventId, terminalId, validatorId, logs, tenantId) {
  await assertEventAccess(eventId, tenantId);

  if (terminalId) {
    try {
      await upsertTerminal(eventId, terminalId);
    } catch { /* silencioso */ }
  }

  let processed = 0;
  let ignored = 0;
  const errors = [];

  for (const log of logs) {
    const localId = log.local_id !== undefined ? log.local_id : (log.id !== undefined ? log.id : null);
    const createdAt = isValidDate(log.created_at) ? new Date(log.created_at) : new Date();
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Caso master não possui ticket vinculado
      if ((log.entry_type || '') === 'master') {
        const outcome = await processMasterLog(
          client, eventId, log, createdAt, tenantId, terminalId
        );
        if (outcome.ignored) ignored += 1;
        else processed += 1;
        await client.query('COMMIT');
        continue;
      }

      // Checkout offline: log carrega checkout_at
      if (isValidDate(log.checkout_at)) {
        const ticket = await findTicket(client, eventId, log, tenantId);
        if (!ticket) {
          throw new Error(`Ticket ${log.ticket_code || log.ticket_id} não encontrado neste evento.`);
        }
        await processCheckoutLog(client, eventId, ticket, log, tenantId);
        processed += 1;
        await client.query('COMMIT');
        continue;
      }

      const ticket = await findTicket(client, eventId, log, tenantId);
      if (!ticket) {
        throw new Error(`Ticket ${log.ticket_code || log.ticket_id} não encontrado neste evento.`);
      }

      const outcome = await processRegularLog(client, eventId, log, ticket, createdAt, tenantId);
      if (outcome.ignored) ignored += 1;
      else processed += 1;

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Erro ao processar log offline ${localId}:`, err.message);
      errors.push({ local_id: localId, reason: err.message });
    } finally {
      client.release();
    }
  }

  return { processed, ignored, errors };
}

// ────────────────────────────────────────────────
// Heartbeat
// ────────────────────────────────────────────────

/**
 * Atualiza o terminal (last_seen_at = now, online = true).
 * Cria o terminal se não existir (upsert pelo terminal_id).
 */
async function registerHeartbeat(eventId, terminalId, name, tenantId) {
  await assertEventAccess(eventId, tenantId);
  return upsertTerminal(eventId, terminalId, name);
}

/**
 * Marca como offline terminais sem heartbeat nos últimos 3 minutos.
 * Executada a cada 2 minutos pelo app.js (fora do modo de teste).
 */
async function markOfflineTerminals() {
  const result = await db.query(
    `UPDATE terminals
     SET online = false
     WHERE last_seen_at < NOW() - interval '3 minutes'
       AND online = true`
  );
  return result.rowCount;
}

module.exports = {
  getSnapshot,
  processOfflineLogs,
  registerHeartbeat,
  markOfflineTerminals,
};
