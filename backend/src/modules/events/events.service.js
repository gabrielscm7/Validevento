/**
 * Módulo de eventos (Fase 2) — CRUD completo multi-evento por tenant.
 * Preserva a função legada getActiveEvent usada pela rota /api/events/active.
 */
const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');

const VALID_STATUS = ['draft', 'active', 'closed'];

function apiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/** Lista resumida dos eventos do tenant, com filtro opcional de status. */
async function listEvents({ tenantId, isMaster, status, filterTenantId }) {
  const params = [];
  let where = 'WHERE 1=1';

  if (!isMaster || filterTenantId) {
    where += ` AND e.tenant_id = $${params.length + 1}`;
    params.push(isMaster ? filterTenantId : tenantId);
  }
  if (status) {
    where += ` AND e.status = $${params.length + 1}`;
    params.push(status);
  }

  const result = await db.query(
    `SELECT e.id, e.name, e.date, e.location, e.capacity, e.status,
            e.expected_start, e.created_at,
            (SELECT COUNT(*)::int FROM tickets t WHERE t.event_id = e.id)  AS tickets_count,
            (SELECT COUNT(*)::int FROM tickets t
              WHERE t.event_id = e.id AND t.status = 'validated')          AS validated_count
     FROM events e
     ${where}
     ORDER BY e.date DESC`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    date: row.date,
    location: row.location,
    capacity: row.capacity,
    status: row.status,
    expected_start: row.expected_start,
    created_at: row.created_at,
    tickets_count: row.tickets_count,
    validated_count: row.validated_count,
  }));
}

/** Cria evento + event_config padrão em transação. */
async function createEvent({
  tenantId, name, date, expectedStart, location, capacity, responsible, bannerUrl, logoUrl, createdBy,
}) {
  if (!tenantId) {
    throw apiError(400, 'tenant_required', 'Evento precisa estar vinculado a um tenant.');
  }
  if (!name || !date) {
    throw apiError(400, 'missing_fields', 'name e date são obrigatórios.');
  }

  const finalCapacity = capacity !== undefined && capacity !== null ? capacity : 3000;
  const responsibleArr = Array.isArray(responsible) ? responsible : [];

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const eventRes = await client.query(
      `INSERT INTO events
         (tenant_id, name, date, expected_start, location, capacity, responsible,
          status, active, banner_url, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', false, $8, $9)
       RETURNING *`,
      [
        tenantId, name, date, expectedStart || null, location || null, finalCapacity, responsibleArr,
        bannerUrl || null, logoUrl || null,
      ]
    );
    const event = eventRes.rows[0];

    const configRes = await client.query(
      `INSERT INTO event_config (event_id) VALUES ($1)
       RETURNING *`,
      [event.id]
    );

    await client.query('COMMIT');

    return { ...event, event_config: configRes.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Busca evento com config e estatísticas completas. */
async function getEventById(eventId) {
  if (!isValidUUIDv4(eventId)) return null;

  const eventRes = await db.query('SELECT * FROM events WHERE id = $1', [eventId]);
  if (eventRes.rowCount === 0) return null;
  const event = eventRes.rows[0];

  const [configRes, statsRes, gatesRes, terminalsRes] = await Promise.all([
    db.query('SELECT * FROM event_config WHERE event_id = $1', [eventId]),
    db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tickets t WHERE t.event_id = $1)                                  AS tickets_count,
         (SELECT COUNT(*)::int FROM tickets t WHERE t.event_id = $1 AND t.status = 'validated')       AS validated_count`,
      [eventId]
    ),
    db.query(
      `SELECT id, name, opened_at, opened_by, closed_at, closed_by
       FROM gates WHERE event_id = $1 ORDER BY created_at ASC`,
      [eventId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS active_terminals
       FROM terminals WHERE event_id = $1 AND online = true`,
      [eventId]
    ),
  ]);

  const gates = gatesRes.rows.map((g) => ({
    ...g,
    is_open: !!(g.opened_at && !g.closed_at),
  }));
  const openGate = gates.find((g) => g.is_open) || null;

  return {
    ...event,
    event_config: configRes.rows[0] || null,
    tickets_count: statsRes.rows[0].tickets_count,
    validated_count: statsRes.rows[0].validated_count,
    active_terminals: terminalsRes.rows[0].active_terminals,
    gates,
    gate_status: {
      status: openGate ? 'open' : 'closed',
      opened_at: openGate ? openGate.opened_at : null,
      closed_at: openGate ? null : (gates.length ? gates[gates.length - 1].closed_at : null),
    },
  };
}

/**
 * Atualiza dados do evento. Não permite editar evento fechado.
 */
async function updateEvent(eventId, fields) {
  const existing = await db.query(
    'SELECT id, status FROM events WHERE id = $1', [eventId]
  );
  if (existing.rowCount === 0) return null;
  if (existing.rows[0].status === 'closed') {
    throw apiError(422, 'event_closed', 'Evento encerrado é imutável.');
  }

  const allowed = ['name', 'date', 'location', 'capacity', 'responsible', 'banner_url', 'logo_url'];
  const updates = [];
  const params = [];
  let idx = 1;

  for (const field of allowed) {
    if (fields[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      params.push(fields[field]);
    }
  }
  if (updates.length === 0) {
    throw apiError(400, 'no_fields', 'Nenhum campo para atualizar.');
  }

  params.push(eventId);
  const result = await db.query(
    `UPDATE events SET ${updates.join(', ')} WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Transição de status. draft → active registra abertura; active → closed
 * registra encerramento. Evento fechado (closed) é imutável.
 */
async function changeEventStatus(eventId, newStatus) {
  if (!VALID_STATUS.includes(newStatus)) {
    throw apiError(422, 'invalid_status', `Status inválido. Use: ${VALID_STATUS.join(' | ')}.`);
  }

  const existing = await db.query(
    'SELECT id, status FROM events WHERE id = $1', [eventId]
  );
  if (existing.rowCount === 0) return null;

  const current = existing.rows[0].status;

  if (current === 'closed') {
    throw apiError(422, 'event_closed', 'Evento encerrado é imutável.');
  }

  // draft → active (abertura) | draft → closed (cancelamento) | active → closed (encerramento)
  const allowedTransitions = { draft: ['active', 'closed'], active: ['closed'] };
  if (!allowedTransitions[current] || !allowedTransitions[current].includes(newStatus)) {
    throw apiError(
      422,
      'invalid_transition',
      `Transição de status '${current}' → '${newStatus}' não permitida.`
    );
  }

  const now = new Date();
  const activeFlag = newStatus === 'active';
  const result = await db.query(
    `UPDATE events
     SET status = $2,
         active = $3
     WHERE id = $1
     RETURNING *`,
    [eventId, newStatus, activeFlag]
  );
  const event = result.rows[0];

  // Estado imutável de auditoria: registra timestamps da transição
  const details = { from: current, to: newStatus };
  if (newStatus === 'active') details.opened_at = now.toISOString();
  if (newStatus === 'closed') details.closed_at = now.toISOString();

  return { event, transition: details };
}

module.exports = {
  listEvents,
  createEvent,
  getEventById,
  updateEvent,
  changeEventStatus,
  getActiveEvent: async () => {
    const result = await db.query(
      `SELECT id, name, date, location, capacity
       FROM events
       WHERE active = true
       ORDER BY created_at DESC
       LIMIT 1`
    );
    return result.rows[0] || null;
  },
};
