const db = require('../../config/database');
const { hashCPF } = require('../../utils/hash');

/**
 * Valida a entrada por QRCode a partir de um CPF em texto simples.
 * @param {string} eventId - UUID do evento
 * @param {string} terminalId - UUID do terminal
 * @param {string} validatorId - UUID do usuário validador
 * @param {string} cpfRaw - CPF lido do QRCode
 * @returns {Promise<object>} Objeto contendo o resultado da validação
 */
async function validateQRCode(eventId, terminalId, validatorId, cpfRaw) {
  // 1. Obter o salt do evento
  const eventRes = await db.query('SELECT salt FROM events WHERE id = $1', [eventId]);
  if (eventRes.rowCount === 0) {
    throw new Error('Evento não encontrado.');
  }
  const eventSalt = eventRes.rows[0].salt;

  // 2. Gerar hash do CPF
  const hash = hashCPF(cpfRaw, eventSalt);

  // 3. Buscar ingresso associado a este hash CPF
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, validated_at
       FROM tickets
       WHERE event_id = $1 AND hash_cpf = $2`,
      [eventId, hash]
    );

    if (ticketRes.rowCount === 0) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }

    const ticket = ticketRes.rows[0];

    // Se o ingresso está bloqueado
    if (ticket.status === 'blocked') {
      // Registrar tentativa bloqueada em log para fins de segurança
      await client.query(
        `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, terminal_id, validator_id, is_duplicate, synced)
         VALUES ($1, $2, $3, 'qrcode', $4, $5, true, true)`,
        [ticket.id, eventId, hash, terminalId || null, validatorId || null]
      );
      await client.query('COMMIT');
      return { status: 'blocked', ticket_code: ticket.ticket_code };
    }

    // Se o ingresso está no status 'generated' (não vinculado a CPF ainda)
    // RN-02 flexibilizada: o QR contém um CPF, então vinculamos ao ingresso e autorizamos
    if (ticket.status === 'generated') {
      const now = new Date();
      await client.query(
        `UPDATE tickets SET hash_cpf = $1, status = 'validated', validated_at = $2, updated_at = NOW() WHERE id = $3`,
        [hash, now, ticket.id]
      );
      const logRes = await client.query(
        `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, 'qrcode', $4, $5, false, true, $6) RETURNING id`,
        [ticket.id, eventId, hash, terminalId || null, validatorId || null, now]
      );
      await client.query('COMMIT');
      return {
        status: 'authorized',
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        batch: ticket.batch,
        entry_log_id: logRes.rows[0].id
      };
    }

    // Se o ingresso já foi validado antes (Duplicata)
    if (ticket.status === 'validated') {
      // Registrar log de duplicata
      await client.query(
        `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, terminal_id, validator_id, is_duplicate, synced)
         VALUES ($1, $2, $3, 'qrcode', $4, $5, true, true)`,
        [ticket.id, eventId, hash, terminalId || null, validatorId || null]
      );
      await client.query('COMMIT');
      return {
        status: 'duplicate',
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        first_entry_at: ticket.validated_at
      };
    }

    // Caso de sucesso (status = 'linked')
    const now = new Date();
    // Atualizar status do ticket para validado
    await client.query(
      `UPDATE tickets 
       SET status = 'validated', validated_at = $1, updated_at = NOW() 
       WHERE id = $2`,
      [now, ticket.id]
    );

    // Gravar log de entrada com sucesso
    const logRes = await client.query(
      `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
       VALUES ($1, $2, $3, 'qrcode', $4, $5, false, true, $6)
       RETURNING id`,
      [ticket.id, eventId, hash, terminalId || null, validatorId || null, now]
    );

    await client.query('COMMIT');
    return {
      status: 'authorized',
      ticket_code: ticket.ticket_code,
      display_name: ticket.display_name,
      batch: ticket.batch,
      entry_log_id: logRes.rows[0].id
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Valida a entrada manual a partir do ID do ticket localizado na busca.
 * @param {string} eventId - UUID do evento
 * @param {string} terminalId - UUID do terminal
 * @param {string} validatorId - UUID do usuário validador
 * @param {string} ticketId - UUID do ticket a ser validado
 * @returns {Promise<object>} Objeto contendo o resultado da validação
 */
async function validateManual(eventId, terminalId, validatorId, ticketId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Buscar informações do ticket
    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, hash_cpf, validated_at
       FROM tickets
       WHERE id = $1 AND event_id = $2`,
      [ticketId, eventId]
    );

    if (ticketRes.rowCount === 0) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }

    const ticket = ticketRes.rows[0];
    const hash = ticket.hash_cpf || 'sem_cpf_hashing';

    // Se o ingresso está bloqueado
    if (ticket.status === 'blocked') {
      await client.query('COMMIT');
      return { status: 'blocked', ticket_code: ticket.ticket_code };
    }

    // Se o ingresso já foi validado antes (Duplicata)
    if (ticket.status === 'validated') {
      // Registrar log de duplicata manual
      await client.query(
        `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, terminal_id, validator_id, is_duplicate, synced)
         VALUES ($1, $2, $3, 'manual', $4, $5, true, true)`,
        [ticket.id, eventId, hash, terminalId || null, validatorId || null]
      );
      await client.query('COMMIT');
      return {
        status: 'duplicate',
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        first_entry_at: ticket.validated_at
      };
    }

    // Caso de sucesso (status = 'linked' ou status = 'generated' — com liberação de supervisor/admin se for o caso)
    // Nota: Regra RN-02 diz que status generated sem CPF não autoriza entrada na portaria padrão.
    // Mas na busca manual se for supervisor/admin ou se for liberado, deixaremos a lógica permitir ou barrar.
    // Vamos cumprir a regra restrita RN-02: generated (sem CPF vinculado) não autoriza entrada.
    if (ticket.status === 'generated') {
      await client.query('COMMIT');
      return { status: 'invalid_status', reason: 'Ingresso sem CPF vinculado. Acesso não permitido.', ticket_code: ticket.ticket_code };
    }

    const now = new Date();
    // Atualizar status do ticket
    await client.query(
      `UPDATE tickets 
       SET status = 'validated', validated_at = $1, updated_at = NOW() 
       WHERE id = $2`,
      [now, ticket.id]
    );

    // Gravar log de entrada com sucesso (tipo: manual)
    const logRes = await client.query(
      `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
       VALUES ($1, $2, $3, 'manual', $4, $5, false, true, $6)
       RETURNING id`,
      [ticket.id, eventId, hash, terminalId || null, validatorId || null, now]
    );

    await client.query('COMMIT');
    return {
      status: 'authorized',
      ticket_code: ticket.ticket_code,
      display_name: ticket.display_name,
      batch: ticket.batch,
      entry_log_id: logRes.rows[0].id
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Busca por nome parcial ou CPF exato na base de dados centralizada.
 * @param {string} eventId - UUID do evento
 * @param {string} queryText - String de busca (nome completo ou trecho, ou CPF)
 * @param {string} cpfParam - CPF exato (se aplicável)
 * @returns {Promise<Array>} Lista de resultados de busca
 */
async function searchTickets(eventId, queryText, cpfParam) {
  // 1. Caso seja busca por CPF exato
  if (cpfParam) {
    const eventRes = await db.query('SELECT salt FROM events WHERE id = $1', [eventId]);
    if (eventRes.rowCount === 0) return [];
    
    const hash = hashCPF(cpfParam, eventRes.rows[0].salt);
    const result = await db.query(
      `SELECT id as ticket_id, ticket_code, display_name, batch, status
       FROM tickets
       WHERE event_id = $1 AND hash_cpf = $2`,
      [eventId, hash]
    );
    return result.rows;
  }

  // 2. Caso seja busca por nome parcial
  if (!queryText || queryText.length < 3) {
    throw new Error('A busca por nome requer no mínimo 3 caracteres.');
  }

  // Busca por nome parcial usando ILIKE (case-insensitive)
  const result = await db.query(
    `SELECT id as ticket_id, ticket_code, display_name, batch, status
     FROM tickets
     WHERE event_id = $1 AND display_name ILIKE $2
     LIMIT 10`,
    [eventId, `%${queryText}%`]
  );

  return result.rows;
}

module.exports = {
  validateQRCode,
  validateManual,
  searchTickets
};
