const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, pool, createClient, createUser, createTicket, loginToken, auth,
} = helpers;

describe('Dashboard v2 (Fase 3)', () => {
  let client;
  let adminToken;
  let validatorToken;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id, role: 'admin', cpf: '33300033303', password: 'admin123', email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    const validator = await createUser({
      tenant_id: client.id, role: 'validator', cpf: '44400044404', password: 'valid123', email_verified: true,
    });
    validatorToken = await loginToken(validator.plain_cpf, 'valid123');
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeEvent(name, capacity = 1000) {
    const res = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name,
        date: new Date('2026-12-20T18:00:00Z').toISOString(),
        location: 'Local de Teste',
        capacity,
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function newTicket(eventId, over = {}) {
    return createTicket({
      event_id: eventId,
      tenant_id: client.id,
      ticket_code: crypto.randomUUID(),
      display_name: 'Participante Teste',
      status: 'active',
      ...over,
    });
  }

  async function validate(ticketCode, eventId) {
    return api()
      .post('/api/validation/qrcode')
      .set(auth(validatorToken))
      .send({ ticket_code: ticketCode, event_id: eventId });
  }

  async function blockTicket(eventId, ticketId) {
    const res = await api()
      .patch(`/api/events/${eventId}/tickets/${ticketId}/block`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  }

  test('T-dash-1: Summary retorna contagens corretas', async () => {
    const event = await makeEvent('Evento Dash-1', 10);
    const tickets = [];
    for (let i = 0; i < 10; i += 1) tickets.push(await newTicket(event.id));

    for (let i = 0; i < 6; i += 1) {
      const r = await validate(tickets[i].ticket_code, event.id);
      expect(r.body.status).toBe('authorized');
    }
    await blockTicket(event.id, tickets[6].id);

    const res = await api()
      .get(`/api/events/${event.id}/dashboard/summary`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.total_tickets).toBe(10);
    expect(res.body.validated).toBe(6);
    expect(res.body.blocked).toBe(1);
    expect(res.body.active).toBe(3);
    expect(res.body.occupancy_pct).toBeCloseTo(60.0, 1);
    expect(res.body.cortesia).toBe(0);
    expect(res.body.liberacao_especial).toBe(0);
    expect(res.body.master_uses).toBe(0);
    expect(res.body.duplicate_attempts).toBe(0);
  });

  test('T-dash-2: Flow agrupa por hora corretamente', async () => {
    const event = await makeEvent('Evento Dash-2');
    const ticket = await newTicket(event.id);

    const times = [
      '2026-06-01T14:20:00-03:00',
      '2026-06-01T14:45:00-03:00',
      '2026-06-01T15:10:00-03:00',
      '2026-06-01T15:55:00-03:00',
    ];
    for (const time of times) {
      await pool.query(
        `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, terminal_id, validator_id, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, 'qrcode', NULL, NULL, false, true, $4::timestamptz)`,
        [ticket.id, event.id, client.id, time]
      );
    }

    const res = await api()
      .get(`/api/events/${event.id}/dashboard/flow`)
      .set(auth(adminToken))
      .query({ date: '2026-06-01' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ hour: '14:00', checkins: 2, checkouts: 0 });
    expect(res.body[1]).toMatchObject({ hour: '15:00', checkins: 2, checkouts: 0 });
  });

  test('T-dash-3: Live-feed retorna os mais recentes primeiro', async () => {
    const event = await makeEvent('Evento Dash-3');
    const ticket = await newTicket(event.id);

    const base = Date.parse('2026-06-02T10:00:00-03:00');
    for (let i = 0; i < 7; i += 1) {
      await pool.query(
        `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, 'qrcode', false, true, to_timestamp($4 / 1000.0))`,
        [ticket.id, event.id, client.id, base + i * 60000]
      );
    }

    const res = await api()
      .get(`/api/events/${event.id}/dashboard/live-feed`)
      .set(auth(adminToken))
      .query({ limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    const first = new Date(res.body[0].created_at).getTime();
    const last = new Date(res.body[4].created_at).getTime();
    expect(first).toBeGreaterThan(last);
  });

  test('T-dash-4: Alerts lista apenas ocorrências relevantes', async () => {
    const event = await makeEvent('Evento Dash-4');
    const ticketA = await newTicket(event.id, { display_name: 'Duplicado' });
    const ticketB = await newTicket(event.id, { display_name: 'Normal' });

    await pool.query(
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, is_duplicate, synced, created_at)
       VALUES ($1, $2, $3, 'qrcode', true, true, NOW())`,
      [ticketA.id, event.id, client.id]
    );

    await pool.query(
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, beneficiary, is_duplicate, synced, created_at)
       VALUES (NULL, $1, $2, 'master', 'Convidado Master', false, true, NOW())`,
      [event.id, client.id]
    );

    const res = await api()
      .get(`/api/events/${event.id}/dashboard/alerts`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    const types = res.body.map((a) => a.type);
    expect(types).toContain('duplicate');
    expect(types).toContain('master_use');
    // Não deve vir o ingresso normal (sem ocorrência)
    expect(res.body.some((a) => a.display_name === 'Normal')).toBe(false);
  });

  test('T-dash-5: Validador não acessa dashboard', async () => {
    const event = await makeEvent('Evento Dash-5');

    const res = await api()
      .get(`/api/events/${event.id}/dashboard/summary`)
      .set(auth(validatorToken));

    expect(res.status).toBe(403);
  });
});
