const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, loginToken, auth, pool,
} = helpers;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Ingressos de emergência (Fase 2)', () => {
  let client;
  let adminToken;
  let validatorToken;
  let eventId;

  async function createEventViaApi(name = 'Evento Emergência') {
    const res = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name,
        date: new Date('2026-12-05T18:00:00Z').toISOString(),
        location: 'Allianz Parque',
        capacity: 3000,
        responsible: ['Admin'],
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function freshMasterEvent(name) {
    const ev = await createEventViaApi(name);
    const config = await api()
      .put(`/api/events/${ev.id}/config`)
      .set(auth(adminToken))
      .send({ master_ticket_enabled: true });
    expect(config.status).toBe(200);
    return ev;
  }

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '90909090909',
      password: 'admin123',
      email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    const validator = await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '10101010102',
      password: 'valid123',
      email_verified: true,
    });
    validatorToken = await loginToken(validator.plain_cpf, 'valid123');

    const event = await createEventViaApi();
    eventId = event.id;
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  test('T-08: Gerar convite avulso e usar imediatamente → authorized', async () => {
    const invite = await api()
      .post(`/api/events/${eventId}/invitations`)
      .set(auth(adminToken))
      .send({ display_name: 'Convidado Teste' });

    expect(invite.status).toBe(201);
    expect(invite.body.ticket_code).toBeTruthy();
    expect(invite.body.origin).toBe('cortesia');
    expect(invite.body.status).toBe('active');
    expect(invite.body.qrcode_data).toBe(invite.body.ticket_code);

    const validacao = await api()
      .post('/api/validation/qrcode')
      .set(auth(validatorToken))
      .send({ ticket_code: invite.body.ticket_code, event_id: eventId });

    expect(validacao.status).toBe(200);
    expect(validacao.body.status).toBe('authorized');
  });

  test('T-09: Ingresso master sem limite de usos → 3 usos authorized, uses_remaining null', async () => {
    const ev = await freshMasterEvent('Master Ilimitado');
    const create = await api()
      .post(`/api/events/${ev.id}/master-ticket`)
      .set(auth(adminToken))
      .send({ max_uses: null });

    expect(create.status).toBe(201);
    expect(create.body.max_uses).toBe(null);

    for (let i = 0; i < 3; i++) {
      const use = await api()
        .post('/api/validation/master')
        .set(auth(validatorToken))
        .send({
          event_id: ev.id,
          beneficiary_name: `Beneficiado ${i + 1}`,
        });

      expect(use.status).toBe(200);
      expect(use.body.status).toBe('authorized');
      expect(use.body.entry_type).toBe('master');
      expect(use.body.uses_remaining).toBe(null);
    }
  });

  test('T-09b: Ingresso master com limite atingido → erro na 3ª tentativa', async () => {
    const ev = await freshMasterEvent('Master Limitado');
    const create = await api()
      .post(`/api/events/${ev.id}/master-ticket`)
      .set(auth(adminToken))
      .send({ max_uses: 2 });

    expect(create.status).toBe(201);
    expect(create.body.max_uses).toBe(2);

    for (let i = 0; i < 2; i++) {
      const use = await api()
        .post('/api/validation/master')
        .set(auth(validatorToken))
        .send({ event_id: ev.id, beneficiary_name: `Usuário ${i + 1}` });
      expect(use.status).toBe(200);
      expect(use.body.status).toBe('authorized');
      expect(use.body.uses_remaining).toBe(1 - i);
    }

    const terceiro = await api()
      .post('/api/validation/master')
      .set(auth(validatorToken))
      .send({ event_id: ev.id, beneficiary_name: 'Terceiro' });

    expect(terceiro.status).toBe(422);
    expect(terceiro.body.error).toBe('master_ticket_limit_reached');
  });

  test('T-09c: GET master-ticket retorna 404 antes de criar', async () => {
    // Cria evento próprio sem master ticket
    const ev = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name: 'Sem Master',
        date: new Date('2026-12-06T18:00:00Z').toISOString(),
        location: 'Local X',
        capacity: 100,
        responsible: ['Admin'],
      });

    const res = await api()
      .get(`/api/events/${ev.body.id}/master-ticket`)
      .set(auth(adminToken));

    expect(res.status).toBe(404);
  });

  test('T-bulk-1: Liberação em lista via CSV → inserted 5 com UUID v4 válido', async () => {
    const csvLines = ['display_name,cpf'];
    for (let i = 1; i <= 5; i++) {
      csvLines.push(`Pessoa ${i},${String(20000000000 + i).slice(-11)}`);
    }
    const csv = csvLines.join('\n') + '\n';

    const res = await api()
      .post(`/api/events/${eventId}/invitations/bulk`)
      .set(auth(adminToken))
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'liberacao.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(5);
    expect(res.body.errors).toEqual([]);

    const { rows } = await pool.query(
      `SELECT ticket_code FROM tickets
       WHERE event_id = $1 AND origin = 'liberacao_especial'`,
      [eventId]
    );
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(row.ticket_code).toMatch(UUID_RE);
    }
  });
});
