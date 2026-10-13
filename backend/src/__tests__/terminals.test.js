const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, createTicket, loginToken, auth, pool,
} = helpers;

describe('Terminais genéricos por slug (Sessão 3)', () => {
  let client;
  let adminToken;
  let eventId;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id, role: 'admin', cpf: '33300033303',
      password: 'admin123', email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    const ev = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name: 'Evento Genérico',
        date: new Date('2026-12-20T18:00:00Z').toISOString(),
        location: 'Local',
        capacity: 1000,
      });
    eventId = ev.body.id;

    const act = await api()
      .patch(`/api/events/${eventId}/status`)
      .set(auth(adminToken))
      .send({ status: 'active' });
    expect(act.status).toBe(200);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createGeneric(name = 'Portaria 1') {
    return api()
      .post(`/api/events/${eventId}/terminals/generic`)
      .set(auth(adminToken))
      .send({ name });
  }

  test('T-generic-1: Admin cria terminal genérico com slug de 6 chars', async () => {
    const res = await createGeneric('Portaria 1');
    expect(res.status).toBe(201);
    expect(res.body.slug).toMatch(/^[A-Z0-9]{6}$/);
    expect(res.body.is_generic).toBe(true);
  });

  test('T-generic-2: Acesso público via slug válido', async () => {
    const created = await createGeneric('Portaria 2');
    const res = await api().get(`/api/terminal/join/${created.body.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.event_id).toBe(eventId);
    expect(res.body.terminal_id).toBe(created.body.id);
    expect(res.body.event_config).toBeTruthy();
  });

  test('T-generic-3: Slug inválido retorna 404', async () => {
    const res = await api().get('/api/terminal/join/ZZZZZZ');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('terminal_not_found');
  });

  test('T-generic-4: Slug de evento inativo retorna 403', async () => {
    const draft = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({ name: 'Evento Draft Gen', date: new Date().toISOString(), location: 'L', capacity: 100 });

    const gen = await api()
      .post(`/api/events/${draft.body.id}/terminals/generic`)
      .set(auth(adminToken))
      .send({ name: 'Draft Terminal' });

    const res = await api().get(`/api/terminal/join/${gen.body.slug}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('event_not_active');
  });

  test('T-generic-5: Open registra operator_name', async () => {
    const created = await createGeneric('Portaria 5');
    const res = await api()
      .post(`/api/terminal/join/${created.body.slug}/open`)
      .send({ operator_name: 'João' });

    expect(res.status).toBe(200);

    const row = await pool.query(
      'SELECT operator_name, online FROM terminals WHERE slug = $1',
      [created.body.slug]
    );
    expect(row.rows[0].operator_name).toBe('João');
    expect(row.rows[0].online).toBe(true);
  });

  test('T-generic-6: Snapshot público por slug', async () => {
    const created = await createGeneric('Portaria 6');
    await createTicket({ event_id: eventId, tenant_id: client.id });

    const res = await api().get(`/api/terminal/${created.body.slug}/snapshot`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.event_config).toBeTruthy();
  });

  test('T-generic-7: Validação pública por slug grava validator_id null', async () => {
    const created = await createGeneric('Portaria 7');
    const ticketCode = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tickets (event_id, tenant_id, ticket_code, batch, display_name, status)
       SELECT $1, tenant_id, $2, 'T', 'Gen', 'active' FROM events WHERE id = $1`,
      [eventId, ticketCode]
    );

    const res = await api()
      .post(`/api/terminal/${created.body.slug}/qrcode`)
      .send({ ticket_code: ticketCode });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('authorized');

    const log = await pool.query(
      `SELECT validator_id, terminal_id FROM entry_logs
       WHERE ticket_id = (SELECT id FROM tickets WHERE ticket_code = $1)`,
      [ticketCode]
    );
    expect(log.rows[0].validator_id).toBeNull();
    expect(log.rows[0].terminal_id).toBe(created.body.id);
  });

  test('T-generic-8: Gates públicos por slug', async () => {
    const created = await createGeneric('Portaria 8');
    const res = await api().get(`/api/terminal/${created.body.slug}/gates`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
