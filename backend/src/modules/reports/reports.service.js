/**
 * Módulo de relatórios (Fase 3) — Markdown, CSV e auditoria.
 * Geração síncrona (sem filas) para eventos de até 3.000 pessoas.
 *
 * Regras:
 *  - Timestamps em horário de Brasília (America/Sao_Paulo)
 *  - Números com separador de milhar pt-BR (1.045)
 *  - Percentuais com 1 casa decimal e vírgula (94,4%)
 *  - Campo ausente → "—"
 */
const db = require('../../config/database');
const dashboardService = require('../dashboard/dashboard.service');
const gatesService = require('../gates/gates.service');

const BR_TZ = 'America/Sao_Paulo';

const DASH = '—';
const DASHBOARD_MS = 'America/Sao_Paulo';

const intFmt = new Intl.NumberFormat('pt-BR');
const pctFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ALERT_TYPE_LABEL = {
  duplicate: 'Duplicata',
  blocked_attempt: 'Tentativa bloqueada',
  master_use: 'Ingresso master',
  cortesia: 'Cortesia',
  liberacao_especial: 'Liberação especial',
};

function fmtInt(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DASH;
  return intFmt.format(n);
}

function fmtPct(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DASH;
  return `${pctFmt.format(n)}%`;
}

function tsBR(value) {
  if (!value) return DASH;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString('pt-BR', {
    timeZone: DASHBOARD_MS,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function dateBR(value) {
  if (!value) return DASH;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString('pt-BR', { timeZone: DASHBOARD_MS });
}

/**
 * slugify('Festa Junina SESI') → 'festa-junina-sesi'
 * Converte o nome do evento para uso em nome de arquivo.
 */
function slugify(name) {
  return String(name || 'evento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'evento';
}

function ymdBR(value) {
  if (!value) return 'sem-data';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'sem-data';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BR_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function mdTable(headers, rows) {
  const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/\|/g, '/');
  const header = `| ${headers.map(esc).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');
  return [header, sep, body].join('\n');
}

async function getEvent(eventId) {
  const res = await db.query('SELECT * FROM events WHERE id = $1', [eventId]);
  return res.rows[0] || null;
}

/** Fluxo por hora considerando TODO o período do evento. */
async function getFlowAll(eventId, tenantId) {
  const tenantIdx = tenantId ? 2 : 0;
  const params = [eventId];
  let sql =
    `SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:00') AS hour,
            COUNT(*)::integer AS checkins
     FROM entry_logs
     WHERE event_id = $1`;
  if (tenantIdx) {
    sql += ' AND tenant_id = $2';
    params.push(tenantId);
  }
  sql += ' GROUP BY 1';

  const map = {};
  const res = await db.query(sql, params);
  for (const row of res.rows) {
    map[row.hour] = { hour: row.hour, checkins: Number(row.checkins), checkouts: 0 };
  }

  const configRes = await db.query(
    'SELECT checkout_enabled FROM event_config WHERE event_id = $1',
    [eventId]
  );
  const checkoutEnabled = configRes.rowCount ? configRes.rows[0].checkout_enabled : false;

  if (checkoutEnabled) {
    const paramsOut = [eventId];
    let sqlOut =
      `SELECT to_char(date_trunc('hour', checkout_at AT TIME ZONE 'America/Sao_Paulo'), 'HH24:00') AS hour,
              COUNT(*)::integer AS checkouts
       FROM entry_logs
       WHERE event_id = $1 AND checkout_at IS NOT NULL`;
    if (tenantIdx) {
      sqlOut += ' AND tenant_id = $2';
      paramsOut.push(tenantId);
    }
    sqlOut += ' GROUP BY 1';
    const out = await db.query(sqlOut, paramsOut);
    for (const row of out.rows) {
      if (map[row.hour]) map[row.hour].checkouts = Number(row.checkouts);
      else map[row.hour] = { hour: row.hour, checkins: 0, checkouts: Number(row.checkouts) };
    }
  }

  return {
    rows: Object.values(map).sort((a, b) => (a.hour < b.hour ? -1 : 1)),
    checkout_enabled: checkoutEnabled,
  };
}

function gateDuration(gate) {
  if (!gate.opened_at) return DASH;
  const end = gate.closed_at ? new Date(gate.closed_at) : new Date();
  const start = new Date(gate.opened_at);
  const diffMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (!gate.closed_at) return `${h}h${String(m).padStart(2, '0')}m (em aberto)`;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

async function listAuditRows(eventId, tenantId, limit) {
  const parsedLimit = Math.min(parseInt(limit, 10) || 200, 500);
  const res = await db.query(
    `SELECT a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at,
            u.name AS user_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE (a.event_id = $1 OR a.entity_id = $1)
       AND ($2::uuid IS NULL OR a.tenant_id = $2)
     ORDER BY a.created_at DESC
     LIMIT $3`,
    [eventId, tenantId || null, parsedLimit]
  );
  return res.rows.map((r) => ({
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    user_name: r.user_name,
    details: r.details,
    ip_address: r.ip_address,
    created_at: r.created_at,
  }));
}

// ────────────────────────────────────────────────
// Relatório Markdown
// ────────────────────────────────────────────────

async function buildMarkdown(eventId, tenantId) {
  const event = await getEvent(eventId);
  if (!event) return null;

  const [summary, batches, alerts, speed, gates, flow, audit] = await Promise.all([
    dashboardService.getSummary(eventId, tenantId),
    dashboardService.getBatches(eventId, tenantId),
    dashboardService.getAlerts(eventId, tenantId, { limit: 100 }),
    dashboardService.getSpeed(eventId, tenantId),
    gatesService.listGates(eventId),
    getFlowAll(eventId, tenantId),
    listAuditRows(eventId, tenantId, 100),
  ]);

  const now = new Date().toLocaleString('pt-BR', { timeZone: BR_TZ });

  const lines = [];
  lines.push(`# Relatório de Evento — ${event.name || DASH}`);
  lines.push('');
  lines.push(
    `**Data:** ${dateBR(event.date)} | **Local:** ${event.location || DASH} | **Gerado em:** ${now}`
  );
  lines.push('');

  // ── Resumo Geral ──
  lines.push('## Resumo Geral');
  lines.push('');
  lines.push(mdTable(['Métrica', 'Valor'], [
    ['Total de ingressos', fmtInt(summary.total_tickets)],
    ['Validados', fmtInt(summary.validated)],
    ['Bloqueados', fmtInt(summary.blocked)],
    ['Ocupação', fmtPct(summary.occupancy_pct)],
    ['Cortesias', fmtInt(summary.cortesia)],
    ['Liberações especiais', fmtInt(summary.liberacao_especial)],
    ['Usos de ingresso master', fmtInt(summary.master_uses)],
    ['Tentativas de duplicata', fmtInt(summary.duplicate_attempts)],
  ]));
  lines.push('');

  // ── Portões ──
  lines.push('## Portões');
  lines.push('');
  if (gates.length === 0) {
    lines.push(DASH);
  } else {
    lines.push(mdTable(
      ['Portão', 'Abertura', 'Fechamento', 'Responsável abertura', 'Responsável fechamento', 'Duração aberta'],
      gates.map((g) => [
        g.name || DASH,
        tsBR(g.opened_at),
        tsBR(g.closed_at),
        g.opened_by || DASH,
        g.closed_by || DASH,
        gateDuration(g),
      ])
    ));
  }
  lines.push('');

  // ── Fluxo de Entrada por Hora ──
  lines.push('## Fluxo de Entrada por Hora');
  lines.push('');
  if (flow.rows.length === 0) {
    lines.push(DASH);
  } else {
    const headers = flow.checkout_enabled
      ? ['Hora', 'Entradas', 'Saídas']
      : ['Hora', 'Entradas'];
    lines.push(mdTable(headers, flow.rows.map((r) => (
      flow.checkout_enabled
        ? [r.hour, fmtInt(r.checkins), fmtInt(r.checkouts)]
        : [r.hour, fmtInt(r.checkins)]
    ))));
  }
  lines.push('');

  // ── Ingressos por Lote ──
  lines.push('## Ingressos por Lote');
  lines.push('');
  if (batches.length === 0) {
    lines.push(DASH);
  } else {
    lines.push(mdTable(
      ['Lote', 'Gerados', 'Validados', 'Bloqueados', 'Ocupação'],
      batches.map((b) => [b.batch || DASH, fmtInt(b.total), fmtInt(b.validated), fmtInt(b.blocked), fmtPct(b.pct)])
    ));
  }
  lines.push('');

  // ── Métricas de Velocidade ──
  lines.push('## Métricas de Velocidade');
  lines.push('');
  lines.push(mdTable(['Métrica', 'Valor'], [
    ['Hora de pico', speed.peak_hour || DASH],
    ['Total no pico', fmtInt(speed.peak_count)],
    ['Tempo médio entre validações', `${fmtInt(speed.avg_gap_seconds)}s`],
    ['Meta configurada', `${fmtInt(speed.target_seconds)}s`],
    ['Validações dentro da meta', fmtPct(speed.within_target_pct)],
  ]));
  lines.push('');

  // ── Ocorrências ──
  lines.push('## Ocorrências');
  lines.push('');
  if (alerts.length === 0) {
    lines.push(DASH);
  } else {
    lines.push(mdTable(
      ['Tipo', 'Nome', 'Horário', 'Terminal', 'Validador'],
      alerts.map((a) => [
        ALERT_TYPE_LABEL[a.type] || a.type || DASH,
        a.display_name || a.ticket_code || DASH,
        tsBR(a.created_at),
        a.terminal_name || DASH,
        a.validator_name || DASH,
      ])
    ));
  }
  lines.push('');

  // ── Log de Auditoria ──
  lines.push('## Log de Auditoria');
  lines.push('');
  if (audit.length === 0) {
    lines.push(DASH);
  } else {
    lines.push(mdTable(
      ['Ação', 'Entidade', 'Usuário', 'Horário', 'Detalhes'],
      audit.map((a) => [
        a.action || DASH,
        a.entity_type || DASH,
        a.user_name || DASH,
        tsBR(a.created_at),
        a.details ? JSON.stringify(a.details) : DASH,
      ])
    ));
  }
  lines.push('');

  return lines.join('\n');
}

// ────────────────────────────────────────────────
// CSV (com BOM UTF-8)
// ────────────────────────────────────────────────

function csvCell(value) {
  const str = value === undefined || value === null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

async function buildCsv(eventId, tenantId) {
  const res = await db.query(
    `SELECT
       t.ticket_code,
       COALESCE(t.display_name, l.beneficiary) AS display_name,
       t.batch,
       t.origin,
       t.status,
       l.entry_type,
       l.is_duplicate,
       u.name AS validator_name,
       term.name AS terminal_name,
       l.created_at AS entry_at,
       l.checkout_at
     FROM entry_logs l
     LEFT JOIN tickets t   ON t.id = l.ticket_id
     LEFT JOIN users u     ON u.id = l.validator_id
     LEFT JOIN terminals term ON term.id = l.terminal_id
     WHERE l.event_id = $1
       AND ($2::uuid IS NULL OR l.tenant_id = $2)
     ORDER BY l.created_at ASC`,
    [eventId, tenantId || null]
  );

  const header = [
    'ticket_code', 'display_name', 'batch', 'origin', 'status',
    'entry_type', 'is_duplicate', 'validator_name', 'terminal_name',
    'entry_at', 'checkout_at',
  ];

  const rows = res.rows.map((r) => [
    r.ticket_code || '',
    r.display_name || '',
    r.batch || '',
    r.origin || '',
    r.status || '',
    r.entry_type || '',
    r.is_duplicate ? 'true' : 'false',
    r.validator_name || '',
    r.terminal_name || '',
    r.entry_at ? new Date(r.entry_at).toISOString() : '',
    r.checkout_at ? new Date(r.checkout_at).toISOString() : '',
  ]);

  const body = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  return `\uFEFF${body}\n`;
}

// ────────────────────────────────────────────────
// Auditoria (JSON)
// ────────────────────────────────────────────────

async function listAudit(eventId, tenantId, limit) {
  return listAuditRows(eventId, tenantId, limit);
}

module.exports = {
  slugify,
  buildMarkdown,
  buildCsv,
  listAudit,
};
