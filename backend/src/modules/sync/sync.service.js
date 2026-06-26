const db = require('../../config/database');

/**
 * Retorna os ingressos criados/alterados desde o último sync (since)
 * @param {string} eventId - UUID do evento
 * @param {string} since - Timestamp ISO (opcional)
 * @returns {Promise<{tickets: Array, last_sync_at: Date, total: number}>}
 */
async function getSnapshot(eventId, since) {
  let queryText = `
    SELECT id, event_id, ticket_code, batch, hash_cpf, display_name, status, updated_at, validated_at
    FROM tickets
    WHERE event_id = $1
  `;
  const params = [eventId];

  if (since) {
    queryText += ' AND updated_at > $2';
    params.push(new Date(since));
  }

  const result = await db.query(queryText, params);
  
  return {
    tickets: result.rows,
    last_sync_at: new Date(),
    total: result.rowCount
  };
}

/**
 * Recebe e processa em lote logs de validação offline com tratamento de idempotência e duplicatas.
 * @param {string} eventId - UUID do evento
 * @param {string} terminalId - UUID do terminal que enviou os logs
 * @param {string} validatorId - UUID do validador que realizou a entrada
 * @param {Array} logs - Array de logs offline
 */
async function processOfflineLogs(eventId, terminalId, validatorId, logs) {
  const processedLogs = [];
  const errors = [];

  for (const log of logs) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const logId = log.id || log.local_id; // id do log gerado no IndexedDB
      const { ticket_id, hash_cpf, entry_type, created_at } = log;

      if (!ticket_id || !hash_cpf) {
        throw new Error('ticket_id e hash_cpf são obrigatórios no log.');
      }

      // 1. Idempotência: verificar se este log já foi gravado
      const logExistsRes = await client.query(
        'SELECT id FROM entry_logs WHERE id = $1',
        [logId]
      );

      if (logExistsRes.rowCount > 0) {
        // Log já processado anteriormente, apenas ignoramos
        await client.query('COMMIT');
        continue;
      }

      // 2. Verificar o status atual do ticket no banco central
      const ticketRes = await client.query(
        'SELECT status, validated_at FROM tickets WHERE id = $1 AND event_id = $2',
        [ticket_id, eventId]
      );

      if (ticketRes.rowCount === 0) {
        throw new Error(`Ticket ${ticket_id} não encontrado neste evento.`);
      }

      const ticket = ticketRes.rows[0];
      let isDuplicate = false;

      if (ticket.status === 'validated') {
        // Conflito Offline: O ingresso já consta como validado na base central!
        // Marcar log como duplicado
        isDuplicate = true;
      } else {
        // Fluxo normal: Atualizar status do ticket para validado
        await client.query(
          `UPDATE tickets 
           SET status = 'validated', validated_at = $1, updated_at = NOW() 
           WHERE id = $2`,
          [created_at || new Date(), ticket_id]
        );
      }

      // 3. Inserir log de entrada no banco central
      await client.query(
        `INSERT INTO entry_logs (id, ticket_id, event_id, hash_cpf, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
        [
          logId,
          ticket_id,
          eventId,
          hash_cpf,
          entry_type || 'qrcode',
          terminalId || null,
          validatorId || null,
          isDuplicate,
          created_at || new Date()
        ]
      );

      await client.query('COMMIT');
      processedLogs.push({ logId, isDuplicate });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Erro ao processar log individual ${log.id}:`, err.message);
      errors.push({ logId: log.id, reason: err.message });
    } finally {
      client.release();
    }
  }

  return {
    processed_count: processedLogs.length,
    processed: processedLogs,
    errors
  };
}

/**
 * Atualiza o estado e timestamp de atividade de um terminal
 * @param {string} eventId - UUID do evento
 * @param {string} terminalId - UUID do terminal (se existir)
 * @param {string} name - Nome amigável do terminal
 * @returns {Promise<string>} Retorna o UUID do terminal (criado ou atualizado)
 */
async function registerHeartbeat(eventId, terminalId, name) {
  let terminalUUID = terminalId;

  // Se o terminal não tiver ID, ou se o ID não for um UUID válido, criamos um novo
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!terminalUUID || !isUUID.test(terminalUUID)) {
    const insertRes = await db.query(
      `INSERT INTO terminals (event_id, name, last_seen_at, last_sync_at, online)
       VALUES ($1, $2, NOW(), NOW(), true)
       RETURNING id`,
      [eventId, name || 'Terminal Móvel Sem Nome']
    );
    terminalUUID = insertRes.rows[0].id;
  } else {
    // Atualizar terminal existente
    const updateRes = await db.query(
      `UPDATE terminals 
       SET name = COALESCE($1, name), last_seen_at = NOW(), online = true
       WHERE id = $2 AND event_id = $3
       RETURNING id`,
      [name, terminalUUID, eventId]
    );

    // Se o terminal sumiu do banco (ex: banco resetado), criamos novamente com o mesmo UUID
    if (updateRes.rowCount === 0) {
      await db.query(
        `INSERT INTO terminals (id, event_id, name, last_seen_at, last_sync_at, online)
         VALUES ($1, $2, $3, NOW(), NOW(), true)`,
        [terminalUUID, eventId, name || 'Terminal Restaurado']
      );
    }
  }

  return terminalUUID;
}

module.exports = {
  getSnapshot,
  processOfflineLogs,
  registerHeartbeat
};
