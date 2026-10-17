const db = require('../../config/database');

function purgeError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Apaga os dados operacionais de um evento.
 *
 * mode:
 *  - 'full'  (padrão) — EXCLUI o evento definitivamente (hard delete): apaga
 *                        todos os dados operacionais, de configuração e a
 *                        própria linha do evento. Exige evento encerrado
 *                        (master ignora). O log de auditoria é preservado.
 *  - 'reset'          — apaga apenas dados operacionais e mantém a estrutura
 *                        (config, equipe, portões, nome/data/local); volta
 *                        para 'draft'. Permitido em eventos ativos ou encerrados.
 *
 * userRole:
 *  - 'master' ignora a exigência de evento encerrado no full purge, podendo
 *    apagar eventos em qualquer status (draft/active/closed).
 */
async function purgeEventData(eventId, tenantId, userId, mode = 'full', userRole = null) {
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

  // Full purge exige evento encerrado; reset pode rodar em ativo/encerrado.
  // O master tem poder total de exclusão e ignora essa restrição.
  const isMaster = userRole === 'master';
  if (mode === 'full' && event.status !== 'closed' && !isMaster) {
    throw purgeError(
      422,
      'Apenas eventos encerrados podem ter todos os dados apagados. ' +
      'Para resetar mantendo a estrutura, use o modo reset.',
      'event_not_closed'
    );
  }

  // Eventos 'purged' são resquício do modelo antigo (soft). Full purge pode
  // excluí-los definitivamente; reset não faz sentido sobre eles.
  if (event.status === 'purged' && mode === 'reset') {
    throw purgeError(422, 'Este evento já foi purgado.', 'already_purged');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO audit_logs
         (tenant_id, event_id, user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, 'event', $2, $5::jsonb)`,
      [
        event.tenant_id,
        eventId,
        userId,
        mode === 'reset' ? 'event_data_reset' : 'event_data_purged',
        JSON.stringify({
          event_name: event.name,
          mode,
          purged_at: new Date().toISOString(),
        }),
      ]
    );

    if (mode === 'reset') {
      // RESET: apaga apenas dados operacionais; mantém event_config,
      // event_team, gates (estrutura) e batches.
      await client.query('DELETE FROM entry_logs WHERE event_id = $1', [eventId]);
      await client.query('DELETE FROM master_tickets WHERE event_id = $1', [eventId]);
      await client.query('DELETE FROM tickets WHERE event_id = $1', [eventId]);
      // Terminais são recriados no próximo acesso — apagar é seguro.
      await client.query('DELETE FROM terminals WHERE event_id = $1', [eventId]);
      // Portões: mantém o registro, limpa timestamps de operação.
      await client.query(
        `UPDATE gates
         SET opened_at = NULL, opened_by = NULL,
             closed_at = NULL, closed_by = NULL
         WHERE event_id = $1`,
        [eventId]
      );
      await client.query(
        `UPDATE events SET status = 'draft' WHERE id = $1`,
        [eventId]
      );
    } else {
      // FULL PURGE: exclusão definitiva (hard delete).
      // Removemos os filhos explicitamente (na ordem correta) para não depender
      // de múltiplos caminhos de cascade em entry_logs; por fim apagamos o
      // evento. audit_logs usa ON DELETE SET NULL, preservando o histórico.
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
      await client.query('DELETE FROM events WHERE id = $1', [eventId]);
    }

    // audit_logs são imutáveis; o histórico do evento permanece preservado.
    await client.query('COMMIT');

    const modeLabel = mode === 'reset' ? 'resetado' : 'excluído';
    return {
      message: `Evento "${event.name}" ${modeLabel} com sucesso.`,
      event_id: eventId,
      event_name: event.name,
      mode,
      new_status: mode === 'reset' ? 'draft' : null,
      deleted: mode !== 'reset',
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
