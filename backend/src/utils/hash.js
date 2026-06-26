const crypto = require('crypto');

/**
 * Limpa a pontuação do CPF e gera o hash SHA-256 concatenando com o salt do evento
 * @param {string} cpf - O CPF em claro
 * @param {string} eventSalt - O salt exclusivo do evento
 * @returns {string} Hash SHA-256 resultante
 */
function hashCPF(cpf, eventSalt) {
  if (!cpf) return null;
  // Remove todos os caracteres não numéricos do CPF
  const cpfClean = cpf.replace(/\D/g, '');
  
  return crypto
    .createHash('sha256')
    .update(cpfClean + eventSalt)
    .digest('hex');
}

module.exports = { hashCPF };
