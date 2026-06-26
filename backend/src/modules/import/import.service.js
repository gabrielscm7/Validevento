const fs = require('fs');
const { parse } = require('csv-parse');
const db = require('../../config/database');
const { hashCPF } = require('../../utils/hash');

/**
 * Processa a importação de ingressos via CSV
 * @param {string} eventId - UUID do evento
 * @param {string} filePath - Caminho do arquivo temporário CSV
 * @returns {Promise<{inserted: number, updated: number, skipped: number, errors: Array, duration_ms: number}>}
 */
async function importCSV(eventId, filePath) {
  const startTime = Date.now();
  
  // 1. Validar se o evento existe e obter o salt
  const eventRes = await db.query('SELECT salt FROM events WHERE id = $1', [eventId]);
  if (eventRes.rowCount === 0) {
    throw new Error('Evento não encontrado para vincular os ingressos.');
  }
  const eventSalt = eventRes.rows[0].salt;

  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: true, // Usa a primeira linha como cabeçalho
      skip_empty_lines: true,
      trim: true
    })
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  let lineNumber = 1; // Contador de linha do arquivo físico (descontando cabeçalho)

  for await (const record of parser) {
    lineNumber++;
    try {
      // Mapear campos flexíveis (suporta o PRD e o SPEC)
      const ticketCode = record.ticket_code || record.id_ingresso;
      const batch = record.batch || record.lote;
      const rawCpf = record.cpf || record.CPF;
      let hashCpfField = record.hash_cpf || record.hash_cpf;
      const displayName = record.display_name || record.nome_exibicao || null;
      let status = (record.status || 'generated').toLowerCase();

      // Validações básicas
      if (!ticketCode) {
        errors.push({ line: lineNumber, reason: 'ticket_code/id_ingresso ausente.' });
        continue;
      }
      if (!batch) {
        errors.push({ line: lineNumber, reason: 'batch/lote ausente.' });
        continue;
      }

      // Validar status
      const validStatuses = ['generated', 'linked', 'validated', 'blocked'];
      if (!validStatuses.includes(status)) {
        status = 'generated'; // Fallback
      }

      // Tratar CPF / Hash CPF
      let finalHashCpf = null;
      if (hashCpfField && hashCpfField.length === 64) {
        // Já é um hash SHA-256 válido
        finalHashCpf = hashCpfField;
      } else if (rawCpf) {
        // Foi fornecido um CPF em texto claro, vamos gerar o hash localmente
        finalHashCpf = hashCPF(rawCpf, eventSalt);
      } else if (hashCpfField) {
        // Se houver algo no campo hash_cpf que não tem 64 caracteres, tratamos como CPF em claro para fazer hash
        finalHashCpf = hashCPF(hashCpfField, eventSalt);
      }

      // Forçar status correto com base na vinculação do CPF
      // Regra: Se tem CPF, o status inicial deve ser pelo menos 'linked'. Se não tem, deve ser 'generated'
      if (finalHashCpf && status === 'generated') {
        status = 'linked';
      } else if (!finalHashCpf && status === 'linked') {
        status = 'generated';
      }

      // Verificar se o ingresso já existe na base
      const checkRes = await db.query(
        'SELECT id, status FROM tickets WHERE ticket_code = $1 AND event_id = $2',
        [ticketCode, eventId]
      );

      if (checkRes.rowCount > 0) {
        const existingTicket = checkRes.rows[0];
        
        // RN-04: Importação CSV não pode sobrescrever registros já com status 'validated'
        if (existingTicket.status === 'validated') {
          skipped++;
          continue;
        }

        // Atualizar registro existente
        await db.query(
          `UPDATE tickets 
           SET batch = $1, hash_cpf = $2, display_name = $3, status = $4, updated_at = NOW() 
           WHERE id = $5`,
          [batch, finalHashCpf, displayName, status, existingTicket.id]
        );
        updated++;
      } else {
        // Inserir novo registro
        await db.query(
          `INSERT INTO tickets (event_id, ticket_code, batch, hash_cpf, display_name, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [eventId, ticketCode, batch, finalHashCpf, displayName, status]
        );
        inserted++;
      }
    } catch (err) {
      errors.push({ line: lineNumber, reason: err.message });
    }
  }

  // Deletar o arquivo temporário
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.error('Erro ao deletar arquivo temporário de importação:', err);
  }

  return {
    inserted,
    updated,
    skipped,
    errors,
    duration_ms: Date.now() - startTime
  };
}

module.exports = {
  importCSV
};
