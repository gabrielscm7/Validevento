const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, loginToken, auth,
} = helpers;

describe('Configuração de evento (Fase 2)', () => {
  let client;
  let adminToken;
  let adminUser;
  let eventId;

  async function createEventViaApi() {
    const res = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name: 'Evento Config',
        date: new Date('2026-11-25T18:00:00Z').toISOString(),
        location: 'Rua Augusta, 500',
        capacity: 1000,
        responsible: ['Admin'],
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    adminUser = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '40404040404',
      password: 'admin123',
      email_verified: true,
    });
    adminToken = await loginToken(adminUser.plain_cpf, 'admin123');

    const event = await createEventViaApi();
    eventId = event.id;

    // Evento precisa estar ativo para o supervisor ativar checkout em tempo real
    const act = await api()
      .patch(`/api/events/${eventId}/status`)
      .set(auth(adminToken))
      .send({ status: 'active' });
    expect(act.status).toBe(200);
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  async function addSupervisorToTeam(supervisor) {
    const res = await api()
      .post(`/api/events/${eventId}/team`)
      .set(auth(adminToken))
      .send({ user_id: supervisor.id });
    expect(res.status).toBe(201);
  }

  test('T-config-1: Admin atualiza reentry_mode para conditioned', async () => {
    const put = await api()
      .put(`/api/events/${eventId}/config`)
      .set(auth(adminToken))
      .send({ reentry_mode: 'conditioned' });
    expect(put.status).toBe(200);

    const get = await api()
      .get(`/api/events/${eventId}/config`)
      .set(auth(adminToken));

    expect(get.status).toBe(200);
    expect(get.body.reentry_mode).toBe('conditioned');
  });

  test('T-config-2: Supervisor ativa checkout em tempo real → 200', async () => {
    const supervisor = await createUser({
      tenant_id: client.id,
      role: 'supervisor',
      cpf: '50505050505',
      password: 'super123',
      email_verified: true,
    });
    await addSupervisorToTeam(supervisor);
    const supervisorToken = await loginToken(supervisor.plain_cpf, 'super123');

    const res = await api()
      .patch(`/api/events/${eventId}/config/checkout`)
      .set(auth(supervisorToken))
      .send({ checkout_enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.checkout_enabled).toBe(true);
  });

  test('T-config-3: Validador não pode editar config → 403', async () => {
    const validator = await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '60606060606',
      password: 'valid123',
      email_verified: true,
    });
    const validatorToken = await loginToken(validator.plain_cpf, 'valid123');

    const res = await api()
      .put(`/api/events/${eventId}/config`)
      .set(auth(validatorToken))
      .send({ reentry_mode: 'free' });

    expect(res.status).toBe(403);
  });

  test('T-config-4: Config de evento fechado bloqueia checkout/reentry', async () => {
    // Cria evento próprio e fecha
    const event = await createEventViaApi();
    await api()
      .patch(`/api/events/${event.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'closed' });

    const res = await api()
      .put(`/api/events/${event.id}/config`)
      .set(auth(adminToken))
      .send({ checkout_enabled: true });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('event_closed');
  });
});
