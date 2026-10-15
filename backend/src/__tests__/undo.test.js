const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, createClient, createUser, createTicket, addTeamMember,
  loginToken, auth,
} = helpers;

describe('Desfazer validação (undo)', () => {
  let client;
  let adminToken;
  let validatorToken;
  let validatorId;
  let eventId;

  async function createEventViaApi() {
    const res = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name: 'Evento Undo',
        date: new Date('2026-12-01T18:00:00Z').toISOString(),
        location: 'Arena',
        capacity: 1000,
        responsible: ['Admin'],
      });
    expect(res.status).toBe(201);

    const activate = await api()
      .patch(`/api/events/${res.body.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'active' });
    expect(activate.status).toBe(200);
    await addTeamMember(res.body.id, validatorId);

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
      display_name: 'Participante Undo',
      status: 'active',
    });
  }

  function validate(ticketCode) {
    return api()
      .post('/api/validation/qrcode')
      .set(auth(validatorToken))
      .send({ ticket_code: ticketCode, event_id: eventId });
  }

  function undo(ticketCode) {
    return api()
      .post('/api/validation/undo')
      .set(auth(validatorToken))
      .send({ ticket_code: ticketCode, event_id: eventId });
  }

  async function ticketStatus(ticketCode) {
    const res = await helpers.pool.query(
      'SELECT status, validated_at FROM tickets WHERE LOWER(ticket_code) = LOWER($1)',
      [ticketCode]
    );
    return res.rows[0];
  }

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id,
      role: 'admin',
      cpf: '90909090909',
      password: 'admin123',
      email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    const validator = await createUser({
      tenant_id: client.id,
      role: 'validator',
      cpf: '91919191919',
      password: 'valid123',
      email_verified: true,
    });
    validatorId = validator.id;
    validatorToken = await loginToken(validator.plain_cpf, 'valid123');

    const event = await createEventViaApi();
    eventId = event.id;
  });

  afterAll(async () => {
    await helpers.pool.end();
  });

  test('T-undo-1: desfazer a primeira entrada volta o ingresso para active', async () => {
    await updateConfig({ reentry_mode: 'none' });
    const ticket = await newActiveTicket();

    const first = await validate(ticket.ticket_code);
    expect(first.body.status).toBe('authorized');
    expect((await ticketStatus(ticket.ticket_code)).status).toBe('validated');

    const undone = await undo(ticket.ticket_code);
    expect(undone.status).toBe(200);
    expect(undone.body.status).toBe('undone');
    expect(undone.body.reverted_to_active).toBe(true);

    const after = await ticketStatus(ticket.ticket_code);
    expect(after.status).toBe('active');
    expect(after.validated_at).toBeNull();

    // Após desfazer, uma nova validação deve ser autorizada.
    const again = await validate(ticket.ticket_code);
    expect(again.body.status).toBe('authorized');
  });

  test('T-undo-2: desfazer sem validação prévia retorna 422 nothing_to_undo', async () => {
    await updateConfig({ reentry_mode: 'none' });
    const ticket = await newActiveTicket();

    const res = await undo(ticket.ticket_code);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('nothing_to_undo');
  });

  test('T-undo-3: desfazer duas vezes retorna 422 na segunda', async () => {
    await updateConfig({ reentry_mode: 'none' });
    const ticket = await newActiveTicket();

    await validate(ticket.ticket_code);
    const first = await undo(ticket.ticket_code);
    expect(first.status).toBe(200);

    const second = await undo(ticket.ticket_code);
    expect(second.status).toBe(422);
    expect(second.body.error).toBe('nothing_to_undo');
  });

  test('T-undo-4: desfazer uma reentrada mantém o ingresso validado', async () => {
    await updateConfig({ reentry_mode: 'free' });
    const ticket = await newActiveTicket();

    expect((await validate(ticket.ticket_code)).body.status).toBe('authorized');
    const second = await validate(ticket.ticket_code);
    expect(second.body.status).toBe('authorized');
    expect(second.body.reentry).toBe(true);

    const undone = await undo(ticket.ticket_code);
    expect(undone.status).toBe(200);
    expect(undone.body.reverted_to_active).toBe(false);

    // Ainda validado (primeira entrada permanece).
    expect((await ticketStatus(ticket.ticket_code)).status).toBe('validated');
  });

  test('T-undo-5: ingresso inexistente retorna 404 not_found', async () => {
    await updateConfig({ reentry_mode: 'none' });
    const res = await undo(crypto.randomUUID());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  test('T-undo-6: desfazer após checkout retorna 422 already_checked_out', async () => {
    await updateConfig({ reentry_mode: 'none', checkout_enabled: true });
    const ticket = await newActiveTicket();

    await validate(ticket.ticket_code);
    const checkout = await api()
      .post('/api/validation/checkout')
      .set(auth(validatorToken))
      .send({ ticket_code: ticket.ticket_code, event_id: eventId });
    expect(checkout.status).toBe(200);

    const res = await undo(ticket.ticket_code);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('already_checked_out');
  });
});
