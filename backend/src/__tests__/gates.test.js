const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, loginToken, auth, pool,
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

  test('T-gates-3: terminal pode alocar e consultar o portão aberto', async () => {
    const terminalId = require('crypto').randomUUID();
    const create = await api()
      .post(`/api/events/${eventId}/gates`)
      .set(auth(adminToken))
      .send({ name: 'Portão Alocado' });
    const gateId = create.body.id;

    await api()
      .patch(`/api/events/${eventId}/gates/${gateId}/open`)
      .set(auth(adminToken));

    const heartbeat = await api()
      .post('/api/sync/heartbeat')
      .set(auth(adminToken))
      .send({ event_id: eventId, terminal_id: terminalId, name: 'Terminal Teste' });
    expect(heartbeat.status).toBe(200);

    const assign = await api()
      .patch(`/api/events/${eventId}/terminals/${terminalId}/gate`)
      .set(auth(adminToken))
      .send({ gate_id: gateId });
    expect(assign.status).toBe(200);
    expect(assign.body.gate_id).toBe(gateId);

    const current = await api()
      .get(`/api/events/${eventId}/terminals/${terminalId}/gate`)
      .set(auth(adminToken));
    expect(current.status).toBe(200);
    expect(current.body.gate_id).toBe(gateId);
  });

  test('T-gates-4: validação registra o portão associado ao terminal', async () => {
    const crypto = require('crypto');
    const terminalId = crypto.randomUUID();
    const ticketCode = crypto.randomUUID();
    const gate = await api()
      .post(`/api/events/${eventId}/gates`)
      .set(auth(adminToken))
      .send({ name: 'Portão do Log' });
    const gateId = gate.body.id;
    await api().patch(`/api/events/${eventId}/gates/${gateId}/open`).set(auth(adminToken));
    await api().post('/api/sync/heartbeat').set(auth(adminToken)).send({
      event_id: eventId, terminal_id: terminalId, name: 'Terminal do Log',
    });
    await api().patch(`/api/events/${eventId}/terminals/${terminalId}/gate`)
      .set(auth(adminToken)).send({ gate_id: gateId });
    await pool.query(
      `INSERT INTO tickets (event_id, tenant_id, ticket_code, batch, display_name, status)
       SELECT $1, tenant_id, $2, 'TESTE', 'Ticket Portão', 'active' FROM events WHERE id = $1`,
      [eventId, ticketCode]
    );

    const validation = await api()
      .post('/api/validation/qrcode')
      .set(auth(adminToken))
      .send({ event_id: eventId, ticket_code: ticketCode, terminal_id: terminalId });
    expect(validation.status).toBe(200);
    expect(validation.body.status).toBe('authorized');

    const log = await pool.query(
      'SELECT gate_id FROM entry_logs WHERE event_id = $1 AND ticket_id = (SELECT id FROM tickets WHERE ticket_code = $2)',
      [eventId, ticketCode]
    );
    expect(log.rows[0].gate_id).toBe(gateId);
  });
});
