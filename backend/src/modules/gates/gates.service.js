/**
 * Módulo de portões (Fase 2) — abertura/fechamento com timestamp.
 */
const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');

function apiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function listGates(eventId) {
  const result = await db.query(
    `SELECT g.id, g.event_id, g.name, g.opened_at, g.closed_at,
            g.opened_by, g.closed_by, g.created_at,
            o.name AS opened_by_name,
            c.name AS closed_by_name
     FROM gates g
     LEFT JOIN users o ON o.id = g.opened_by
     LEFT JOIN users c ON c.id = g.closed_by
     WHERE g.event_id = $1
     ORDER BY g.created_at ASC`,
    [eventId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    opened_at: row.opened_at,
    opened_by: row.opened_by_name || null,
    closed_at: row.closed_at,
    closed_by: row.closed_by_name || null,
    status: row.opened_at && !row.closed_at ? 'open' : 'closed',
  }));
}

async function createGate({ eventId, name }) {
  const gateName = name || 'Portão Principal';
  const result = await db.query(
    `INSERT INTO gates (event_id, name) VALUES ($1, $2)
     RETURNING id, name, opened_at, closed_at`,
    [eventId, gateName]
  );
  const gate = result.rows[0];
  return { ...gate, status: 'closed' };
}

async function openGate({ eventId, gateId, openedBy }) {
  if (!isValidUUIDv4(gateId)) {
    throw apiError(404, 'gate_not_found', 'Portão não encontrado.');
  }

  const result = await db.query(
    'SELECT id, opened_at, closed_at FROM gates WHERE id = $1 AND event_id = $2',
    [gateId, eventId]
  );
  if (result.rowCount === 0) {
    throw apiError(404, 'gate_not_found', 'Portão não encontrado.');
  }

  const gate = result.rows[0];
  if (gate.opened_at && !gate.closed_at) {
    throw apiError(422, 'gate_already_open', 'Portão já está aberto.');
  }

  const updated = await db.query(
    `UPDATE gates
     SET opened_at = NOW(), opened_by = $3, closed_at = NULL, closed_by = NULL
     WHERE id = $1 AND event_id = $2
     RETURNING id, name, opened_at, closed_at`,
    [gateId, eventId, openedBy || null]
  );

  return {
    ...updated.rows[0],
    opened_by: openedBy || null,
    status: 'open',
  };
}

async function closeGate({ eventId, gateId, closedBy }) {
  if (!isValidUUIDv4(gateId)) {
    throw apiError(404, 'gate_not_found', 'Portão não encontrado.');
  }

  const result = await db.query(
    'SELECT id, opened_at, closed_at FROM gates WHERE id = $1 AND event_id = $2',
    [gateId, eventId]
  );
  if (result.rowCount === 0) {
    throw apiError(404, 'gate_not_found', 'Portão não encontrado.');
  }

  const gate = result.rows[0];
  if (!gate.opened_at || gate.closed_at) {
    throw apiError(422, 'gate_not_open', 'Portão não está aberto.');
  }

  const updated = await db.query(
    `UPDATE gates
     SET closed_at = NOW(), closed_by = $3
     WHERE id = $1 AND event_id = $2
     RETURNING id, name, opened_at, closed_at`,
    [gateId, eventId, closedBy || null]
  );

  return {
    ...updated.rows[0],
    closed_by: closedBy || null,
    status: 'closed',
  };
}

module.exports = { listGates, createGate, openGate, closeGate };
