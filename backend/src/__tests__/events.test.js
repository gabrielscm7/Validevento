const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, createEvent, loginToken, auth,
} = helpers;

describe('Gestão de eventos (Fase 2)', () => {
  let client;
  let adminToken;
  let eventId;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '20202020202',
      password: 'admin123',
      email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  async function createEventViaApi(name = 'Evento API') {
    const res = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name,
        date: new Date('2026-11-20T19:00:00Z').toISOString(),
        expected_start: new Date('2026-11-20T20:00:00Z').toISOString(),
        location: 'Av. Paulista, 1000',
        capacity: 500,
        responsible: ['João Admin'],
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  test('T-events-1: Admin cria evento → 201 com event_config padrão embutido', async () => {
    const event = await createEventViaApi('Festival Teste A');
    expect(event.id).toBeTruthy();
    expect(event.tenant_id).toBe(client.id);
    expect(event.status).toBe('draft');
    expect(event.event_config).toBeTruthy();
    expect(event.event_config.event_id).toBe(event.id);
  });

  test('T-events-2: Evento criado recebe config padrão', async () => {
    const event = await createEventViaApi('Festival Teste B');
    eventId = event.id;

    const res = await api()
      .get(`/api/events/${event.id}/config`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.reentry_mode).toBe('none');
    expect(res.body.checkout_enabled).toBe(false);
    expect(res.body.qrcode_field).toBe('ticket_code');
    expect(res.body.duplicate_action).toBe('warn');
  });

  test('T-events-3: Fechar evento bloqueia edição → PUT retorna 422', async () => {
    const event = await createEventViaApi('Festival Encerrado');

    const close = await api()
      .patch(`/api/events/${event.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'closed' });
    expect(close.status).toBe(200);
    expect(close.body.status).toBe('closed');

    const edit = await api()
      .put(`/api/events/${event.id}`)
      .set(auth(adminToken))
      .send({ name: 'Nome Alterado' });

    expect(edit.status).toBe(422);
    expect(edit.body.error).toBe('event_closed');
  });

  test('T-events-4: Validador não designado não acessa evento → 403', async () => {
    const event = await createEventViaApi('Festival Restrito');

    const outsider = await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '30303030303',
      password: 'fora123',
      email_verified: true,
    });
    const outsiderToken = await loginToken(outsider.plain_cpf, 'fora123');

    const res = await api()
      .get(`/api/events/${event.id}`)
      .set(auth(outsiderToken));

    expect(res.status).toBe(403);
  });

  test('T-events-4b: Admin acessa evento do tenant mesmo sem estar na equipe', async () => {
    const event = await createEventViaApi('Festival Admin Livre');

    const res = await api()
      .get(`/api/events/${event.id}`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(event.id);
  });

  test('T-events-5: banner_url/logo_url são persistidos no PUT e retornados no GET', async () => {
    const event = await createEventViaApi('Festival Branding');

    const upd = await api()
      .put(`/api/events/${event.id}`)
      .set(auth(adminToken))
      .send({
        banner_url: 'https://cdn.exemplo.com/festival/banner.jpg',
        logo_url: 'https://cdn.exemplo.com/festival/logo.png',
      });
    expect(upd.status).toBe(200);
    expect(upd.body.banner_url).toBe('https://cdn.exemplo.com/festival/banner.jpg');
    expect(upd.body.logo_url).toBe('https://cdn.exemplo.com/festival/logo.png');

    const res = await api()
      .get(`/api/events/${event.id}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.banner_url).toBe('https://cdn.exemplo.com/festival/banner.jpg');
    expect(res.body.logo_url).toBe('https://cdn.exemplo.com/festival/logo.png');
  });
});
