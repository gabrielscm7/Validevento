const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, loginToken, auth,
} = helpers;

describe('Gestão de portões (Fase 2)', () => {
  let client;
  let adminToken;
  let eventId;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '11111111112',
      password: 'admin123',
      email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    const ev = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name: 'Evento Portões',
        date: new Date('2026-12-10T18:00:00Z').toISOString(),
        location: 'Estádio do Morumbi',
        capacity: 3000,
        responsible: ['Admin'],
      });
    expect(ev.status).toBe(201);
    eventId = ev.body.id;
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  test('T-gates-1: Abrir e fechar portão registra timestamps + histórico', async () => {
    const create = await api()
      .post(`/api/events/${eventId}/gates`)
      .set(auth(adminToken))
      .send({ name: 'Portão Principal' });
    expect(create.status).toBe(201);
    const gateId = create.body.id;

    const open = await api()
      .patch(`/api/events/${eventId}/gates/${gateId}/open`)
      .set(auth(adminToken));
    expect(open.status).toBe(200);
    expect(open.body.opened_at).toBeTruthy();
    expect(open.body.status).toBe('open');

    const close = await api()
      .patch(`/api/events/${eventId}/gates/${gateId}/close`)
      .set(auth(adminToken));
    expect(close.status).toBe(200);
    expect(close.body.closed_at).toBeTruthy();
    expect(close.body.status).toBe('closed');

    const list = await api()
      .get(`/api/events/${eventId}/gates`)
      .set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].opened_at).toBeTruthy();
    expect(list.body[0].closed_at).toBeTruthy();
  });

  test('T-gates-2: Abrir portão já aberto retorna erro 422', async () => {
    const create = await api()
      .post(`/api/events/${eventId}/gates`)
      .set(auth(adminToken))
      .send({ name: 'Portão Secundário' });
    const gateId = create.body.id;

    const primeiro = await api()
      .patch(`/api/events/${eventId}/gates/${gateId}/open`)
      .set(auth(adminToken));
    expect(primeiro.status).toBe(200);

    const segundo = await api()
      .patch(`/api/events/${eventId}/gates/${gateId}/open`)
      .set(auth(adminToken));
    expect(segundo.status).toBe(422);
    expect(segundo.body.error).toBe('gate_already_open');
  });
});
