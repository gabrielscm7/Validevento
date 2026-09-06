const crypto = require('crypto');
const XLSX = require('xlsx');
const helpers = require('./helpers');
const {
  api, resetDb, pool, createClient, createUser, createEvent, loginToken, auth,
} = helpers;

function buildXlsxBuffer(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ingressos');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('Importação de arquivos (Parte F / BUG-03)', () => {
  let adminToken;
  let eventId;

  beforeAll(async () => {
    await resetDb();

    const client = await createClient();
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '10101010101',
      password: 'admin123',
      email_verified: true,
    });
    const event = await createEvent({ tenant_id: client.id });

    adminToken = await loginToken(admin.plain_cpf, 'admin123');
    eventId = event.id;
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  test('T-01: importar XLSX com colunas Codigo/Nome → inserted > 0 e errors = []', async () => {
    const code1 = crypto.randomUUID();
    const code2 = crypto.randomUUID();
    const buffer = buildXlsxBuffer([
      ['Codigo', 'Nome'],
      [code1, 'Ana Beatriz Souza'],
      [code2, 'Carlos Eduardo M.'],
    ]);

    const res = await api()
      .post('/api/import/csv')
      .set(auth(adminToken))
      .field('event_id', eventId)
      .attach('file', buffer, {
        filename: 'ingressos.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBeGreaterThan(0);
    expect(res.body.errors).toEqual([]);
    expect(res.body.format).toBe('xlsx');
  });

  test('T-import-mime: CSV com MIME text/plain (browser mobile) é aceito', async () => {
    const code = crypto.randomUUID();
    const csv = `codigo,nome\n${code},Marina Oliveira\n`;

    const res = await api()
      .post('/api/import/csv')
      .set(auth(adminToken))
      .field('event_id', eventId)
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'ingressos.csv',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.inserted).toBe(1);
    expect(res.body.format).toBe('csv');
  });

  test('T-import-mime2: XLSX com MIME application/octet-stream é aceito', async () => {
    const code = crypto.randomUUID();
    const buffer = buildXlsxBuffer([
      ['Codigo', 'Nome'],
      [code, 'Rafael Costa'],
    ]);

    const res = await api()
      .post('/api/import/csv')
      .set(auth(adminToken))
      .field('event_id', eventId)
      .attach('file', buffer, {
        filename: 'base.xlsx',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.inserted).toBe(1);
    expect(res.body.format).toBe('xlsx');
  });

  test('T-10: importar arquivo corrompido retorna erro descritivo e não altera a base', async () => {
    const before = await pool.query(
      'SELECT COUNT(*)::int AS total FROM tickets WHERE event_id = $1',
      [eventId]
    );

    // CSV com códigos inválidos (não-UUID)
    const badCsv = 'codigo,nome\nnao-e-uuid,Fulano\noutro-codigo,Invalido\n';

    const res = await api()
      .post('/api/import/csv')
      .set(auth(adminToken))
      .field('event_id', eventId)
      .attach('file', Buffer.from(badCsv, 'utf8'), {
        filename: 'corrompido.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(0);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].reason).toContain('inválido');

    const after = await pool.query(
      'SELECT COUNT(*)::int AS total FROM tickets WHERE event_id = $1',
      [eventId]
    );
    expect(after.rows[0].total).toBe(before.rows[0].total);
  });
});
