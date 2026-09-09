const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, createEvent, createTicket,
  loginToken, auth,
} = helpers;

describe('Validação de QRCode (Parte F / BUG-01)', () => {
  let client;
  let validatorToken;
  let eventId;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const validator = await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '12121212121',
      password: 'validador123',
      email_verified: true,
    });
    const event = await createEvent({ tenant_id: client.id });

    validatorToken = await loginToken(validator.plain_cpf, 'validador123');
    eventId = event.id;
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  async function validate(ticketCode) {
    return api()
      .post('/api/validation/qrcode')
      .set(auth(validatorToken))
      .send({ ticket_code: ticketCode, event_id: eventId });
  }

  test('T-02: validar QRCode de ingresso ativo retorna authorized', async () => {
    const ticket = await createTicket({
      event_id: eventId,
      tenant_id: client.id,
      ticket_code: crypto.randomUUID(),
      display_name: 'Carlos S.',
      status: 'active',
    });

    const res = await validate(ticket.ticket_code);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('authorized');
    expect(res.body.ticket_code).toBe(ticket.ticket_code);
  });

  test('T-03: segunda validação do mesmo QRCode retorna duplicate (BUG-01)', async () => {
    const ticket = await createTicket({
      event_id: eventId,
      tenant_id: client.id,
      ticket_code: crypto.randomUUID(),
      display_name: 'Maria Santos',
      status: 'active',
    });

    const primeira = await validate(ticket.ticket_code);
    expect(primeira.status).toBe(200);
    expect(primeira.body.status).toBe('authorized');

    const segunda = await validate(ticket.ticket_code);
    expect(segunda.status).toBe(200);
    expect(segunda.body.status).toBe('duplicate');
    expect(segunda.body.first_entry_at).toBeTruthy();
    // Garantia do BUG-01: a segunda chamada NÃO pode retornar authorized
    expect(segunda.body.status).not.toBe('authorized');
  });

  test('T-11: ingresso com status blocked retorna blocked', async () => {
    const ticket = await createTicket({
      event_id: eventId,
      tenant_id: client.id,
      ticket_code: crypto.randomUUID(),
      display_name: 'Fernanda Souza',
      status: 'blocked',
    });

    const res = await validate(ticket.ticket_code);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('blocked');
    expect(res.body.ticket_code).toBe(ticket.ticket_code);
  });

  test('T-uuid-inv-1: search com event_id não-UUID retorna 400 (não 500)', async () => {
    const res = await api()
      .get('/api/validation/search')
      .set(auth(validatorToken))
      .query({ event_id: 'Evento_Teste', q: 'Ana' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_event_id');
  });

  test('T-uuid-inv-2: qrcode com event_id não-UUID retorna 400 (não 500)', async () => {
    const res = await api()
      .post('/api/validation/qrcode')
      .set(auth(validatorToken))
      .send({ ticket_code: crypto.randomUUID(), event_id: 'Evento_Teste' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_event_id');
  });

  test('T-search-min: Busca com < 3 caracteres retorna 400', async () => {
    const res = await api()
      .get('/api/validation/search')
      .set(auth(validatorToken))
      .query({ event_id: eventId, q: 'ab' });

    expect(res.status).toBe(400);
  });

  test('T-search-limit: Busca com string > 100 chars não quebra', async () => {
    const longQuery = 'x'.repeat(200);
    const res = await api()
      .get('/api/validation/search')
      .set(auth(validatorToken))
      .query({ event_id: eventId, q: longQuery });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});
