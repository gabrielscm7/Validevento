/**
 * Gera hash SHA-256 do CPF concatenado com o salt do evento.
 * Executa no cliente via SubtleCrypto (sem deps externas).
 * @param {string} cpf   – CPF com ou sem formatação
 * @param {string} salt  – salt único do evento
 * @returns {Promise<string>} hex string de 64 chars
 */
export async function hashCPF(cpf, salt) {
  const clean = cpf.replace(/\D/g, '')
  const message = clean + salt
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Normaliza CPF (remove pontuação) */
export function normalizeCPF(cpf) {
  return cpf.replace(/\D/g, '')
}
