const bcrypt = require('bcryptjs');
const db = require('../../config/database');

async function listUsers() {
  const result = await db.query(
    'SELECT id, name, email, role, active, created_at FROM users ORDER BY name'
  );
  return result.rows;
}

async function createUser({ name, email, password, role }) {
  const hash = await bcrypt.hash(password, 10);
  const result = await db.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, active, created_at`,
    [name, email, hash, role || 'validator']
  );
  return result.rows[0];
}

async function updateUser(id, { name, email, role, active, password }) {
  const fields = [];
  const params = [];
  let idx = 1;

  if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
  if (email !== undefined) { fields.push(`email = $${idx++}`); params.push(email); }
  if (role !== undefined) { fields.push(`role = $${idx++}`); params.push(role); }
  if (active !== undefined) { fields.push(`active = $${idx++}`); params.push(active); }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    fields.push(`password_hash = $${idx++}`);
    params.push(hash);
  }

  if (fields.length === 0) return null;
  params.push(id);
  const result = await db.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
     RETURNING id, name, email, role, active, created_at`,
    params
  );
  return result.rows[0] || null;
}

async function deleteUser(id) {
  const result = await db.query(
    'UPDATE users SET active = false WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
