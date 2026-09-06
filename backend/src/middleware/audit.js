const db = require('../config/database');

/**
 * Registra uma ação no log de auditoria (imutável).
 * Deve ser chamado dentro de rotas autenticadas.
 *
 * @param {object} req  - objeto de requisição Express (fornece req.user/req.tenantId/req.ip)
 * @param {string} action - nome da ação auditada (ex: 'client.create')
 * @param {string} entityType - tipo da entidade (ex: 'client', 'user', 'event')
 * @param {string} [entityId] - UUID da entidade
 * @param {object} [details] - detalhes adicionais (será gravado como JSONB)
 */
async function auditLog(req, action, entityType, entityId, details) {
  try {
    const eventId =
      (req.body && req.body.event_id) ||
      (req.params && req.params.eventId) ||
      null;

    await db.query(
      `INSERT INTO audit_logs
         (tenant_id, event_id, user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.tenantId || null,
        eventId,
        req.user ? req.user.id : null,
        action,
        entityType || null,
        entityId || null,
        details ? JSON.stringify(details) : null,
        req.ip || null,
      ]
    );
  } catch (error) {
    // Log de auditoria nunca deve derrubar a requisição principal
    console.error('Falha ao gravar audit_log:', error.message);
  }
}

module.exports = { auditLog };
