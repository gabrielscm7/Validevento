/**
 * Módulo de validação (Fase 2) — check-in com reentry_mode, checkout e
 * integração do ingresso master. Mantém a correção do BUG-01.
 */
const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');
const invitationsService = require('../invitations/invitations.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_CONFIG = {
  qrcode_field: 'ticket_code',
  manual_fields: ['display_name'],
  checkout_enabled: false,
  reentry_mode: 'none',
  duplicate_action: 'warn',
  master_ticket_enabled: false,
};

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

/** Lê a config do evento; se ausente, usa defaults (compatível com v1). */
async function getEventConfig(client, eventId) {
  const result = await client.query(
    `SELECT ec.*, e.status AS event_status, e.tenant_id AS event_tenant_id
     FROM event_config ec
     JOIN events e ON e.id = ec.event_id
     WHERE ec.event_id = $1`,
    [eventId]
  );
  if (result.rowCount === 0) {
    const eventRes = await client.query(
      'SELECT status, tenant_id FROM events WHERE id = $1', [eventId]
    );
    if (eventRes.rowCount === 0) return null;
    return {
      ...DEFAULT_CONFIG,
      event_status: eventRes.rows[0].status,
      event_tenant_id: eventRes.rows[0].tenant_id,
    };
  }
  return { ...DEFAULT_CONFIG, ...result.rows[0] };
}

function buildDuplicate(config, ticket) {
  const response = {
    status: 'duplicate',
    ticket_code: ticket.ticket_code,
    display_name: ticket.display_name,
    first_entry_at: ticket.validated_at,
  };
  if (config.duplicate_action === 'warn') {
    response.warning = true;
  }
  return response;
}

async function validateQRCode(eventId, terminalId, validatorId, ticketCode, tenantId) {
  const normalizedCode = ticketCode.trim().toLowerCase();
  if (!isValidUUIDv4(normalizedCode)) {
    return { status: 'not_found' };
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const config = await getEventConfig(client, eventId);
    if (!config) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }
    if (tenantId && config.event_tenant_id !== tenantId) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }

    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, validated_at, checkout_at, tenant_id
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
    const now = new Date();

    // ── Ingresso ativo → primeira entrada (autorizada) ──
    if (ticket.status === 'active') {
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
        entry_log_id: logRes.rows[0].id,
      };
    }

    // ── Ingresso já validado → aplica reentry_mode (BUG-01 corrigido) ──
    if (ticket.status === 'validated') {
      const mode = config.reentry_mode || 'none';

      if (mode === 'none') {
        await client.query('COMMIT');
        return buildDuplicate(config, ticket);
      }

      if (mode === 'free') {
        const logRes = await client.query(
          `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
           VALUES ($1, $2, $3, 'qrcode', $4, $5, false, true, $6)
           RETURNING id`,
          [ticket.id, eventId, ticket.tenant_id, safeTerminalId, validatorId || null, now]
        );
        await client.query('COMMIT');
        return {
          status: 'authorized',
          reentry: true,
          ticket_code: ticket.ticket_code,
          display_name: ticket.display_name,
          batch: ticket.batch,
          entry_log_id: logRes.rows[0].id,
        };
      }

      // mode === 'conditioned'
      if (!ticket.checkout_at) {
        await client.query('COMMIT');
        return buildDuplicate(config, ticket);
      }

      // Reentrada condicionada válida: zera checkout e registra nova entrada
      await client.query(
        `UPDATE tickets SET checkout_at = NULL, updated_at = NOW() WHERE id = $1`,
        [ticket.id]
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
        reentry: true,
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        batch: ticket.batch,
        entry_log_id: logRes.rows[0].id,
      };
    }

    await client.query('COMMIT');
    return { status: 'not_found' };
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

    const config = await getEventConfig(client, eventId);
    if (!config) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }
    if (tenantId && config.event_tenant_id !== tenantId) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }

    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, validated_at, checkout_at, tenant_id
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
    const now = new Date();

    if (ticket.status === 'blocked') {
      await client.query('COMMIT');
      return { status: 'blocked', ticket_code: ticket.ticket_code };
    }

    if (ticket.status === 'active') {
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
        entry_log_id: logRes.rows[0].id,
      };
    }

    if (ticket.status === 'validated') {
      const mode = config.reentry_mode || 'none';

      if (mode === 'none') {
        await client.query('COMMIT');
        return buildDuplicate(config, ticket);
      }

      if (mode === 'free') {
        const logRes = await client.query(
          `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
           VALUES ($1, $2, $3, 'manual', $4, $5, false, true, $6)
           RETURNING id`,
          [ticket.id, eventId, ticket.tenant_id, safeTerminalId, validatorId || null, now]
        );
        await client.query('COMMIT');
        return {
          status: 'authorized',
          reentry: true,
          ticket_code: ticket.ticket_code,
          display_name: ticket.display_name,
          batch: ticket.batch,
          entry_log_id: logRes.rows[0].id,
        };
      }

      if (!ticket.checkout_at) {
        await client.query('COMMIT');
        return buildDuplicate(config, ticket);
      }

      await client.query(
        `UPDATE tickets SET checkout_at = NULL, updated_at = NOW() WHERE id = $1`,
        [ticket.id]
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
        reentry: true,
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        batch: ticket.batch,
        entry_log_id: logRes.rows[0].id,
      };
    }

    await client.query('COMMIT');
    return { status: 'not_found' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ────────────────────────────────────────────────
// Checkout
// ────────────────────────────────────────────────

/**
 * Registra a saída do participante.
 * Regras: checkout_enabled no event_config; ingresso validated com
 * checkout_at NULL. Retorna erros normalizados.
 */
async function checkout({ eventId, terminalId, validatorId, ticketCode, tenantId }) {
  const normalizedCode = String(ticketCode || '').trim().toLowerCase();
  if (!normalizedCode) return { error: 'ticket_not_found' };

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const config = await getEventConfig(client, eventId);
    if (!config) {
      await client.query('COMMIT');
      return { error: 'ticket_not_found' };
    }
    if (tenantId && config.event_tenant_id !== tenantId) {
      await client.query('COMMIT');
      return { error: 'ticket_not_found' };
    }

    if (!config.checkout_enabled) {
      await client.query('COMMIT');
      return { error: 'checkout_disabled' };
    }

    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, status, validated_at, checkout_at, tenant_id
       FROM tickets
       WHERE event_id = $1 AND LOWER(ticket_code) = $2
         AND ($3::uuid IS NULL OR tenant_id = $3)
       FOR UPDATE`,
      [eventId, normalizedCode, tenantId || null]
    );

    if (ticketRes.rowCount === 0) {
      await client.query('COMMIT');
      return { error: 'ticket_not_found' };
    }

    const ticket = ticketRes.rows[0];

    if (ticket.status !== 'validated') {
      await client.query('COMMIT');
      return { error: 'not_checked_in' };
    }

    if (ticket.checkout_at) {
      await client.query('COMMIT');
      return { error: 'already_checked_out' };
    }

    const safeTerminalId = await ensureTerminal(client, eventId, terminalId);
    const now = new Date();

    await client.query(
      `UPDATE tickets SET checkout_at = $1, updated_at = NOW() WHERE id = $2`,
      [now, ticket.id]
    );

    // Registra checkout no entry_log correspondente (última entrada sem saída)
    const logRes = await client.query(
      `UPDATE entry_logs
       SET checkout_at = $1
       WHERE id = (
         SELECT id FROM entry_logs
         WHERE ticket_id = $2 AND event_id = $3
           AND checkout_at IS NULL AND is_duplicate = false
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING id, created_at AS entry_at, checkout_at`,
      [now, ticket.id, eventId]
    );

    const entryLog = logRes.rows[0] || null;

    await client.query('COMMIT');

    const response = {
      status: 'checkout_registered',
      ticket_code: ticket.ticket_code,
      display_name: ticket.display_name,
      checkout_at: now,
    };
    if (entryLog) {
      response.entry_log_id = entryLog.id;
      response.entry_at = entryLog.entry_at;
    } else {
      response.entry_at = ticket.validated_at;
    }
    return response;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ────────────────────────────────────────────────
// Ingresso master (integração com invitations)
// ────────────────────────────────────────────────

async function useMaster({ eventId, terminalId, validatorId, beneficiaryName, tenantId }) {
  return invitationsService.useMasterTicket({
    eventId,
    tenantId,
    terminalId,
    validatorId,
    beneficiaryName,
  });
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
    first_entry_at: t.validated_at,
  };
}

module.exports = {
  lookupTicket,
  validateQRCode,
  validateManual,
  checkout,
  useMaster,
  searchTickets,
};
