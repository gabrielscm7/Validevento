const jwt = require('jsonwebtoken');
const helpers = require('./helpers');
const { api, resetDb, createClient, createUser } = helpers;

describe('Autenticação com CPF (Parte D)', () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  test('T-12: login com CPF formatado (111.222.333-44) retorna 200 + token', async () => {
    const client = await createClient();
    const user = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '11122233344',
      password: 'senha123',
      email_verified: true,
    });

    const res = await api()
      .post('/api/auth/login')
      .send({ cpf: '111.222.333-44', password: 'senha123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.id).toBe(user.id);

    const payload = jwt.decode(res.body.token);
    expect(payload.id).toBe(user.id);
    expect(payload.role).toBe('admin');
    expect(payload.tenant_id).toBe(client.id);
  });

  test('T-12b: login com CPF sem formatação resolve o mesmo usuário', async () => {
    const client = await createClient();
    const user = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '55544433322',
      password: 'senha123',
      email_verified: true,
    });

    const resFormatado = await api()
      .post('/api/auth/login')
      .send({ cpf: '555.444.333-22', password: 'senha123' });
    const resLimpo = await api()
      .post('/api/auth/login')
      .send({ cpf: '55544433322', password: 'senha123' });

    expect(resFormatado.status).toBe(200);
    expect(resLimpo.status).toBe(200);

    const p1 = jwt.decode(resFormatado.body.token);
    const p2 = jwt.decode(resLimpo.body.token);
    expect(p1.id).toBe(user.id);
    expect(p2.id).toBe(user.id);
    expect(p2.id).toBe(p1.id); // mesmo usuário
  });

  test('T-13: login sem e-mail verificado retorna 403 email_not_verified', async () => {
    const client = await createClient();
    const user = await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '99988877766',
      password: 'senha123',
      email_verified: false,
    });

    const res = await api()
      .post('/api/auth/login')
      .send({ cpf: user.plain_cpf, password: 'senha123' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('email_not_verified');
  });

  test('T-13b: login com tenant suspenso retorna 403 tenant_suspended', async () => {
    const suspendedClient = await createClient({ active: false });
    const user = await createUser({
      tenant_id: suspendedClient.id,
      role: 'validator',
      cpf: '12345678900',
      password: 'senha123',
      email_verified: true,
    });

    const res = await api()
      .post('/api/auth/login')
      .send({ cpf: user.plain_cpf, password: 'senha123' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('tenant_suspended');
  });

  test('T-email-1: verificação de e-mail com token válido retorna 200 + JWT', async () => {
    const client = await createClient();
    const exp = new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h
    const user = await createUser({
      tenant_id: client.id,
      role: 'supervisor',
      cpf: '12312312300',
      password: null, // ainda sem senha
      email_verified: false,
      activationToken: 'token-ativo-valido-fase1',
      activationExp: exp,
    });

    const res = await api()
      .post('/api/auth/verify-email')
      .send({ token: 'token-ativo-valido-fase1', password: 'MinhaNovaSenha1' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    // Após ativar, o login funciona com a senha definida
    const loginRes = await api()
      .post('/api/auth/login')
      .send({ cpf: user.plain_cpf, password: 'MinhaNovaSenha1' });
    expect(loginRes.status).toBe(200);
  });

  test('T-email-2: verificação com token expirado retorna 400', async () => {
    const client = await createClient();
    const past = new Date(Date.now() - 60 * 60 * 1000); // -1h (expirado)
    await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '98765432100',
      password: null,
      email_verified: false,
      activationToken: 'token-expirado-fase1',
      activationExp: past,
    });

    const res = await api()
      .post('/api/auth/verify-email')
      .send({ token: 'token-expirado-fase1', password: 'QualquerSenha1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_or_expired_token');
  });

  test('T-email-3: resend-verification gera novo token e ativação passa a funcionar', async () => {
    const client = await createClient();
    await createUser({
      tenant_id: client.id,
      role: 'supervisor',
      cpf: '14725836900',
      email: 'resend-valid@teste.com',
      password: null,
      email_verified: false,
    });

    const res = await api()
      .post('/api/auth/resend-verification')
      .send({ email: 'RESEND-VALID@teste.com' }); // caixa alta: deve normalizar
    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();

    const tokenRes = await helpers.pool.query(
      `SELECT email_token, email_token_exp FROM users WHERE email = $1`,
      ['resend-valid@teste.com']
    );
    const newToken = tokenRes.rows[0].email_token;
    expect(newToken).toBeTruthy();
    expect(new Date(tokenRes.rows[0].email_token_exp).getTime()).toBeGreaterThan(Date.now());

    // O novo token ativa a conta
    const activate = await api()
      .post('/api/auth/verify-email')
      .send({ token: newToken, password: 'NovaSenhaResend1' });
    expect(activate.status).toBe(200);
  });

  test('T-email-4: resend-verification de e-mail já verificado não gera token', async () => {
    const client = await createClient();
    await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '15935725800',
      email: 'ja-verificado@teste.com',
      password: 'senha123',
      email_verified: true,
    });

    const res = await api()
      .post('/api/auth/resend-verification')
      .send({ email: 'ja-verificado@teste.com' });
    expect(res.status).toBe(200);

    const tokenRes = await helpers.pool.query(
      `SELECT email_token FROM users WHERE email = $1`,
      ['ja-verificado@teste.com']
    );
    expect(tokenRes.rows[0].email_token).toBeNull();
  });
});
