const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, createTicket, loginToken, auth,
} = helpers;

describe('Reentrada (Fase 2 — reentry_mode)', () => {
  let client;
  let adminToken;
  let validatorToken;
  let eventId;

  async function createEventViaApi() {
    const res = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name: 'Evento Reentrada',
        date: new Date('2026-12-01T18:00:00Z').toISOString(),
        location: 'Parque Ibirapuera',
        capacity: 1000,
        responsible: ['Admin'],
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function updateConfig(payload) {
    const res = await api()
      .put(`/api/events/${eventId}/config`)
      .set(auth(adminToken))
      .send(payload);
    expect(res.status).toBe(200);
    return res.body;
  }

  async function newActiveTicket() {
    return createTicket({
      event_id: eventId,
      tenant_id: client.id,
      ticket_code: crypto.randomUUID(),
      display_name: 'Participante Teste',
      status: 'active',
    });
  }

  async function validate(ticketCode) {
    return api()
      .post('/api/validation/qrcode')
      .set(auth(validatorToken))
      .send({ ticket_code: ticketCode, event_id: eventId });
  }

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '70707070707',
      password: 'admin123',
      email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    const validator = await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '80808080808',
      password: 'valid123',
      email_verified: true,
    });
    validatorToken = await loginToken(validator.plain_cpf, 'valid123');

    const event = await createEventViaApi();
    eventId = event.id;
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  test('T-04: reentry_mode=none bloqueia segunda entrada → duplicate', async () => {
    await updateConfig({ reentry_mode: 'none' });

    const ticket = await newActiveTicket();
    const primeira = await validate(ticket.ticket_code);
    expect(primeira.status).toBe(200);
    expect(primeira.body.status).toBe('authorized');

    const segunda = await validate(ticket.ticket_code);
    expect(segunda.status).toBe(200);
    expect(segunda.body.status).toBe('duplicate');
  });

  test('T-05: reentry_mode=free permite segunda entrada → authorized', async () => {
    await updateConfig({ reentry_mode: 'free' });

    const ticket = await newActiveTicket();
    const primeira = await validate(ticket.ticket_code);
    expect(primeira.status).toBe(200);
    expect(primeira.body.status).toBe('authorized');

    const segunda = await validate(ticket.ticket_code);
    expect(segunda.status).toBe(200);
    expect(segunda.body.status).toBe('authorized');
    expect(segunda.body.reentry).toBe(true);
  });

  test('T-06: reentry_mode=conditioned bloqueia sem checkout → duplicate', async () => {
    await updateConfig({ reentry_mode: 'conditioned' });

    const ticket = await newActiveTicket();
    const primeira = await validate(ticket.ticket_code);
    expect(primeira.body.status).toBe('authorized');

    const segunda = await validate(ticket.ticket_code);
    expect(segunda.status).toBe(200);
    expect(segunda.body.status).toBe('duplicate');
  });

  test('T-07: reentry_mode=conditioned + checkout permite reentrada → authorized reentry', async () => {
    await updateConfig({ reentry_mode: 'conditioned', checkout_enabled: true });

    const ticket = await newActiveTicket();
    const primeira = await validate(ticket.ticket_code);
    expect(primeira.body.status).toBe('authorized');

    const checkout = await api()
      .post('/api/validation/checkout')
      .set(auth(validatorToken))
      .send({ ticket_code: ticket.ticket_code, event_id: eventId });
    expect(checkout.status).toBe(200);
    expect(checkout.body.status).toBe('checkout_registered');

    const reentrada = await validate(ticket.ticket_code);
    expect(reentrada.status).toBe(200);
    expect(reentrada.body.status).toBe('authorized');
    expect(reentrada.body.reentry).toBe(true);
  });
});
