/**
 * Módulo de configuração de evento (Fase 2) — event_config.
 */
const db = require('../../config/database');

function apiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

const ALLOWED_FIELDS = [
  'qrcode_field',
  'manual_fields',
  'checkout_enabled',
  'reentry_mode',
  'duplicate_action',
  'master_ticket_enabled',
  'validation_speed_target_sec',
  'gate_tracking_enabled',
  'export_formats',
];

const VALID_QRCODE_FIELDS = ['ticket_code', 'cpf', 'custom_hash'];
const VALID_REENTRY = ['none', 'free', 'conditioned'];
const VALID_DUPLICATE = ['warn', 'block'];
const VALID_EXPORT = ['md', 'csv', 'json'];

/** Busca a config de um evento. Retorna null se não existir. */
async function getConfig(eventId) {
  const result = await db.query(
    'SELECT * FROM event_config WHERE event_id = $1',
    [eventId]
  );
  return result.rows[0] || null;
}

async function ensureConfig(eventId) {
  await db.query(
    `INSERT INTO event_config (event_id) VALUES ($1)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId]
  );
  return getConfig(eventId);
}

/** Normaliza valores enviados (arrays vindos via JSON podem ser string). */
function normalizeArrays(payload) {
  const out = { ...payload };
  for (const key of ['manual_fields', 'export_formats']) {
    if (out[key] !== undefined) {
      out[key] = Array.isArray(out[key]) ? out[key] : [out[key]];
    }
  }
  return out;
}

/**
 * Atualiza a configuração. Se o evento estiver fechado, bloqueia edição
 * de checkout_enabled e reentry_mode (estado operacional imutável).
 */
async function updateConfig(eventId, payload) {
  const clean = normalizeArrays(payload);

  const invalidFields = Object.keys(clean).filter((k) => !ALLOWED_FIELDS.includes(k));
  if (invalidFields.length) {
    throw apiError(400, 'invalid_fields', `Campos inválidos: ${invalidFields.join(', ')}.`);
  }

  if (clean.qrcode_field !== undefined && !VALID_QRCODE_FIELDS.includes(clean.qrcode_field)) {
    throw apiError(422, 'invalid_value', `qrcode_field inválido. Use: ${VALID_QRCODE_FIELDS.join(' | ')}.`);
  }
  if (clean.reentry_mode !== undefined && !VALID_REENTRY.includes(clean.reentry_mode)) {
    throw apiError(422, 'invalid_value', `reentry_mode inválido. Use: ${VALID_REENTRY.join(' | ')}.`);
  }
  if (clean.duplicate_action !== undefined && !VALID_DUPLICATE.includes(clean.duplicate_action)) {
    throw apiError(422, 'invalid_value', `duplicate_action inválido. Use: ${VALID_DUPLICATE.join(' | ')}.`);
  }
  if (clean.export_formats !== undefined) {
    const bad = clean.export_formats.filter((f) => !VALID_EXPORT.includes(f));
    if (bad.length) throw apiError(422, 'invalid_value', `export_formats inválidos: ${bad.join(', ')}.`);
  }

  const eventRes = await db.query('SELECT status FROM events WHERE id = $1', [eventId]);
  if (eventRes.rowCount === 0) return null;
  const eventStatus = eventRes.rows[0].status;

  const updates = [];
  const params = [];
  let idx = 1;

  for (const field of ALLOWED_FIELDS) {
    if (clean[field] === undefined) continue;

    // Bloqueia mudança operacional em evento fechado
    if ((field === 'checkout_enabled' || field === 'reentry_mode') && eventStatus === 'closed') {
      throw apiError(
        422,
        'event_closed',
        `Não é possível alterar '${field}' em um evento encerrado.`
      );
    }

    updates.push(`${field} = $${idx++}`);
    params.push(clean[field]);
  }

  if (updates.length === 0) {
    throw apiError(400, 'no_fields', 'Nenhuma configuração para atualizar.');
  }

  updates.push('updated_at = NOW()');
  params.push(eventId);

  const result = await db.query(
    `UPDATE event_config
     SET ${updates.join(', ')}
     WHERE event_id = $${idx}
     RETURNING *`,
    params
  );

  if (result.rowCount === 0) {
    // Config ainda não existe (ex.: evento legado) → cria com defaults + aplica
    await ensureConfig(eventId);
    return updateConfig(eventId, clean);
  }

  return result.rows[0];
}

/**
 * Toggle de checkout em tempo real. Só permitido com evento 'active'.
 */
async function toggleCheckout(eventId, checkoutEnabled) {
  const eventRes = await db.query(
    'SELECT status FROM events WHERE id = $1', [eventId]
  );
  if (eventRes.rowCount === 0) return null;
  if (eventRes.rows[0].status !== 'active') {
    throw apiError(422, 'event_not_active', 'Checkout só pode ser alterado com o evento ativo.');
  }
  if (typeof checkoutEnabled !== 'boolean') {
    throw apiError(400, 'invalid_value', 'checkout_enabled deve ser booleano.');
  }

  const result = await db.query(
    `UPDATE event_config
     SET checkout_enabled = $2, updated_at = NOW()
     WHERE event_id = $1
     RETURNING *`,
    [eventId, checkoutEnabled]
  );

  if (result.rowCount === 0) {
    await ensureConfig(eventId);
    return toggleCheckout(eventId, checkoutEnabled);
  }

  return result.rows[0];
}

module.exports = { getConfig, ensureConfig, updateConfig, toggleCheckout };
