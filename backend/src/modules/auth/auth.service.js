const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const env = require('../../config/env');

/**
 * Autentica um usuário e gera um token JWT.
 * @param {string} email - E-mail do usuário
 * @param {string} password - Senha em texto simples
 * @returns {Promise<{token: string, user: object}>}
 */
async function login(email, password) {
  if (!email || !password) {
    throw new Error('E-mail e senha são obrigatórios.');
  }

  // Buscar usuário no banco
  const result = await db.query(
    'SELECT id, name, email, password_hash, role, active FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  const user = result.rows[0];

  if (!user) {
    throw new Error('E-mail ou senha incorretos.');
  }

  if (!user.active) {
    throw new Error('Este usuário está desativado. Contate o administrador.');
  }

  // Verificar senha
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw new Error('E-mail ou senha incorretos.');
  }

  // Gerar JWT
  const payload = {
    id: user.id,
    name: user.name,
    role: user.role
  };

  const token = jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
}

/**
 * Busca detalhes do usuário pelo ID
 * @param {string} id - UUID do usuário
 * @returns {Promise<object>}
 */
async function getById(id) {
  const result = await db.query(
    'SELECT id, name, email, role, active, created_at FROM users WHERE id = $1',
    [id]
  );
  
  if (result.rowCount === 0) {
    return null;
  }
  
  return result.rows[0];
}

module.exports = {
  login,
  getById
};
