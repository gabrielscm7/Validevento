/**
 * Módulo de ingressos de emergência (Fase 2):
 *  - Ingresso master (master_tickets) por evento
 *  - Convite avulso (origin cortesia)
 *  - Liberação em lista via CSV (origin liberacao_especial)
 */
const crypto = require('crypto');
const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');

function apiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Verifica a cota de ingressos do evento antes de criar novos ingressos.
 * Compara o total atual de tickets do evento com clients.max_tickets_per_event.
 */
async function checkTicketQuota(eventId, tenantId, extra = 0) {
  const clientRes = await db.query(
    'SELECT max_tickets_per_event FROM clients WHERE id = $1',
    [tenantId]
  );
  if (clientRes.rowCount === 0) {
    throw apiError(404, 'client_not_found', 'Cliente não encontrado.');
  }
  const max = clientRes.rows[0].max_tickets_per_event;

  const usedRes = await db.query(
    'SELECT COUNT(*)::int AS used FROM tickets WHERE event_id = $1',
    [eventId]
  );
  const used = usedRes.rows[0].used;

  if (used + extra > max) {
    const err = apiError(422, 'quota_exceeded', 'Cota de ingressos do evento atingida.');
    err.used = used;
    err.max = max;
    throw err;
  }
  return { used, max };
}

async function getConfigFlag(eventId) {
  const result = await db.query(
    'SELECT master_ticket_enabled FROM event_config WHERE event_id = $1',
    [eventId]
  );
  return result.rows[0] || { master_ticket_enabled: false };
}

// ───────────────────────────────
// Ingresso master
// ───────────────────────────────

async function getMasterTicket(eventId) {
  const result = await db.query(
    `SELECT id, event_id, max_uses, uses_count, active, created_at
     FROM master_tickets
     WHERE event_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [eventId]
  );
  if (result.rowCount === 0) return null;
  const mt = result.rows[0];
  return {
    id: mt.id,
    max_uses: mt.max_uses,
    uses_count: mt.uses_count,
    uses_remaining: mt.max_uses === null ? null : mt.max_uses - mt.uses_count,
    active: mt.active,
    created_at: mt.created_at,
  };
}

async function getActiveMasterTicket(eventId) {
  const result = await db.query(
    `SELECT id, event_id, max_uses, uses_count, active
     FROM master_tickets
     WHERE event_id = $1 AND active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [eventId]
  );
  return result.rows[0] || null;
}

/**
 * Cria (ou atualiza — upsert) o ingresso master do evento.
 * Requer master_ticket_enabled = true no event_config.
 */
async function upsertMasterTicket({ eventId, createdBy, maxUses }) {
  const config = await getConfigFlag(eventId);
  if (!config.master_ticket_enabled) {
    throw apiError(422, 'master_ticket_disabled', 'Ingresso master não está habilitado na configuração do evento.');
  }

  const existing = await db.query(
    'SELECT id FROM master_tickets WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
    [eventId]
  );

  let result;
  if (existing.rowCount > 0) {
    result = await db.query(
      `UPDATE master_tickets
       SET max_uses = $2, active = true
       WHERE id = $1
       RETURNING id`,
      [existing.rows[0].id, maxUses === undefined || maxUses === null ? null : maxUses]
    );
  } else {
    result = await db.query(
      `INSERT INTO master_tickets (event_id, created_by, max_uses, active)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [eventId, createdBy || null, maxUses === undefined || maxUses === null ? null : maxUses]
    );
  }

  return getMasterTicket(eventId);
}

/** Desativa o ingresso master (active = false), sem excluir. */
async function deactivateMasterTicket(eventId) {
  const existing = await db.query(
    'SELECT id FROM master_tickets WHERE event_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1',
    [eventId]
  );
  if (existing.rowCount === 0) return null;

  await db.query(
    'UPDATE master_tickets SET active = false WHERE id = $1',
    [existing.rows[0].id]
  );
  return getMasterTicket(eventId);
}

/**
 * Registra o uso do ingresso master e grava o entry_log.
 * Retorna erro de limite quando uses_count >= max_uses (e max_uses não-nulo).
 */
async function useMasterTicket({ eventId, tenantId, terminalId, validatorId, beneficiaryName }) {
  if (!isValidUUIDv4(eventId)) {
    throw apiError(404, 'event_not_found', 'Evento não encontrado.');
  }
  if (!beneficiaryName || !String(beneficiaryName).trim()) {
    throw apiError(400, 'missing_fields', 'beneficiary_name é obrigatório.');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const eventRes = await client.query(
      'SELECT id, tenant_id FROM events WHERE id = $1', [eventId]
    );
    if (eventRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw apiError(404, 'event_not_found', 'Evento não encontrado.');
    }
    if (eventRes.rows[0].tenant_id !== tenantId) {
      await client.query('ROLLBACK');
      throw apiError(403, 'cross_tenant', 'Evento não pertence ao seu cliente.');
    }

    const mtRes = await client.query(
      `SELECT id, max_uses, uses_count, active
       FROM master_tickets
       WHERE event_id = $1 AND active = true
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [eventId]
    );

    if (mtRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw apiError(404, 'master_ticket_not_found', 'Ingresso master não existe ou está inativo.');
    }
    const mt = mtRes.rows[0];

    if (mt.max_uses !== null && mt.uses_count >= mt.max_uses) {
      await client.query('ROLLBACK');
      const err = apiError(422, 'master_ticket_limit_reached', 'Limite de usos do ingresso master atingido.');
      err.uses_count = mt.uses_count;
      err.max_uses = mt.max_uses;
      throw err;
    }

    const newUses = mt.uses_count + 1;
    await client.query(
      'UPDATE master_tickets SET uses_count = $2 WHERE id = $1',
      [mt.id, newUses]
    );

    const logRes = await client.query(
      `INSERT INTO entry_logs
         (ticket_id, event_id, tenant_id, entry_type, beneficiary, terminal_id, validator_id, is_duplicate, synced)
       VALUES (NULL, $1, $2, 'master', $3, $4, $5, false, true)
       RETURNING id`,
      [eventId, tenantId, String(beneficiaryName).trim(), terminalId || null, validatorId || null]
    );

    await client.query('COMMIT');

    return {
      status: 'authorized',
      entry_type: 'master',
      uses_count: newUses,
      uses_remaining: mt.max_uses === null ? null : mt.max_uses - newUses,
      entry_log_id: logRes.rows[0].id,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ───────────────────────────────
// Convite avulso
// ───────────────────────────────

async function createInvitation({ eventId, tenantId, displayName, cpf, createdBy }) {
  if (!displayName || !String(displayName).trim()) {
    throw apiError(400, 'missing_fields', 'display_name é obrigatório.');
  }

  await checkTicketQuota(eventId, tenantId, 1);

  const ticketCode = crypto.randomUUID();
  const result = await db.query(
    `INSERT INTO tickets
       (event_id, tenant_id, ticket_code, batch, display_name, status, origin)
     VALUES ($1, $2, $3, 'CORTESIA', $4, 'active', 'cortesia')
     RETURNING id, ticket_code, display_name, status, origin`,
    [eventId, tenantId, ticketCode, String(displayName).trim()]
  );

  const ticket = result.rows[0];
  return {
    ticket_code: ticket.ticket_code,
    display_name: ticket.display_name,
    origin: ticket.origin,
    status: ticket.status,
    qrcode_data: ticket.ticket_code,
    id: ticket.id,
  };
}

/**
 * Liberação em lista: processa linhas CSV e insere tickets com origem
 * liberacao_especial. Verifica a cota TOTAL antes de processar.
 */
async function bulkInvitations({ eventId, tenantId, rows, createdBy }) {
  const validRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    const lineNumber = row.__line || index + 1;
    const displayName = row.display_name || row.nome || row.name;
    if (!displayName || !String(displayName).trim()) {
      errors.push({ line: lineNumber, reason: 'display_name ausente.' });
      return;
    }
    validRows.push({ displayName: String(displayName).trim(), cpf: row.cpf || null });
  });

  if (validRows.length === 0) {
    return { inserted: 0, errors };
  }

  await checkTicketQuota(eventId, tenantId, validRows.length);

  let inserted = 0;
  for (const row of validRows) {
    const ticketCode = crypto.randomUUID();
    try {
      await db.query(
        `INSERT INTO tickets
           (event_id, tenant_id, ticket_code, batch, display_name, status, origin)
         VALUES ($1, $2, $3, 'LIBERACAO', $4, 'active', 'liberacao_especial')`,
        [eventId, tenantId, ticketCode, row.displayName]
      );
      inserted++;
    } catch (error) {
      errors.push({ line: 0, reason: error.message });
    }
  }

  return { inserted, errors };
}

module.exports = {
  getMasterTicket,
  getActiveMasterTicket,
  upsertMasterTicket,
  deactivateMasterTicket,
  useMasterTicket,
  createInvitation,
  bulkInvitations,
  checkTicketQuota,
};
