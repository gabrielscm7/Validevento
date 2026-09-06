const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

// Remove qualquer formatação do CPF (pontos, traço, espaços)
function cleanCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

/**
 * Hash determinístico (SHA-256) do CPF limpo + salt fixo do sistema.
 * Usado para busca rápida no login (o bcrypt não é reversível e seria
 * inviável varrer a tabela no login).
 */
function cpfLookupHash(cpf) {
  const clean = cleanCpf(cpf);
  const salt = process.env.CPF_LOOKUP_SALT || '';
  return crypto.createHash('sha256').update(clean + salt).digest('hex');
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function comparePassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

module.exports = {
  cleanCpf,
  cpfLookupHash,
  hashPassword,
  comparePassword,
};
