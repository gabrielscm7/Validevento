/**
 * Módulo de dashboard (Fase 3 — v2).
 * Endpoints escopados por evento (/api/events/:eventId/dashboard/*).
 * Todas as queries são filtradas por tenant_id (via $tenant).
 */
const db = require('../../config/database');

const BR_TZ = 'America/Sao_Paulo';

function round1(value) {
  return Math.round(value * 10) / 10;
}

/** Data de hoje (YYYY-MM-DD) em horário de Brasília. */
function todayBR() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Início (inclusive) e fim (exclusive) de um dia em UTC-3. */
function dayRangeBR(dateStr) {
  const day = dateStr || todayBR();
  const start = new Date(`${day}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { day, start, end };
}

function tenantFilter(column, index) {
  return ` AND ($${index}::uuid IS NULL OR ${column} = $${index})`;
}

// ────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────

async function getSummary(eventId, tenantId) {
  const ticketsRes = await db.query(
    `SELECT
       COUNT(*)::integer                                                       AS total_tickets,
       COUNT(*) FILTER (WHERE status = 'active')::integer                     AS active,
       COUNT(*) FILTER (WHERE status = 'validated')::integer                  AS validated,
       COUNT(*) FILTER (WHERE status = 'blocked')::integer                    AS blocked,
       COUNT(*) FILTER (WHERE origin = 'cortesia')::integer                   AS cortesia,
       COUNT(*) FILTER (WHERE origin = 'liberacao_especial')::integer         AS liberacao_especial
     FROM tickets
     WHERE event_id = $1
       AND ($2::uuid IS NULL OR tenant_id = $2)`,
    [eventId, tenantId || null]
  );
  const row = ticketsRes.rows[0];

  const [logRes, masterRes, eventRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::integer AS duplicate_attempts
       FROM entry_logs
       WHERE event_id = $1 AND is_duplicate = true
         AND ($2::uuid IS NULL OR tenant_id = $2)`,
      [eventId, tenantId || null]
    ),
    db.query(
      `SELECT COALESCE(SUM(uses_count), 0)::integer AS master_uses
       FROM master_tickets
       WHERE event_id = $1`,
      [eventId]
    ),
    db.query('SELECT capacity FROM events WHERE id = $1', [eventId]),
  ]);

  const capacity = eventRes.rowCount ? Number(eventRes.rows[0].capacity) : 0;
  const validated = Number(row.validated);
  const occupancyPct = capacity > 0 ? round1((validated / capacity) * 100) : 0;

  return {
    total_tickets: Number(row.total_tickets),
    active: Number(row.active),
    validated,
    blocked: Number(row.blocked),
    cortesia: Number(row.cortesia),
    liberacao_especial: Number(row.liberacao_especial),
    occupancy_pct: occupancyPct,
    master_uses: Number(masterRes.rows[0].master_uses),
    duplicate_attempts: Number(logRes.rows[0].duplicate_attempts),
  };
}

// ────────────────────────────────────────────────
// Flow (entradas e saídas por hora)
// ────────────────────────────────────────────────

async function getFlow(eventId, tenantId, { date } = {}) {
  const { start, end } = dayRangeBR(date);
  const tenantIdx = tenantId ? 4 : 0;

  let checkinsSql =
    `SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:00') AS hour,
            COUNT(*)::integer AS count
     FROM entry_logs
     WHERE event_id = $1 AND created_at >= $2 AND created_at < $3`;
  const params = [eventId, start, end];
  if (tenantIdx) {
    checkinsSql += tenantFilter('tenant_id', tenantIdx);
    params.push(tenantId);
  }
  checkinsSql += ' GROUP BY 1';

  const checkinRes = await db.query(checkinsSql, params);

  const configRes = await db.query(
    'SELECT checkout_enabled FROM event_config WHERE event_id = $1',
    [eventId]
  );
  const checkoutEnabled = configRes.rowCount ? configRes.rows[0].checkout_enabled : false;

  const map = {};
  for (const row of checkinRes.rows) {
    map[row.hour] = { hour: row.hour, checkins: Number(row.count), checkouts: 0 };
  }

  if (checkoutEnabled) {
    let checkoutSql =
      `SELECT to_char(date_trunc('hour', checkout_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:00') AS hour,
              COUNT(*)::integer AS count
       FROM entry_logs
       WHERE event_id = $1 AND checkout_at IS NOT NULL
         AND checkout_at >= $2 AND checkout_at < $3`;
    const paramsOut = [eventId, start, end];
    if (tenantIdx) {
      checkoutSql += tenantFilter('tenant_id', tenantIdx);
      paramsOut.push(tenantId);
    }
    checkoutSql += ' GROUP BY 1';
    const checkoutRes = await db.query(checkoutSql, paramsOut);

    for (const row of checkoutRes.rows) {
      if (map[row.hour]) map[row.hour].checkouts = Number(row.count);
      else map[row.hour] = { hour: row.hour, checkins: 0, checkouts: Number(row.count) };
    }
  }

  return Object.values(map).sort((a, b) => (a.hour < b.hour ? -1 : 1));
}

// ────────────────────────────────────────────────
// Batches
// ────────────────────────────────────────────────

async function getBatches(eventId, tenantId) {
  const result = await db.query(
    `SELECT
       batch,
       COUNT(*)::integer AS total,
       COUNT(*) FILTER (WHERE status = 'validated')::integer AS validated,
       COUNT(*) FILTER (WHERE status = 'blocked')::integer   AS blocked
     FROM tickets
     WHERE event_id = $1
       AND ($2::uuid IS NULL OR tenant_id = $2)
     GROUP BY batch
     ORDER BY batch ASC`,
    [eventId, tenantId || null]
  );

  return result.rows.map((r) => {
    const total = Number(r.total);
    const validated = Number(r.validated);
    return {
      batch: r.batch,
      total,
      validated,
      blocked: Number(r.blocked),
      pct: total > 0 ? round1((validated / total) * 100) : 0,
    };
  });
}

// ────────────────────────────────────────────────
// Alerts
// ────────────────────────────────────────────────

async function getAlerts(eventId, tenantId, { limit = 50 } = {}) {
  const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200);

  const result = await db.query(
    `SELECT *
     FROM (
       SELECT
         l.id,
         CASE
           WHEN l.entry_type = 'master' THEN 'master_use'
           WHEN l.is_duplicate = true THEN 'duplicate'
           WHEN t.origin = 'cortesia' THEN 'cortesia'
           WHEN t.origin = 'liberacao_especial' THEN 'liberacao_especial'
           WHEN t.status = 'blocked' AND l.entry_type IN ('qrcode', 'manual') THEN 'blocked_attempt'
           ELSE NULL
         END AS type,
         t.ticket_code,
         COALESCE(t.display_name, l.beneficiary) AS display_name,
         u.name AS validator_name,
         term.name AS terminal_name,
         l.created_at
       FROM entry_logs l
       LEFT JOIN tickets t   ON t.id = l.ticket_id
       LEFT JOIN users u     ON u.id = l.validator_id
       LEFT JOIN terminals term ON term.id = l.terminal_id
       WHERE l.event_id = $1
         AND ($2::uuid IS NULL OR l.tenant_id = $2)
     ) sub
     WHERE sub.type IS NOT NULL
     ORDER BY sub.created_at DESC
     LIMIT $3`,
    [eventId, tenantId || null, parsedLimit]
  );

  return result.rows;
}

// ────────────────────────────────────────────────
// Terminals
// ────────────────────────────────────────────────

async function getTerminals(eventId, tenantId) {
  const { start } = dayRangeBR();
  const result = await db.query(
    `SELECT
       t.id,
       t.name,
       t.online,
       t.last_seen_at,
       t.last_sync_at,
       (SELECT COUNT(*)::integer
        FROM entry_logs el
        WHERE el.terminal_id = t.id AND el.created_at >= $2) AS validations_today
     FROM terminals t
     WHERE t.event_id = $1
     ORDER BY t.name ASC`,
    [eventId, start]
  );

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    online: r.online,
    last_seen_at: r.last_seen_at,
    last_sync_at: r.last_sync_at,
    validations_today: Number(r.validations_today),
  }));
}

// ────────────────────────────────────────────────
// Live feed
// ────────────────────────────────────────────────

async function getLiveFeed(eventId, tenantId, { limit = 20 } = {}) {
  const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);

  const result = await db.query(
    `SELECT
       l.id,
       t.ticket_code,
       COALESCE(t.display_name, l.beneficiary) AS display_name,
       t.batch,
       l.entry_type,
       t.origin,
       l.is_duplicate,
       u.name AS validator_name,
       term.name AS terminal_name,
       l.created_at
     FROM entry_logs l
     LEFT JOIN tickets t   ON t.id = l.ticket_id
     LEFT JOIN users u     ON u.id = l.validator_id
     LEFT JOIN terminals term ON term.id = l.terminal_id
     WHERE l.event_id = $1
       AND ($2::uuid IS NULL OR l.tenant_id = $2)
     ORDER BY l.created_at DESC
     LIMIT $3`,
    [eventId, tenantId || null, parsedLimit]
  );

  return result.rows;
}

// ────────────────────────────────────────────────
// Speed (velocidade de validação)
// ────────────────────────────────────────────────

async function getSpeed(eventId, tenantId) {
  const configRes = await db.query(
    'SELECT validation_speed_target_sec FROM event_config WHERE event_id = $1',
    [eventId]
  );
  const targetSeconds = configRes.rowCount
    ? Number(configRes.rows[0].validation_speed_target_sec)
    : 5;

  // Gap entre validações consecutivas do mesmo terminal (proxy de velocidade)
  const gapsRes = await db.query(
    `WITH ordered AS (
       SELECT terminal_id, created_at,
              EXTRACT(EPOCH FROM (created_at - lag(created_at) OVER (
                PARTITION BY terminal_id ORDER BY created_at
              ))) AS gap
       FROM entry_logs
       WHERE event_id = $1
         AND entry_type IN ('qrcode', 'manual')
         AND terminal_id IS NOT NULL
         AND ($2::uuid IS NULL OR tenant_id = $2)
     )
     SELECT
       COUNT(*) FILTER (WHERE gap IS NOT NULL) AS total_gaps,
       COALESCE(AVG(gap) FILTER (WHERE gap IS NOT NULL), 0) AS avg_gap,
       COUNT(*) FILTER (WHERE gap IS NOT NULL AND gap <= $3) AS within_target
     FROM ordered`,
    [eventId, tenantId || null, targetSeconds]
  );
  const gap = gapsRes.rows[0];
  const totalGaps = Number(gap.total_gaps);

  const peakRes = await db.query(
    `SELECT
       to_char(date_trunc('hour', created_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:00') AS hour,
       COUNT(*)::integer AS count
     FROM entry_logs
     WHERE event_id = $1
       AND entry_type IN ('qrcode', 'manual')
       AND ($2::uuid IS NULL OR tenant_id = $2)
     GROUP BY 1
     ORDER BY count DESC, hour ASC
     LIMIT 1`,
    [eventId, tenantId || null]
  );

  const avgGapSeconds = totalGaps > 0 ? Math.round(Number(gap.avg_gap)) : 0;
  const withinTargetPct = totalGaps > 0 ? round1((Number(gap.within_target) / totalGaps) * 100) : 0;

  return {
    avg_gap_seconds: avgGapSeconds,
    peak_hour: peakRes.rowCount ? peakRes.rows[0].hour : null,
    peak_count: peakRes.rowCount ? Number(peakRes.rows[0].count) : 0,
    target_seconds: targetSeconds,
    within_target_pct: withinTargetPct,
  };
}

module.exports = {
  getSummary,
  getFlow,
  getBatches,
  getAlerts,
  getTerminals,
  getLiveFeed,
  getSpeed,
};
