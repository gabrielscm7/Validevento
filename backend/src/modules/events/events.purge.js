const db = require('../../config/database');

function purgeError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/** Apaga os dados operacionais de um evento encerrado e mantém seu histórico. */
async function purgeEventData(eventId, tenantId, userId) {
  const eventRes = await db.query(
    'SELECT id, name, status, tenant_id FROM events WHERE id = $1',
    [eventId]
  );
  if (eventRes.rowCount === 0) {
    throw purgeError(404, 'Evento não encontrado.', 'event_not_found');
  }

  const event = eventRes.rows[0];
  if (tenantId && event.tenant_id !== tenantId) {
    throw purgeError(403, 'Acesso negado.', 'forbidden');
  }
  if (event.status !== 'closed') {
    throw purgeError(
      422,
      'Apenas eventos encerrados podem ter seus dados apagados. Encerre o evento primeiro.',
      'event_not_closed'
    );
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO audit_logs
         (tenant_id, event_id, user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, 'event_data_purged', 'event', $2, $4::jsonb)`,
      [
        event.tenant_id,
        eventId,
        userId,
        JSON.stringify({ event_name: event.name, purged_at: new Date().toISOString() }),
      ]
    );

    for (const table of [
      'entry_logs',
      'master_tickets',
      'tickets',
      'batches',
      'terminals',
      'gates',
      'event_team',
      'event_config',
    ]) {
      await client.query(`DELETE FROM ${table} WHERE event_id = $1`, [eventId]);
    }

    // audit_logs são imutáveis; o histórico do evento permanece preservado.
    await client.query(
      `UPDATE events SET status = 'purged' WHERE id = $1`,
      [eventId]
    );
    await client.query('COMMIT');

    return {
      message: `Dados do evento "${event.name}" apagados com sucesso.`,
      event_id: eventId,
      event_name: event.name,
      purged_at: new Date().toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { purgeEventData };
