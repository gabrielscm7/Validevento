const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, pool, createClient, createUser, createEvent, createTicket,
  addTeamMember, loginToken, auth,
} = helpers;

describe('Segurança e isolamento multi-tenant (Plano 009)', () => {
  let client;
  let admin;
  let adminToken;
  let validator;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    admin = await createUser({
      tenant_id: client.id, role: 'admin', cpf: '70070070070', password: 'admin123', email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    validator = await createUser({
      tenant_id: client.id, role: 'validator', cpf: '80080080080', password: 'valid123', email_verified: true,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  // ── Rotas legadas removidas ──
  test('T-sec-legacy-1: /api/admin/* não existe mais (404)', async () => {
    const res = await api().get('/api/admin/reset').set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  test('T-sec-legacy-2: /api/batches não existe mais (404)', async () => {
    const res = await api().get('/api/batches').set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  // ── Escalação de privilégio ──
  test('T-sec-users-1: PUT /api/users/:id não altera role', async () => {
    const res = await api()
      .put(`/api/users/${validator.id}`)
      .set(auth(adminToken))
      .send({ role: 'admin', email_verified: true, name: 'Validador Renomeado' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('validator');

    const stored = await pool.query('SELECT role FROM users WHERE id = $1', [validator.id]);
    expect(stored.rows[0].role).toBe('validator');
  });

  test('T-sec-users-2: admin não altera outro admin (403)', async () => {
    const otherAdmin = await createUser({
      tenant_id: client.id, role: 'admin', cpf: '70170170171', password: 'admin123', email_verified: true,
    });

    const res = await api()
      .put(`/api/users/${otherAdmin.id}`)
      .set(auth(adminToken))
      .send({ name: 'Tentativa' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('profile_edit_forbidden');
  });

  // ── /api/events/active por tenant ──
  test('T-sec-active-1: /api/events/active não vaza evento de outro tenant', async () => {
    const eventA = await createEvent({ tenant_id: client.id, name: 'Evento A', status: 'active' });

    const otherClient = await createClient();
    await createEvent({ tenant_id: otherClient.id, name: 'Evento B', status: 'active' });

    const res = await api().get('/api/events/active').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(eventA.id);
    expect(res.body.name).toBe('Evento A');
  });

  // ── eventAccess em validation/sync ──
  test('T-sec-validation-1: validador fora da equipe recebe 403', async () => {
    const event = await createEvent({ tenant_id: client.id, status: 'active' });

    const token = await loginToken(validator.plain_cpf, 'valid123');
    const res = await api()
      .get('/api/validation/search')
      .set(auth(token))
      .query({ event_id: event.id, q: 'Alguém' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_in_event_team');
  });

  test('T-sec-validation-2: evento em draft bloqueia validador da equipe (403)', async () => {
    const event = await createEvent({ tenant_id: client.id, status: 'draft' });
    await addTeamMember(event.id, validator.id);

    const token = await loginToken(validator.plain_cpf, 'valid123');
    const res = await api()
      .get('/api/validation/search')
      .set(auth(token))
      .query({ event_id: event.id, q: 'Alguém' });

    expect(res.status).toBe(403);
    expect(res.body.event_status).toBe('draft');
  });

  test('T-sec-sync-1: sync exige event_team (403)', async () => {
    const event = await createEvent({ tenant_id: client.id, status: 'active' });

    const token = await loginToken(validator.plain_cpf, 'valid123');
    const res = await api()
      .get('/api/sync/snapshot')
      .set(auth(token))
      .query({ event_id: event.id });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_in_event_team');
  });

  // ── XSS no relatório ──
  test('T-sec-reports-1: display_name malicioso não gera HTML cru no MD', async () => {
    const event = await createEvent({ tenant_id: client.id, status: 'active', name: 'Evento XSS' });
    const ticket = await createTicket({
      event_id: event.id,
      tenant_id: client.id,
      ticket_code: crypto.randomUUID(),
      display_name: '<img src=x onerror=alert(1)>',
      status: 'active',
    });

    await pool.query(
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, is_duplicate, synced, created_at)
       VALUES ($1, $2, $3, 'qrcode', true, true, NOW())`,
      [ticket.id, event.id, client.id]
    );

    const res = await api()
      .get(`/api/events/${event.id}/reports/md`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<img');
    expect(res.text).toContain('&lt;img');
  });

  // ── Senha mínima ──
  test('T-sec-auth-1: verify-email rejeita senha fraca (422 weak_password)', async () => {
    const exp = new Date(Date.now() + 60 * 60 * 1000);
    await createUser({
      tenant_id: client.id,
      role: 'validator',
      password: null,
      email_verified: false,
      activationToken: 'token-fraco-1',
      activationExp: exp,
    });

    const res = await api()
      .post('/api/auth/verify-email')
      .send({ token: 'token-fraco-1', password: '123' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('weak_password');
  });

  test('T-sec-auth-2: reset-password rejeita senha fraca (422 weak_password)', async () => {
    const exp = new Date(Date.now() + 60 * 60 * 1000);
    await createUser({
      tenant_id: client.id,
      role: 'validator',
      email_verified: true,
      activationToken: 'token-fraco-2',
      activationExp: exp,
    });

    const res = await api()
      .post('/api/auth/reset-password')
      .send({ token: 'token-fraco-2', password: '123' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('weak_password');
  });

  // ── E-mail case-insensitive ──
  test('T-sec-auth-3: forgot-password encontra usuário com e-mail em caixa alta', async () => {
    const u = await createUser({
      tenant_id: client.id,
      role: 'supervisor',
      email: 'caixa.alta@teste.com',
      email_verified: true,
    });

    const res = await api()
      .post('/api/auth/forgot-password')
      .send({ email: 'CAIXA.ALTA@TESTE.COM' });

    expect(res.status).toBe(200);

    const stored = await pool.query('SELECT email_token FROM users WHERE id = $1', [u.id]);
    expect(stored.rows[0].email_token).toBeTruthy();
  });

  test('T-sec-auth-4: resend-verification encontra usuário com e-mail em caixa alta', async () => {
    const u = await createUser({
      tenant_id: client.id,
      role: 'supervisor',
      email: 'reenvio.caixa@teste.com',
      password: null,
      email_verified: false,
    });

    const res = await api()
      .post('/api/auth/resend-verification')
      .send({ email: 'REENVIO.CAIXA@TESTE.COM' });

    expect(res.status).toBe(200);

    const stored = await pool.query('SELECT email_token FROM users WHERE id = $1', [u.id]);
    expect(stored.rows[0].email_token).toBeTruthy();
  });
});
