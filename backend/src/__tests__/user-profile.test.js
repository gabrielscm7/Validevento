const helpers = require('./helpers');
const {
  api, resetDb, pool, createClient, createUser, loginToken, auth,
} = helpers;

describe('Edição de cadastro de Supervisor e Validador pelo Admin', () => {
  let client;
  let adminToken;
  let supervisor;
  let validator;
  let otherTenantAdminToken;
  let otherTenantValidator;
  let admin;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '11111111111',
      email: 'admin@perfil.test',
    });
    adminToken = await loginToken(admin.plain_cpf, admin.plain_password);

    supervisor = await createUser({
      tenant_id: client.id,
      role: 'supervisor',
      cpf: '22222222222',
      email: 'supervisor@perfil.test',
    });
    validator = await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '33333333333',
      email: 'validator@perfil.test',
    });

    const otherClient = await createClient();
    const otherAdmin = await createUser({
      tenant_id: otherClient.id,
      role: 'admin',
      cpf: '44444444444',
      email: 'other-admin@perfil.test',
    });
    otherTenantAdminToken = await loginToken(otherAdmin.plain_cpf, otherAdmin.plain_password);
    otherTenantValidator = await createUser({
      tenant_id: otherClient.id,
      role: 'validator',
      cpf: '55555555555',
      email: 'other-validator@perfil.test',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  test('Admin edita nome e e-mail de Supervisor do próprio tenant', async () => {
    const res = await api()
      .patch(`/api/users/${supervisor.id}/profile`)
      .set(auth(adminToken))
      .send({ name: 'Supervisor Atualizado', email: 'supervisor.novo@perfil.test' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Supervisor Atualizado');
    expect(res.body.email).toBe('supervisor.novo@perfil.test');
    expect(res.body.email_verified).toBe(false);
    expect(res.body.password_hash).toBeUndefined();

    const stored = await pool.query(
      'SELECT email_token, email_token_exp FROM users WHERE id = $1',
      [supervisor.id]
    );
    expect(stored.rows[0].email_token).toBeTruthy();
    expect(new Date(stored.rows[0].email_token_exp).getTime()).toBeGreaterThan(Date.now());
  });

  test('Admin edita Validador sem alterar CPF, senha ou perfil', async () => {
    const before = await pool.query(
      'SELECT cpf_lookup_hash, password_hash, role FROM users WHERE id = $1',
      [validator.id]
    );

    const res = await api()
      .patch(`/api/users/${validator.id}/profile`)
      .set(auth(adminToken))
      .send({
        name: 'Validador Atualizado',
        email: 'validator.novo@perfil.test',
        role: 'admin',
        active: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('validator');
    expect(res.body.active).toBe(true);

    const after = await pool.query(
      'SELECT cpf_lookup_hash, password_hash, role, active FROM users WHERE id = $1',
      [validator.id]
    );
    expect(after.rows[0].cpf_lookup_hash).toBe(before.rows[0].cpf_lookup_hash);
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
    expect(after.rows[0].role).toBe('validator');
    expect(after.rows[0].active).toBe(true);
  });

  test('Admin não edita usuário de outro tenant', async () => {
    const res = await api()
      .patch(`/api/users/${otherTenantValidator.id}/profile`)
      .set(auth(adminToken))
      .send({ name: 'Tentativa indevida' });

    expect(res.status).toBe(404);
  });

  test('Admin não edita outro Admin', async () => {
    const res = await api()
      .patch(`/api/users/${admin.id}/profile`)
      .set(auth(adminToken))
      .send({ name: 'Admin alterado' });

    expect(res.status).toBe(403);
  });

  test('Admin não edita usuário sem autenticação', async () => {
    const res = await api()
      .patch(`/api/users/${supervisor.id}/profile`)
      .send({ name: 'Sem token' });

    expect(res.status).toBe(401);
  });

  test('Admin de outro tenant não edita usuário externo', async () => {
    const res = await api()
      .patch(`/api/users/${validator.id}/profile`)
      .set(auth(otherTenantAdminToken))
      .send({ name: 'Tenant errado' });

    expect(res.status).toBe(404);
  });

  test('Rejeita e-mail duplicado sem alterar o usuário', async () => {
    const res = await api()
      .patch(`/api/users/${validator.id}/profile`)
      .set(auth(adminToken))
      .send({ email: 'admin@perfil.test' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_already_exists');
  });
});
