const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const env = require('../../config/env');
const { cpfLookupHash, hashPassword, comparePassword } = require('../../utils/hash');
const { sendActivationEmail, sendPasswordResetEmail } = require('../../utils/email');

const ACTIVATION_TTL_MS = 48 * 60 * 60 * 1000; // 48h
const RESET_TTL_MS = 60 * 60 * 1000;            // 1h

// Erro com status HTTP e código de máquina legível pelo frontend
function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function signToken(user) {
  const payload = {
    id: user.id,
    name: user.name,
    role: user.role,
    tenant_id: user.tenant_id || null,
    email: user.email,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '24h' });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenant_id: user.tenant_id || null,
    email_verified: !!user.email_verified,
  };
}

/**
 * Login com CPF (com ou sem formatação) + senha.
 * Etapas: lookup por cpf_lookup_hash → e-mail verificado → tenant ativo →
 * senha (bcrypt) → JWT (24h).
 */
async function login(cpf, password) {
  if (!cpf || !password) {
    throw httpError(400, 'CPF e senha são obrigatórios.', 'missing_fields');
  }

  const lookup = cpfLookupHash(cpf);

  const result = await db.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role,
            u.tenant_id, u.email_verified, u.active,
            c.active AS tenant_active
     FROM users u
     LEFT JOIN clients c ON c.id = u.tenant_id
     WHERE u.cpf_lookup_hash = $1`,
    [lookup]
  );

  const user = result.rows[0];
  if (!user) {
    throw httpError(401, 'CPF ou senha incorretos.', 'invalid_credentials');
  }

  if (!user.active) {
    throw httpError(403, 'Usuário desativado. Contate o administrador.', 'user_inactive');
  }

  if (!user.email_verified) {
    throw httpError(403, 'E-mail ainda não verificado.', 'email_not_verified');
  }

  // Usuário de tenant deve ter o cliente ativo
  if (user.tenant_id && !user.tenant_active) {
    throw httpError(403, 'Cliente suspenso. Contate o suporte.', 'tenant_suspended');
  }

  if (!user.password_hash) {
    throw httpError(401, 'CPF ou senha incorretos.', 'invalid_credentials');
  }

  const passwordOk = await comparePassword(password, user.password_hash);
  if (!passwordOk) {
    throw httpError(401, 'CPF ou senha incorretos.', 'invalid_credentials');
  }

  const token = signToken(user);
  return { token, user: publicUser(user) };
}

/**
 * Ativação de usuário recém-criado: valida token (48h) e define a senha.
 */
async function verifyEmail(token, password) {
  if (!token || !password) {
    throw httpError(400, 'token e password são obrigatórios.', 'missing_fields');
  }

  const result = await db.query(
    `SELECT id, name, email, role, tenant_id, email_verified, email_token_exp
     FROM users
     WHERE email_token = $1`,
    [token]
  );

  const user = result.rows[0];
  const expired = !user || !user.email_token_exp || new Date(user.email_token_exp) < new Date();

  if (!user || expired || user.email_verified) {
    throw httpError(400, 'Token de ativação inválido ou expirado.', 'invalid_or_expired_token');
  }

  const passwordHash = await hashPassword(password);

  await db.query(
    `UPDATE users
     SET email_verified = true, password_hash = $2, email_token = NULL, email_token_exp = NULL
     WHERE id = $1`,
    [user.id, passwordHash]
  );

  const updated = { ...user, email_verified: true };
  const tokenJwt = signToken(updated);
  return { token: tokenJwt, user: publicUser(updated) };
}

/**
 * Solicita redefinição de senha enviando link por e-mail (expira em 1h).
 * Resposta genérica para não revelar se o e-mail existe.
 */
async function forgotPassword(email) {
  if (!email) {
    throw httpError(400, 'E-mail é obrigatório.', 'missing_fields');
  }

  const result = await db.query(
    'SELECT id, name, email FROM users WHERE email = $1',
    [String(email).toLowerCase().trim()]
  );

  const user = result.rows[0];
  if (user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + RESET_TTL_MS);

    await db.query(
      `UPDATE users SET email_token = $2, email_token_exp = $3 WHERE id = $1`,
      [user.id, resetToken, exp]
    );

    await sendPasswordResetEmail(user.email, user.name, resetToken);
  }

  return { message: 'Se o e-mail estiver cadastrado, enviaremos um link de recuperação.' };
}

/**
 * Define nova senha usando token de recuperação válido.
 */
async function resetPassword(token, password) {
  if (!token || !password) {
    throw httpError(400, 'token e password são obrigatórios.', 'missing_fields');
  }

  const result = await db.query(
    `SELECT id, email_verified FROM users
     WHERE email_token = $1`,
    [token]
  );

  const user = result.rows[0];
  const expired = !user || !user.email_token_exp || new Date(user.email_token_exp) < new Date();

  if (!user || expired) {
    throw httpError(400, 'Token de recuperação inválido ou expirado.', 'invalid_or_expired_token');
  }

  if (!user.email_verified) {
    throw httpError(403, 'E-mail ainda não verificado.', 'email_not_verified');
  }

  const passwordHash = await hashPassword(password);
  await db.query(
    `UPDATE users
     SET password_hash = $2, email_token = NULL, email_token_exp = NULL
     WHERE id = $1`,
    [user.id, passwordHash]
  );

  return { message: 'Senha redefinida com sucesso.' };
}

/**
 * Reenvia o e-mail de ativação para usuário ainda não verificado.
 * Gera novo email_token (TTL 48h). Resposta genérica para não revelar
 * se o e-mail existe nem se já foi verificado.
 */
async function resendVerification(email) {
  if (!email) {
    throw httpError(400, 'E-mail é obrigatório.', 'missing_fields');
  }

  const result = await db.query(
    `SELECT id, name, email, email_verified, active FROM users WHERE email = $1`,
    [String(email).toLowerCase().trim()]
  );

  const user = result.rows[0];
  if (user && user.active && !user.email_verified) {
    const activationToken = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + ACTIVATION_TTL_MS);

    await db.query(
      `UPDATE users SET email_token = $2, email_token_exp = $3 WHERE id = $1`,
      [user.id, activationToken, exp]
    );

    await sendActivationEmail(user.email, user.name, activationToken);
  }

  return {
    message: 'Se o e-mail estiver cadastrado e ainda não verificado, enviaremos um novo link de ativação.',
  };
}

async function getById(id) {
  const result = await db.query(
    `SELECT id, name, email, role, tenant_id, email_verified, active, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0];
}

module.exports = {
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  resendVerification,
  getById,
};
