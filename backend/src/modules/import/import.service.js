const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const XLSX = require('xlsx');
const db = require('../../config/database');
const { isValidUUIDv4 } = require('../../utils/validation');

function detectFormat(fileOrPath) {
  if (!fileOrPath) return null;
  const ext = path.extname(fileOrPath).toLowerCase();
  const map = { '.csv': 'csv', '.json': 'json', '.xml': 'xml', '.xlsx': 'xlsx', '.xls': 'xlsx', '.xlsm': 'xlsx' };
  return map[ext] || null;
}

function parseJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : (data.data || data.rows || data.tickets || [data]);
}

function parseXML(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const records = [];
  const ticketRegex = /<(?:ticket|item|row|record|ingresso)\b[^>]*>([\s\S]*?)<\/(?:ticket|item|row|record|ingresso)>/gi;
  let match;
  while ((match = ticketRegex.exec(raw)) !== null) {
    const block = match[1];
    const record = {};
    const fieldRegex = /<(\w+)>([\s\S]*?)<\/\1>/gi;
    let fm;
    while ((fm = fieldRegex.exec(block)) !== null) {
      record[fm[1]] = fm[2].trim();
    }
    if (Object.keys(record).length > 0) records.push(record);
  }
  if (records.length === 0) {
    const rootRegex = /<(\w+)>([\s\S]*?)<\/\1>/gi;
    let rm;
    while ((rm = rootRegex.exec(raw)) !== null) {
      if (!['tickets', 'items', 'rows', 'records', 'root', 'data'].includes(rm[1].toLowerCase())) {
        if (!records[0]) records[0] = {};
        records[0][rm[1]] = rm[2].trim();
      }
    }
    if (Object.keys(records[0] || {}).length > 0) return records;
  }
  return records;
}

function parseXLSX(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

const FIELD_ALIASES = {
  codigo: 'ticket_code',
  nome: 'display_name',
  código: 'ticket_code',
  id_ingresso: 'ticket_code',
  id: 'ticket_code',
  code: 'ticket_code',
  lote: 'batch',
  batch_name: 'batch',
  nome_exibicao: 'display_name',
  name: 'display_name',
};

function normalizeKeys(raw) {
  const out = {};
  for (const key of Object.keys(raw)) {
    const lower = key.trim().toLowerCase();
    const canonical = FIELD_ALIASES[lower] || lower;
    if (out[canonical] === undefined || out[canonical] === '' || out[canonical] === null) {
      out[canonical] = raw[key];
    }
  }
  return out;
}

function normalizeRecord(raw, batchOverride) {
  const r = normalizeKeys(raw);
  const ticketCode   = r.ticket_code || '';
  const batch        = batchOverride || r.batch || 'LOTE-01';
  const displayName  = r.display_name || null;
  const status       = (r.status || 'active').toLowerCase();
  return { ticketCode, batch, displayName, status };
}

async function importFile(eventId, filePath, originalName, batchOverride, tenantId) {
  const startTime = Date.now();

  // Evento precisa existir e pertencer ao tenant do usuário autenticado
  const eventRes = await db.query(
    'SELECT id, tenant_id FROM events WHERE id = $1',
    [eventId]
  );
  if (eventRes.rowCount === 0) {
    const err = new Error('Evento não encontrado para vincular os ingressos.');
    err.status = 404;
    throw err;
  }

  const eventTenantId = eventRes.rows[0].tenant_id;
  if (tenantId && eventTenantId !== tenantId) {
    const err = new Error('Evento não pertence ao seu cliente.');
    err.status = 403;
    throw err;
  }

  const format = detectFormat(originalName) || detectFormat(filePath);
  if (!format) {
    const err = new Error('Formato de arquivo não suportado. Use CSV, JSON, XML ou XLSX.');
    err.status = 400;
    throw err;
  }

  let records;
  try {
    if (format === 'csv') {
      records = await parseCSVStream(filePath);
    } else if (format === 'json') {
      records = parseJSON(filePath);
    } else if (format === 'xml') {
      records = parseXML(filePath);
    } else if (format === 'xlsx') {
      records = parseXLSX(filePath);
    }
  } catch (err) {
    const wrapped = new Error(`Erro ao ler arquivo ${format.toUpperCase()}: ${err.message}`);
    wrapped.status = 400;
    throw wrapped;
  }

  if (!records || records.length === 0) {
    const err = new Error('Nenhum registro encontrado no arquivo.');
    err.status = 400;
    throw err;
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    try {
      const raw = records[i];
      let { ticketCode, batch, displayName, status: rawStatus } = normalizeRecord(raw, batchOverride);

      if (!ticketCode) {
        errors.push({ line: i + 2, reason: 'ticket_code/id ausente.' });
        continue;
      }

      ticketCode = ticketCode.trim().toLowerCase();

      if (!isValidUUIDv4(ticketCode)) {
        errors.push({ line: i + 2, reason: `ticket_code inválido: '${ticketCode}' não é um UUID v4 válido.` });
        continue;
      }

      let status = rawStatus;
      const validStatuses = ['active', 'validated', 'blocked'];
      if (!validStatuses.includes(status)) {
        status = 'active';
      }

      const checkRes = await db.query(
        'SELECT id, status FROM tickets WHERE LOWER(ticket_code) = $1 AND event_id = $2',
        [ticketCode, eventId]
      );

      if (checkRes.rowCount > 0) {
        const existing = checkRes.rows[0];
        if (existing.status === 'validated') {
          skipped++;
          continue;
        }
        await db.query(
          `UPDATE tickets SET batch = $1, display_name = $2, status = $3, updated_at = NOW() WHERE id = $4`,
          [batch, displayName, status, existing.id]
        );
        updated++;
      } else {
        await db.query(
          `INSERT INTO tickets (event_id, tenant_id, ticket_code, batch, display_name, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [eventId, eventTenantId, ticketCode, batch, displayName, status]
        );
        inserted++;
      }
    } catch (err) {
      errors.push({ line: i + 2, reason: err.message });
    }
  }

  try { fs.unlinkSync(filePath); } catch { /* ignore */ }

  return {
    inserted,
    updated,
    skipped,
    errors,
    duration_ms: Date.now() - startTime,
    format,
    total: records.length,
  };
}

function parseCSVStream(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (r) => records.push(r))
      .on('error', reject)
      .on('end', () => resolve(records));
  });
}

module.exports = {
  importFile,
  detectFormat,
};
