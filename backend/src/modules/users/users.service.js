const crypto = require('crypto');
const db = require('../../config/database');
const { cpfLookupHash } = require('../../utils/hash');
const { sendActivationEmail } = require('../../utils/email');

const VALID_ROLES = ['admin', 'supervisor', 'validator'];

const QUOTA_MAP = {
  admin: { resource: 'admins', column: 'max_admins' },
  supervisor: { resource: 'supervisors', column: 'max_supervisors' },
  validator: { resource: 'validators', column: 'max_validators' },
};

const PUBLIC_COLUMNS = `
  id, tenant_id, name, email, role, email_verified, active, created_at
`;

function apiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Lista usuários. Com tenantId, restringe ao tenant (admin);
 * sem tenantId (master), lista todos.
 */
async function listUsers(tenantId) {
  let query = `SELECT ${PUBLIC_COLUMNS} FROM users`;
  const params = [];
  if (tenantId) {
    query += ' WHERE tenant_id = $1';
    params.push(tenantId);
  }
  query += ' ORDER BY name';
  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Verifica a cota do tenant antes de criar o usuário.
 */
async function checkQuota(tenantId, role, quotaMap) {
  const clientRes = await db.query(
    `SELECT ${quotaMap.column}, active FROM clients WHERE id = $1`,
    [tenantId]
  );
  if (clientRes.rowCount === 0) {
    throw apiError(404, 'client_not_found', 'Cliente não encontrado.');
  }
  const client = clientRes.rows[0];
  if (!client.active) {
    throw apiError(403, 'tenant_suspended', 'Cliente suspenso. Não é possível criar usuários.');
  }

  const usedRes = await db.query(
    `SELECT COUNT(*)::int AS used FROM users
     WHERE tenant_id = $1 AND role = $2 AND active = true`,
    [tenantId, role]
  );
  const used = usedRes.rows[0].used;
  const max = client[quotaMap.column];

  if (used >= max) {
    const err = apiError(
      422,
      'quota_exceeded',
      `Cota de ${quotaMap.resource} atingida.`
    );
    err.resource = quotaMap.resource;
    err.used = used;
    err.max = max;
    throw err;
  }

  return { used, max };
}

/**
 * Cria usuário de um tenant (admin/master) com CPF + e-mail de ativação.
 * O usuário nasce sem senha (password_hash NULL) e com email_verified = false.
 */
async function createUser({ tenantId, name, cpf, email, role }) {
  if (!name || !cpf || !email) {
    throw apiError(400, 'missing_fields', 'name, cpf e email são obrigatórios.');
  }

  const finalRole = role || 'validator';
  if (!VALID_ROLES.includes(finalRole)) {
    throw apiError(400, 'invalid_role', `Role inválida. Use: ${VALID_ROLES.join(', ')}.`);
  }

  if (!tenantId) {
    throw apiError(400, 'tenant_required', 'Usuário precisa estar vinculado a um tenant.');
  }

  const quota = QUOTA_MAP[finalRole];
  await checkQuota(tenantId, finalRole, quota);

  const cleanEmail = String(email).toLowerCase().trim();
  const lookup = cpfLookupHash(cpf);
  const activationToken = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

  let result;
  try {
    result = await db.query(
      `INSERT INTO users
         (tenant_id, name, email, cpf_lookup_hash, role, email_verified, email_token, email_token_exp)
       VALUES ($1, $2, $3, $4, $5, false, $6, $7)
       RETURNING ${PUBLIC_COLUMNS}`,
      [tenantId, name, cleanEmail, lookup, finalRole, activationToken, exp]
    );
  } catch (error) {
    if (error.code === '23505') {
      const constraint = String(error.constraint || '');
      if (constraint.includes('cpf_lookup')) {
        throw apiError(409, 'cpf_already_exists', 'CPF já cadastrado.');
      }
      throw apiError(409, 'email_already_exists', 'E-mail já cadastrado.');
    }
    throw error;
  }

  const user = result.rows[0];

  // Envio do e-mail de ativação (best-effort — em dev/teste sem API key é suprimido)
  await sendActivationEmail(user.email, user.name, activationToken);

  return user;
}

async function updateUser(id, tenantId, fields) {
  const allowed = ['name', 'email', 'role', 'active', 'email_verified'];
  const updates = [];
  const params = [];
  let idx = 1;

  for (const field of allowed) {
    if (fields[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      params.push(fields[field]);
    }
  }

  if (updates.length === 0) return null;

  let query = `UPDATE users SET ${updates.join(', ')}`;
  if (tenantId) {
    // Admin só altera usuários do próprio tenant
    query += ` WHERE id = $${idx++} AND tenant_id = $${idx++}`;
    params.push(id, tenantId);
  } else {
    query += ` WHERE id = $${idx++}`;
    params.push(id);
  }
  query += ` RETURNING ${PUBLIC_COLUMNS}`;

  const result = await db.query(query, params);
  return result.rows[0] || null;
}

/**
 * Desativa usuário (active = false). Admin restrito ao próprio tenant.
 */
async function deactivateUser(id, tenantId) {
  let query = 'UPDATE users SET active = false';
  const params = [];
  if (tenantId) {
    query += ' WHERE id = $1 AND tenant_id = $2';
    params.push(id, tenantId);
  } else {
    query += ' WHERE id = $1';
    params.push(id);
  }
  query += ' RETURNING id';
  const result = await db.query(query, params);
  return result.rows[0] || null;
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  VALID_ROLES,
};
