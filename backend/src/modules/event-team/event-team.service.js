/**
 * Módulo de equipe do evento (Fase 2) — event_team.
 */
const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');

const VALID_OVERRIDES = ['admin', 'supervisor', 'validator'];

function apiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function listTeam(eventId) {
  const result = await db.query(
    `SELECT u.id, u.name, u.email, u.role, et.role_override,
            (et.role_override IS NOT NULL) AS has_override
     FROM event_team et
     JOIN users u ON u.id = et.user_id
     WHERE et.event_id = $1
     ORDER BY u.name ASC`,
    [eventId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    role_override: row.role_override,
  }));
}

async function isMember(eventId, userId) {
  const result = await db.query(
    'SELECT 1 FROM event_team WHERE event_id = $1 AND user_id = $2',
    [eventId, userId]
  );
  return result.rowCount > 0;
}

async function addMember({ eventId, tenantId, userId, roleOverride }) {
  if (!isValidUUIDv4(userId)) {
    throw apiError(400, 'invalid_user', 'user_id inválido.');
  }
  if (roleOverride !== undefined && roleOverride !== null) {
    if (!VALID_OVERRIDES.includes(roleOverride)) {
      throw apiError(422, 'invalid_value', `role_override inválido. Use: ${VALID_OVERRIDES.join(' | ')}.`);
    }
  }

  // user_id deve pertencer ao MESMO tenant
  const userRes = await db.query(
    'SELECT id, tenant_id, role FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rowCount === 0) {
    throw apiError(404, 'user_not_found', 'Usuário não encontrado.');
  }
  const user = userRes.rows[0];
  if (user.tenant_id !== tenantId) {
    throw apiError(422, 'cross_tenant', 'Usuário não pertence ao mesmo tenant do evento.');
  }

  await db.query(
    `INSERT INTO event_team (event_id, user_id, role_override)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, user_id)
     DO UPDATE SET role_override = EXCLUDED.role_override`,
    [eventId, userId, roleOverride || null]
  );

  return listTeam(eventId);
}

/**
 * Remove usuário da equipe. Bloqueia se o evento estiver 'active' e o
 * usuário tiver sessão ativa (atividade recente de validação = online no
 * terminal).
 */
async function removeMember({ eventId, userId }) {
  if (!isValidUUIDv4(userId)) {
    throw apiError(400, 'invalid_user', 'user_id inválido.');
  }

  const eventRes = await db.query(
    'SELECT status FROM events WHERE id = $1', [eventId]
  );
  if (eventRes.rowCount === 0) return null;

  if (eventRes.rows[0].status === 'active') {
    const activeRes = await db.query(
      `SELECT 1 FROM entry_logs
       WHERE event_id = $1 AND validator_id = $2
         AND created_at >= NOW() - INTERVAL '10 minutes'
       LIMIT 1`,
      [eventId, userId]
    );
    if (activeRes.rowCount > 0) {
      throw apiError(
        422,
        'user_online',
        'Não é possível remover um usuário com sessão ativa (online no terminal) durante o evento.'
      );
    }
  }

  const result = await db.query(
    'DELETE FROM event_team WHERE event_id = $1 AND user_id = $2 RETURNING user_id',
    [eventId, userId]
  );
  return result.rowCount > 0;
}

module.exports = { listTeam, isMember, addMember, removeMember };
