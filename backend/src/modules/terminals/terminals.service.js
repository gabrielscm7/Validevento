/**
 * Terminais genéricos de acesso rápido por slug (sem login obrigatório).
 *
 * O terminal genérico é criado pelo admin/supervisor e expõe um slug de 6
 * caracteres. Qualquer pessoa com o link pode operar como validador; a
 * autorização das rotas públicas é feita resolvendo o slug para
 * (terminal_id, event_id, tenant_id).
 */
const db = require('../../config/database');

const SLUG_RE = /^[A-Z0-9]{6}$/;

const DEFAULT_CONFIG = {
  qrcode_field: 'ticket_code',
  manual_fields: ['display_name'],
  checkout_enabled: false,
  master_ticket_enabled: false,
};

async function generateUniqueSlug() {
  for (let i = 0; i < 10; i += 1) {
    const result = await db.query('SELECT generate_terminal_slug() AS slug');
    const slug = result.rows[0].slug;
    const exists = await db.query('SELECT 1 FROM terminals WHERE slug = $1', [slug]);
    if (exists.rowCount === 0) return slug;
  }
  throw new Error('Não foi possível gerar slug único.');
}

async function createGeneric(eventId, name) {
  const slug = await generateUniqueSlug();
  const result = await db.query(
    `INSERT INTO terminals (event_id, name, slug, is_generic)
     VALUES ($1, $2, $3, true)
     RETURNING id, name, slug, is_generic, online, created_at`,
    [eventId, name || 'Terminal Genérico', slug]
  );
  return result.rows[0];
}

async function listTerminals(eventId) {
  const result = await db.query(
    `SELECT id, name, slug, is_generic, online, operator_name,
            last_seen_at, created_at
     FROM terminals
     WHERE event_id = $1
     ORDER BY created_at ASC`,
    [eventId]
  );
  return result.rows;
}

/** Resolve um slug para o terminal genérico + evento. Retorna null se inválido. */
async function findGenericBySlug(slug) {
  const normalized = String(slug || '').trim().toUpperCase();
  if (!SLUG_RE.test(normalized)) return null;

  const result = await db.query(
    `SELECT t.id, t.name, t.event_id, t.online, t.operator_name,
            e.name AS event_name, e.status AS event_status,
            e.date AS event_date, e.location, e.logo_url, e.tenant_id
     FROM terminals t
     JOIN events e ON e.id = t.event_id
     WHERE t.slug = $1 AND t.is_generic = true`,
    [normalized]
  );
  return result.rows[0] || null;
}

async function getEventConfig(eventId) {
  const result = await db.query(
    `SELECT qrcode_field, manual_fields, checkout_enabled, master_ticket_enabled
     FROM event_config
     WHERE event_id = $1`,
    [eventId]
  );
  if (result.rowCount === 0) return { ...DEFAULT_CONFIG };
  const row = result.rows[0];
  return {
    qrcode_field: row.qrcode_field || DEFAULT_CONFIG.qrcode_field,
    manual_fields: row.manual_fields || DEFAULT_CONFIG.manual_fields,
    checkout_enabled: row.checkout_enabled || false,
    master_ticket_enabled: row.master_ticket_enabled || false,
  };
}

async function setOnline(terminalId, operatorName) {
  await db.query(
    `UPDATE terminals
     SET online = true, last_seen_at = NOW(), operator_name = $2
     WHERE id = $1`,
    [terminalId, operatorName || null]
  );
}

module.exports = {
  SLUG_RE,
  createGeneric,
  listTerminals,
  findGenericBySlug,
  getEventConfig,
  setOnline,
};
