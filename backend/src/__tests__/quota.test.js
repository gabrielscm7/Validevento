const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, loginToken, auth,
} = helpers;

describe('Controle de cotas (Parte F)', () => {
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

  test('T-14: admin não pode criar validador além da cota (422 quota_exceeded)', async () => {
    const client = await createClient({ max_validators: 1 });
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '99999999999',
      password: 'admin123',
      email_verified: true,
    });
    const adminToken = await loginToken(admin.plain_cpf, 'admin123');

    // 1º validador → dentro da cota (max_validators = 1)
    const primeiro = await api()
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        name: 'Validador Um',
        cpf: '77777777777',
        email: 'validador1@teste.com',
        role: 'validator',
      });
    expect(primeiro.status).toBe(201);

    // 2º validador → estoura a cota
    const segundo = await api()
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        name: 'Validador Dois',
        cpf: '88888888888',
        email: 'validador2@teste.com',
        role: 'validator',
      });

    expect(segundo.status).toBe(422);
    expect(segundo.body.error).toBe('quota_exceeded');
    expect(segundo.body.resource).toBe('validators');
    expect(segundo.body.used).toBe(1);
    expect(segundo.body.max).toBe(1);
  });

  test('T-14b: master cria cliente sem restrição de cotas', async () => {
    const res = await api()
      .post('/api/clients')
      .set(auth(masterToken))
      .send({
        name: 'Cliente Master Livre',
        email: 'livre@teste.com',
        max_admins: 50,
        max_supervisors: 100,
        max_validators: 500,
        max_tickets_per_event: 99999,
        max_events_active: 20,
      });

    expect(res.status).toBe(201);
    expect(res.body.max_validators).toBe(500);
    expect(res.body.max_tickets_per_event).toBe(99999);
  });
});
