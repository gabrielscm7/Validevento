const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const XLSX = require('xlsx');
const db = require('../../config/database');
const { hashCPF } = require('../../utils/hash');

/**
 * Detecta o formato do arquivo pela extensão
 */
function detectFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = { '.csv': 'csv', '.json': 'json', '.xml': 'xml', '.xlsx': 'xlsx' };
  return map[ext] || null;
}

/**
 * Parse de arquivo JSON (array de objetos)
 */
function parseJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : (data.data || data.rows || data.tickets || [data]);
}

/**
 * Parse simples de XML (flat, campos como tags)
 * Suporta formatos: <tickets><ticket><ticket_code>...</ticket_code>...</ticket></tickets>
 */
function parseXML(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const records = [];
  // Extrai blocos entre tags de ticket/item/row/record
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
  // Fallback: procura tags diretas no root
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

/**
 * Parse de arquivo XLSX (primeira planilha)
 */
function parseXLSX(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/**
 * Normaliza um registro de qualquer formato para o schema interno
 */
function normalizeRecord(raw) {
  const ticketCode = raw.ticket_code || raw.id_ingresso || raw.code || raw.id || '';
  const batch      = raw.batch || raw.lote || raw.batch_name || 'IMPORTADO';
  const rawCpf     = raw.cpf || raw.CPF || raw.cpf_raw || null;
  const hashCpfField = raw.hash_cpf || null;
  const displayName = raw.display_name || raw.nome_exibicao || raw.name || raw.nome || null;
  const status      = (raw.status || 'linked').toLowerCase();
  return { ticketCode, batch, rawCpf, hashCpfField, displayName, status };
}

/**
 * Processa a importação de ingressos via arquivo (CSV, JSON, XML, XLSX)
 * @param {string} eventId - UUID do evento
 * @param {string} filePath - Caminho do arquivo temporário
 * @returns {Promise<{inserted: number, updated: number, skipped: number, errors: Array, duration_ms: number}>}
 */
async function importFile(eventId, filePath) {
  const startTime = Date.now();

  // 1. Validar evento e obter salt
  const eventRes = await db.query('SELECT salt FROM events WHERE id = $1', [eventId]);
  if (eventRes.rowCount === 0) {
    throw new Error('Evento não encontrado para vincular os ingressos.');
  }
  const eventSalt = eventRes.rows[0].salt;

  // 2. Detectar formato e parse
  const format = detectFormat(filePath);
  if (!format) {
    throw new Error('Formato de arquivo não suportado. Use CSV, JSON, XML ou XLSX.');
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
    throw new Error(`Erro ao ler arquivo ${format.toUpperCase()}: ${err.message}`);
  }

  if (!records || records.length === 0) {
    throw new Error('Nenhum registro encontrado no arquivo.');
  }

  // 3. Processar registros
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    try {
      const raw = records[i];
      const { ticketCode, batch, rawCpf, hashCpfField, displayName, status: rawStatus } = normalizeRecord(raw);

      if (!ticketCode) {
        errors.push({ line: i + 2, reason: 'ticket_code/id ausente.' });
        continue;
      }

      let status = rawStatus;
      const validStatuses = ['generated', 'linked', 'validated', 'blocked'];
      if (!validStatuses.includes(status)) {
        status = 'generated';
      }

      let finalHashCpf = null;
      if (hashCpfField && hashCpfField.length === 64) {
        finalHashCpf = hashCpfField;
      } else if (rawCpf) {
        finalHashCpf = hashCPF(rawCpf, eventSalt);
      } else if (hashCpfField) {
        finalHashCpf = hashCPF(hashCpfField, eventSalt);
      }

      if (finalHashCpf && status === 'generated') {
        status = 'linked';
      } else if (!finalHashCpf && status === 'linked') {
        status = 'generated';
      }

      const checkRes = await db.query(
        'SELECT id, status FROM tickets WHERE ticket_code = $1 AND event_id = $2',
        [ticketCode, eventId]
      );

      if (checkRes.rowCount > 0) {
        const existing = checkRes.rows[0];
        if (existing.status === 'validated') {
          skipped++;
          continue;
        }
        await db.query(
          `UPDATE tickets SET batch = $1, hash_cpf = $2, display_name = $3, status = $4, updated_at = NOW() WHERE id = $5`,
          [batch, finalHashCpf, displayName, status, existing.id]
        );
        updated++;
      } else {
        await db.query(
          `INSERT INTO tickets (event_id, ticket_code, batch, hash_cpf, display_name, status) VALUES ($1, $2, $3, $4, $5, $6)`,
          [eventId, ticketCode, batch, finalHashCpf, displayName, status]
        );
        inserted++;
      }
    } catch (err) {
      errors.push({ line: i + 2, reason: err.message });
    }
  }

  // 4. Limpar arquivo temporário
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

/**
 * Parse CSV via stream (mantido para compatibilidade)
 */
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
