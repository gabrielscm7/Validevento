const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, pool, createClient, createUser, loginToken, auth,
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

  test('T-quota-2: cota de ingressos bloqueia convite avulso (422 quota_exceeded)', async () => {
    // Tenant com max_tickets_per_event = 2
    const res = await api()
      .post('/api/clients')
      .set(auth(masterToken))
      .send({
        name: 'Cliente Cota Ingressos',
        email: 'cota-ingressos@teste.com',
        max_admins: 2,
        max_supervisors: 5,
        max_validators: 10,
        max_tickets_per_event: 2,
        max_events_active: 1,
      });
    expect(res.status).toBe(201);
    const clientId = res.body.id;

    const adminRes = await api()
      .post('/api/users')
      .set(auth(masterToken))
      .send({
        name: 'Admin Cota',
        cpf: '12345678901',
        email: 'admin-cota@teste.com',
        role: 'admin',
        tenant_id: clientId,
      });
    expect(adminRes.status).toBe(201);

    const loginRes = await api()
      .post('/api/auth/login')
      .send({ cpf: '12345678901', password: 'senha123' });
    // Usuário criado pelo master nasce sem senha (ativação pendente) — ativar direto no banco
    expect(loginRes.status).toBe(403);

    const activate = await helpers.pool.query(
      `UPDATE users SET email_verified = true,
        password_hash = $1,
        email_token = NULL, email_token_exp = NULL
       WHERE id = $2 RETURNING id`,
      [require('bcryptjs').hashSync('admin123', 4), adminRes.body.id]
    );
    expect(activate.rowCount).toBe(1);

    const token = await loginToken('12345678901', 'admin123');

    const eventRes = await api()
      .post('/api/events')
      .set(auth(token))
      .send({
        name: 'Evento Cota Ingressos',
        date: new Date('2026-12-15T18:00:00Z').toISOString(),
        location: 'Local Cota',
        capacity: 10,
        responsible: ['Admin Cota'],
      });
    expect(eventRes.status).toBe(201);
    const eventId = eventRes.body.id;

    // Importa 2 ingressos (atinge a cota)
    const csv = [
      `codigo,nome`,
      `${crypto.randomUUID()},Pessoa Um`,
      `${crypto.randomUUID()},Pessoa Dois`,
    ].join('\n') + '\n';

    const importRes = await api()
      .post('/api/import/csv')
      .set(auth(token))
      .field('event_id', eventId)
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'ingressos.csv',
        contentType: 'text/csv',
      });
    expect(importRes.status).toBe(200);
    expect(importRes.body.inserted).toBe(2);

    // Convite avulso deve estourar a cota
    const invite = await api()
      .post(`/api/events/${eventId}/invitations`)
      .set(auth(token))
      .send({ display_name: 'Convidado Excedente' });

    expect(invite.status).toBe(422);
    expect(invite.body.error).toBe('quota_exceeded');
  });
});
