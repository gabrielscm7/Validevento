/**
 * Terminais genéricos de acesso rápido por slug (sem login obrigatório).
 *
 * O terminal genérico é criado pelo admin/supervisor e expõe um slug de 6
 * caracteres. Qualquer pessoa com o link pode operar como validador; a
 * autorização das rotas públicas é feita resolvendo o slug para
 * (terminal_id, event_id, tenant_id).
 */
const QRCode = require('qrcode');
const db = require('../../config/database');

const SLUG_RE = /^[A-Z0-9]{6}$/;

function frontendBaseUrl() {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.FRONTEND_URL ||
    'https://www.validevento.com.br'
  ).replace(/\/+$/, '');
}

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
    `SELECT t.id, t.name, t.slug, t.is_generic, t.online, t.operator_name,
            t.last_seen_at, t.created_at, t.suspended, t.suspended_at,
            e.name AS event_name,
            (SELECT COUNT(*)::integer FROM entry_logs el
              WHERE el.terminal_id = t.id
                AND el.created_at >= CURRENT_DATE) AS validations_today
     FROM terminals t
     JOIN events e ON e.id = t.event_id
     WHERE t.event_id = $1
       AND t.deleted_at IS NULL
     ORDER BY t.created_at ASC`,
    [eventId]
  );
  return result.rows.map((r) => ({
    ...r,
    validations_today: Number(r.validations_today),
  }));
}

/** Resolve um slug para o terminal genérico + evento. Retorna null se inválido. */
async function findGenericBySlug(slug) {
  const normalized = String(slug || '').trim().toUpperCase();
  if (!SLUG_RE.test(normalized)) return null;

  const result = await db.query(
    `SELECT t.id, t.name, t.event_id, t.online, t.operator_name,
            t.suspended, t.suspended_at, t.deleted_at,
            e.name AS event_name, e.status AS event_status,
            e.date AS event_date, e.location, e.logo_url, e.tenant_id
     FROM terminals t
     JOIN events e ON e.id = t.event_id
     WHERE t.slug = $1 AND t.is_generic = true`,
    [normalized]
  );
  return result.rows[0] || null;
}

/**
 * Abre (ou reabre) um terminal genérico de forma idempotente.
 * Vários clientes podem abrir o mesmo slug simultaneamente sem conflito.
 */
async function openOrGetTerminal(slug, operatorName) {
  const terminal = await findGenericBySlug(slug);

  if (!terminal) return { error: 'terminal_not_found' };
  if (terminal.deleted_at) return { error: 'terminal_deleted' };
  if (terminal.suspended) return { error: 'terminal_suspended' };

  const result = await db.query(
    `UPDATE terminals
     SET online = true,
         last_seen_at = NOW(),
         operator_name = COALESCE($2, operator_name)
     WHERE id = $1
     RETURNING id, name, event_id, online, operator_name`,
    [terminal.id, operatorName || null]
  );

  const row = result.rows[0];
  return {
    terminal_id: row.id,
    terminal_name: row.name,
    event_id: row.event_id,
    event_name: terminal.event_name,
    event_date: terminal.event_date,
    event_location: terminal.location,
    logo_url: terminal.logo_url,
    event_config: await getEventConfig(terminal.event_id),
  };
}

/** Suspende/reativa um terminal. */
async function setSuspended(terminalId, suspended, userId) {
  const result = await db.query(
    `UPDATE terminals
     SET suspended = $2,
         suspended_at = CASE WHEN $2 = true THEN NOW() ELSE NULL END,
         suspended_by = CASE WHEN $2 = true THEN $3::uuid ELSE NULL END
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [terminalId, suspended, userId || null]
  );
  return result.rows[0] || null;
}

/** Soft-delete: preserva os dados e apenas torna o terminal inacessível. */
async function softDelete(terminalId) {
  const result = await db.query(
    `UPDATE terminals
     SET deleted_at = NOW(), online = false
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [terminalId]
  );
  return result.rowCount > 0;
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

/** Gera o QR code (data URL) e a URL pública de acesso rápido do terminal. */
async function generateQRCode(slug) {
  const normalized = String(slug || '').trim().toUpperCase();
  if (!SLUG_RE.test(normalized)) {
    throw new Error('terminal_not_found');
  }
  const terminal = await findGenericBySlug(normalized);
  if (!terminal || terminal.deleted_at) {
    throw new Error('terminal_not_found');
  }

  const url = `${frontendBaseUrl()}/terminal/join/${normalized}`;
  const qrcode = await QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
  return { slug: normalized, url, qrcode };
}

/** Gera o QR code no formato PNG (buffer). */
async function generateQRBuffer(slug) {
  const normalized = String(slug || '').trim().toUpperCase();
  if (!SLUG_RE.test(normalized)) {
    throw new Error('terminal_not_found');
  }
  const terminal = await findGenericBySlug(normalized);
  if (!terminal || terminal.deleted_at) {
    throw new Error('terminal_not_found');
  }

  const url = `${frontendBaseUrl()}/terminal/join/${normalized}`;
  return QRCode.toBuffer(url, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
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
  openOrGetTerminal,
  setSuspended,
  softDelete,
  generateQRCode,
  generateQRBuffer,
};
