const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, createEvent, createTicket,
  loginToken, auth,
} = helpers;

describe('Módulo de Clientes (master only) — Parte C', () => {
  let masterToken;

  beforeAll(async () => {
    await resetDb();

    const master = await createUser({
      role: 'master',
      cpf: '00000000000',
      password: 'master123',
      email_verified: true,
    });
    masterToken = await loginToken(master.plain_cpf, 'master123');
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  test('T-clients-1: master cria cliente → 201 com o cliente criado', async () => {
    const res = await api()
      .post('/api/clients')
      .set(auth(masterToken))
      .send({
        name: 'Eventos Paulista LTDA',
        email: 'contato@paulistaeventos.com',
        cnpj: '12.345.678/0001-90',
        max_validators: 7,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe('Eventos Paulista LTDA');
    expect(res.body.max_validators).toBe(7);
    expect(res.body.max_admins).toBe(2); // default aplicado
  });

  test('T-clients-2: admin tenta acessar /api/clients → 403', async () => {
    const client = await createClient();
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '11111111111',
      password: 'admin123',
      email_verified: true,
    });
    const adminToken = await loginToken(admin.plain_cpf, 'admin123');

    const res = await api().get('/api/clients').set(auth(adminToken));
    expect(res.status).toBe(403);
  });

  test('T-clients-3: suspensão bloqueia login do usuário do tenant', async () => {
    const client = await createClient();
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '22222222222',
      password: 'admin123',
      email_verified: true,
    });

    // Antes da suspensão o login funciona
    const antes = await api()
      .post('/api/auth/login')
      .send({ cpf: admin.plain_cpf, password: 'admin123' });
    expect(antes.status).toBe(200);

    // Master suspende o cliente
    const suspendRes = await api()
      .patch(`/api/clients/${client.id}/suspend`)
      .set(auth(masterToken));
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.active).toBe(false);

    // Login passa a retornar tenant_suspended
    const depois = await api()
      .post('/api/auth/login')
      .send({ cpf: admin.plain_cpf, password: 'admin123' });
    expect(depois.status).toBe(403);
    expect(depois.body.error).toBe('tenant_suspended');
  });

  test('T-clients-4: consulta de uso retorna objeto com used/max por recurso', async () => {
    const client = await createClient({
      max_admins: 3,
      max_supervisors: 5,
      max_validators: 4,
      max_tickets_per_event: 1000,
      max_events_active: 2,
    });

    await createUser({ tenant_id: client.id, role: 'admin', cpf: '33333333333' });
    await createUser({ tenant_id: client.id, role: 'supervisor', cpf: '44444444444' });
    await createUser({ tenant_id: client.id, role: 'supervisor', cpf: '55555555555' });
    await createUser({ tenant_id: client.id, role: 'validator', cpf: '66666666666' });

    const event = await createEvent({ tenant_id: client.id, status: 'active' });
    await createTicket({ event_id: event.id, tenant_id: client.id });
    await createTicket({ event_id: event.id, tenant_id: client.id });

    const res = await api()
      .get(`/api/clients/${client.id}/usage`)
      .set(auth(masterToken));

    expect(res.status).toBe(200);
    const usage = res.body;

    // Estrutura esperada: { admins, supervisors, validators, tickets_this_month, events_active }
    for (const key of ['admins', 'supervisors', 'validators', 'tickets_this_month', 'events_active']) {
      expect(usage[key]).toBeDefined();
      expect(typeof usage[key].used).toBe('number');
      expect(typeof usage[key].max).toBe('number');
    }

    expect(usage.admins.used).toBe(1);
    expect(usage.supervisors.used).toBe(2);
    expect(usage.validators.used).toBe(1);
    expect(usage.tickets_this_month.used).toBe(2);
    expect(usage.events_active.used).toBe(1);
  });
});
