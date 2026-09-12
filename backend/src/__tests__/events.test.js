const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, createEvent, loginToken, auth,
} = helpers;

describe('Gestão de eventos (Fase 2)', () => {
  let client;
  let adminToken;
  let adminId;
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
    adminId = admin.id;
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

  test('T-config-meta: PUT config tolera event_id/updated_at ecoados (não 400)', async () => {
    const event = await createEventViaApi('Festival Config Meta');

    // Clientes que ecoam o objeto do GET (com event_id/created_at/updated_at) não devem quebrar.
    const res = await api()
      .put(`/api/events/${event.id}/config`)
      .set(auth(adminToken))
      .send({
        event_id: event.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        qrcode_field: 'ticket_code',
        manual_fields: ['display_name', 'cpf'],
      });

    expect(res.status).toBe(200);
    expect(res.body.qrcode_field).toBe('ticket_code');
  });

  test('T-events-share-1: share sem equipe retorna 422 empty_team', async () => {
    const event = await createEventViaApi('Festival Share Vazio');

    const res = await api()
      .post(`/api/events/${event.id}/share`)
      .set(auth(adminToken));

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('empty_team');
  });

  test('T-events-share-2: share com equipe envia e-mail e responde sent[] (RESEND ausente → suppressed, sem erro)', async () => {
    const event = await createEventViaApi('Festival Share Equipe');

    const member = await createUser({
      tenant_id: client.id,
      role: 'validator',
      name: 'Validador Time',
      cpf: '90909090909',
      password: 'time123',
      email_verified: true,
    });

    const add = await api()
      .post(`/api/events/${event.id}/team`)
      .set(auth(adminToken))
      .send({ user_id: member.id, role_override: 'validator' });
    expect(add.status).toBe(201);

    const res = await api()
      .post(`/api/events/${event.id}/share`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.sent.length).toBe(1);
    expect(res.body.sent[0]).toBe(member.email);
    expect(res.body.total).toBe(1);
  });

  test('T-draft-1: Admin acessa evento draft', async () => {
    const event = await createEventViaApi('Evento Draft Admin');

    const res = await api()
      .get(`/api/events/${event.id}`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(event.id);
  });

  test('T-draft-2: Validador designado não acessa evento draft → 403', async () => {
    const event = await createEventViaApi('Evento Draft Restrito');

    const validator = await createUser({
      tenant_id: client.id,
      role: 'validator',
      password: 'senha123',
      email_verified: true,
    });
    const validatorToken = await loginToken(validator.plain_cpf, validator.plain_password);

    const add = await api()
      .post(`/api/events/${event.id}/team`)
      .set(auth(adminToken))
      .send({ user_id: validator.id });
    expect(add.status).toBe(201);

    const res = await api()
      .get(`/api/events/${event.id}`)
      .set(auth(validatorToken));

    expect(res.status).toBe(403);
    expect(res.body.event_status).toBe('draft');
  });

  test('T-legacy-1: Relatório de evento sem event_config retorna 200', async () => {
    const legacy = await createEvent({
      tenant_id: client.id,
      name: 'Evento Legado Sem Config',
    });

    const res = await api()
      .get(`/api/events/${legacy.id}/reports/md`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.text).toContain('# Relatório de Evento');
  });

  test('T-legacy-2: Dashboard de evento legado retorna 200 com zeros', async () => {
    const legacy = await createEvent({
      tenant_id: client.id,
      name: 'Evento Legado Dashboard',
    });

    const res = await api()
      .get(`/api/events/${legacy.id}/dashboard/summary`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.total_tickets).toBe(0);
    expect(res.body.validated).toBe(0);
    expect(res.body.duplicate_attempts).toBe(0);
  });

  test('T-events-purge-1: apaga dados operacionais e preserva evento fechado', async () => {
    const event = await createEventViaApi('Festival Para Purgar');
    const close = await api()
      .patch(`/api/events/${event.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'closed' });
    expect(close.status).toBe(200);

    await helpers.pool.query(
      `INSERT INTO batches (event_id, name, capacity) VALUES ($1, 'Lote purge', 10)`,
      [event.id]
    );
    const ticket = await helpers.createTicket({ event_id: event.id, tenant_id: client.id });
    await helpers.pool.query(
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type)
       VALUES ($1, $2, $3, 'qrcode')`,
      [ticket.id, event.id, client.id]
    );
    await helpers.pool.query(
      `INSERT INTO gates (event_id, name) VALUES ($1, 'Portão purge')`,
      [event.id]
    );
    await helpers.pool.query(
      `INSERT INTO terminals (event_id, name) VALUES ($1, 'Terminal purge')`,
      [event.id]
    );
    await helpers.pool.query(
      `INSERT INTO master_tickets (event_id, created_by) VALUES ($1, $2)`,
      [event.id, adminId]
    );
    await helpers.pool.query(
      `INSERT INTO audit_logs (tenant_id, event_id, user_id, action)
       VALUES ($1, $2, $3, 'test_event_data')`,
      [client.id, event.id, adminId]
    );

    const res = await api()
      .delete(`/api/events/${event.id}/purge`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.event_id).toBe(event.id);

    const eventRow = await helpers.pool.query('SELECT name, status FROM events WHERE id = $1', [event.id]);
    expect(eventRow.rows[0]).toMatchObject({ name: 'Festival Para Purgar', status: 'purged' });

    for (const table of ['entry_logs', 'tickets', 'batches', 'event_config', 'event_team', 'gates', 'master_tickets', 'terminals']) {
      const rows = await helpers.pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE event_id = $1`, [event.id]);
      expect(rows.rows[0].count).toBe(0);
    }
    const auditRows = await helpers.pool.query(
      `SELECT action FROM audit_logs WHERE event_id = $1`,
      [event.id]
    );
    expect(auditRows.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(['test_event_data', 'event_data_purged'])
    );
  });
});
