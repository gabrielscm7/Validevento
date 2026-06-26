const db = require('../../config/database');

/**
 * Retorna resumo numérico de ingressos do evento
 */
async function getSummary(eventId) {
  const result = await db.query(
    `SELECT 
       COUNT(*)::integer as total,
       COUNT(CASE WHEN status = 'validated' THEN 1 END)::integer as validated,
       COUNT(CASE WHEN status = 'linked' THEN 1 END)::integer as linked,
       COUNT(CASE WHEN status = 'generated' THEN 1 END)::integer as generated,
       COUNT(CASE WHEN status = 'blocked' THEN 1 END)::integer as blocked
     FROM tickets
     WHERE event_id = $1`,
    [eventId]
  );
  
  const summary = result.rows[0];
  summary.pending = summary.linked + summary.generated;
  return summary;
}

/**
 * Retorna estatísticas de ocupação por lote
 */
async function getBatches(eventId) {
  const result = await db.query(
    `SELECT 
       batch,
       COUNT(*)::integer as total,
       COUNT(CASE WHEN status = 'validated' THEN 1 END)::integer as validated,
       CASE 
         WHEN COUNT(*) > 0 THEN ROUND((COUNT(CASE WHEN status = 'validated' THEN 1 END)::numeric / COUNT(*)::numeric) * 100.0, 2)::float
         ELSE 0.0
       END as occupancy_percentage
     FROM tickets
     WHERE event_id = $1
     GROUP BY batch
     ORDER BY batch`,
    [eventId]
  );
  return result.rows;
}

/**
 * Retorna o fluxo de entradas agrupado por hora
 */
async function getFlow(eventId) {
  const result = await db.query(
    `SELECT 
       TO_CHAR(validated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:00') as hour,
       COUNT(*)::integer as count
     FROM tickets
     WHERE event_id = $1 AND status = 'validated' AND validated_at IS NOT NULL
     GROUP BY hour
     ORDER BY hour ASC`,
    [eventId]
  );
  return result.rows;
}

/**
 * Retorna lista de duplicatas e tentativas em ingressos bloqueados
 */
async function getAlerts(eventId) {
  const result = await db.query(
    `SELECT 
       l.id,
       l.ticket_id,
       t.ticket_code,
       t.display_name,
       l.hash_cpf,
       l.entry_type,
       l.created_at,
       l.is_duplicate,
       t.status as ticket_status,
       term.name as terminal_name
     FROM entry_logs l
     JOIN tickets t ON l.ticket_id = t.id
     LEFT JOIN terminals term ON l.terminal_id = term.id
     WHERE l.event_id = $1 AND (l.is_duplicate = true OR t.status = 'blocked')
     ORDER BY l.created_at DESC
     LIMIT 50`,
    [eventId]
  );
  return result.rows;
}

/**
 * Retorna a lista de terminais vinculados e status
 */
async function getTerminals(eventId) {
  const result = await db.query(
    `SELECT id, name, last_seen_at, last_sync_at, online
     FROM terminals
     WHERE event_id = $1
     ORDER BY name`,
    [eventId]
  );
  return result.rows;
}

/**
 * Retorna o feed em tempo real das últimas 20 entradas
 */
async function getLiveFeed(eventId) {
  const result = await db.query(
    `SELECT 
       l.id,
       t.ticket_code,
       t.display_name,
       t.batch,
       l.entry_type,
       l.created_at,
       l.is_duplicate,
       term.name as terminal_name
     FROM entry_logs l
     JOIN tickets t ON l.ticket_id = t.id
     LEFT JOIN terminals term ON l.terminal_id = term.id
     WHERE l.event_id = $1
     ORDER BY l.created_at DESC
     LIMIT 20`,
    [eventId]
  );
  return result.rows;
}

/**
 * Retorna todos os logs de entrada para exportação CSV
 */
async function getExportData(eventId) {
  const result = await db.query(
    `SELECT 
       l.id as id_log,
       t.ticket_code,
       l.hash_cpf,
       l.created_at as timestamp,
       l.entry_type,
       u.name as validator_name,
       term.name as terminal_name,
       l.is_duplicate
     FROM entry_logs l
     JOIN tickets t ON l.ticket_id = t.id
     LEFT JOIN users u ON l.validator_id = u.id
     LEFT JOIN terminals term ON l.terminal_id = term.id
     WHERE l.event_id = $1
     ORDER BY l.created_at ASC`,
    [eventId]
  );
  return result.rows;
}

/**
 * Retorna lista paginada de ingressos com busca e filtros
 */
async function getTickets(eventId, { search, status, batch, page = 1, limit = 50 }) {
  const params = [eventId];
  let where = 'WHERE t.event_id = $1';
  let idx = 2;

  if (search) {
    where += ` AND (t.ticket_code ILIKE $${idx} OR t.display_name ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  if (status) {
    where += ` AND t.status = $${idx}`;
    params.push(status);
    idx++;
  }

  if (batch) {
    where += ` AND t.batch = $${idx}`;
    params.push(batch);
    idx++;
  }

  const countResult = await db.query(
    `SELECT COUNT(*)::integer as total FROM tickets t ${where}`,
    params
  );
  const total = countResult.rows[0].total;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  params.push(limit, offset);
  const dataResult = await db.query(
    `SELECT t.id, t.ticket_code, t.hash_cpf, t.display_name, t.batch, t.status,
            t.imported_at, t.validated_at, t.updated_at
     FROM tickets t ${where}
     ORDER BY t.imported_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return { tickets: dataResult.rows, total, page, totalPages };
}

module.exports = {
  getSummary,
  getBatches,
  getFlow,
  getAlerts,
  getTerminals,
  getLiveFeed,
  getExportData,
  getTickets
};
