const db = require('../../config/database');

const PUBLIC_COLUMNS = `
  id, name, cnpj, email, plan,
  max_admins, max_supervisors, max_validators,
  max_tickets_per_event, max_events_active, active, created_at
`;

async function listClients() {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS} FROM clients ORDER BY name`
  );
  return result.rows;
}

async function getClientById(id) {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS} FROM clients WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createClient(data) {
  const {
    name, cnpj, email, plan,
    max_admins, max_supervisors, max_validators,
    max_tickets_per_event, max_events_active,
  } = data;

  if (!name || !email) {
    const err = new Error('name e email são obrigatórios.');
    err.status = 400;
    throw err;
  }

  const result = await db.query(
    `INSERT INTO clients (
       name, cnpj, email, plan,
       max_admins, max_supervisors, max_validators,
       max_tickets_per_event, max_events_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      name, cnpj || null, email, plan || 'basic',
      max_admins !== undefined ? max_admins : 2,
      max_supervisors !== undefined ? max_supervisors : 5,
      max_validators !== undefined ? max_validators : 10,
      max_tickets_per_event !== undefined ? max_tickets_per_event : 3000,
      max_events_active !== undefined ? max_events_active : 1,
    ]
  );

  return result.rows[0];
}

async function updateClient(id, data) {
  const current = await getClientById(id);
  if (!current) return null;

  const fields = [];
  const params = [];
  let idx = 1;

  const allowed = [
    'name', 'cnpj', 'email', 'plan',
    'max_admins', 'max_supervisors', 'max_validators',
    'max_tickets_per_event', 'max_events_active', 'active',
  ];

  for (const field of allowed) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${idx++}`);
      params.push(data[field]);
    }
  }

  if (fields.length === 0) return current;

  params.push(id);
  const result = await db.query(
    `UPDATE clients SET ${fields.join(', ')} WHERE id = $${idx}
     RETURNING ${PUBLIC_COLUMNS}`,
    params
  );

  return result.rows[0] || null;
}

async function setActive(id, active) {
  const result = await db.query(
    `UPDATE clients SET active = $2 WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, active]
  );
  return result.rows[0] || null;
}

/**
 * Uso atual vs. cotas do cliente.
 * Retorna { admins, supervisors, validators, tickets_this_month, events_active }
 * cada um com { used, max }.
 */
async function getUsage(clientId) {
  const clientRes = await db.query(
    `SELECT max_admins, max_supervisors, max_validators,
            max_tickets_per_event, max_events_active
     FROM clients WHERE id = $1`,
    [clientId]
  );
  if (clientRes.rowCount === 0) return null;

  const client = clientRes.rows[0];

  // Usuários ativos por perfil dentro do tenant
  const rolesRes = await db.query(
    `SELECT role, COUNT(*)::int AS used
     FROM users
     WHERE tenant_id = $1 AND active = true
     GROUP BY role`,
    [clientId]
  );
  const byRole = {};
  for (const row of rolesRes.rows) byRole[row.role] = row.used;

  // Ingressos importados/gerados no mês corrente
  const ticketsRes = await db.query(
    `SELECT COUNT(*)::int AS used
     FROM tickets
     WHERE tenant_id = $1 AND imported_at >= date_trunc('month', now())`,
    [clientId]
  );

  // Eventos em operação (v2 usa status='active'; v1 usava active=true)
  const eventsRes = await db.query(
    `SELECT COUNT(*)::int AS used
     FROM events
     WHERE tenant_id = $1 AND (status = 'active' OR (status = 'draft' AND active = true))`,
    [clientId]
  );

  return {
    admins: { used: byRole.admin || 0, max: client.max_admins },
    supervisors: { used: byRole.supervisor || 0, max: client.max_supervisors },
    validators: { used: byRole.validator || 0, max: client.max_validators },
    tickets_this_month: { used: ticketsRes.rows[0].used, max: client.max_tickets_per_event },
    events_active: { used: eventsRes.rows[0].used, max: client.max_events_active },
  };
}

module.exports = {
  listClients,
  getClientById,
  createClient,
  updateClient,
  setActive,
  getUsage,
};
