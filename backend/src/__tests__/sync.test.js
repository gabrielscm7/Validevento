const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, pool, createClient, createUser, createTicket, loginToken, auth,
} = helpers;

const syncService = require('../modules/sync/sync.service');

describe('Sync offline (Fase 3)', () => {
  let client;
  let adminToken;
  let validatorToken;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id, role: 'admin', cpf: '11100011101', password: 'admin123', email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    const validator = await createUser({
      tenant_id: client.id, role: 'validator', cpf: '22200022202', password: 'valid123', email_verified: true,
    });
    validatorToken = await loginToken(validator.plain_cpf, 'valid123');
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeEvent(name) {
    const res = await api()
      .post('/api/events')
      .set(auth(adminToken))
      .send({
        name,
        date: new Date('2026-12-15T18:00:00Z').toISOString(),
        location: 'Local de Teste',
        capacity: 1000,
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

  test('T-sync-1: Snapshot retorna todos os tickets na primeira sync', async () => {
    const event = await makeEvent('Evento Sync-1');
    await newTicket(event.id);
    await newTicket(event.id);
    await newTicket(event.id);

    // Habilita e cria o ingresso master
    const cfg = await api()
      .put(`/api/events/${event.id}/config`)
      .set(auth(adminToken))
      .send({ master_ticket_enabled: true });
    expect(cfg.status).toBe(200);

    const mt = await api()
      .post(`/api/events/${event.id}/master-ticket`)
      .set(auth(adminToken))
      .send({ max_uses: 10 });
    expect(mt.status).toBe(201);

    const res = await api()
      .get('/api/sync/snapshot')
      .set(auth(validatorToken))
      .query({ event_id: event.id });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.tickets).toHaveLength(3);
    expect(res.body.event_config).toBeTruthy();
    expect(res.body.event_config.master_ticket_enabled).toBe(true);
    expect(res.body.master_ticket).toBeTruthy();
    expect(res.body.master_ticket.active).toBe(true);
    expect(res.body.master_ticket.max_uses).toBe(10);
    expect(res.body.last_sync_at).toBeTruthy();
  });

  test('T-sync-2: Snapshot incremental retorna apenas alterados', async () => {
    const event = await makeEvent('Evento Sync-2');
    const tickets = [];
    for (let i = 0; i < 10; i += 1) tickets.push(await newTicket(event.id));

    // Sem since → todos
    const full = await api()
      .get('/api/sync/snapshot')
      .set(auth(validatorToken))
      .query({ event_id: event.id });
    expect(full.body.total).toBe(10);

    // Captura o ponto de referência e altera 3 tickets depois
    const baseline = new Date();
    const changed = tickets.slice(0, 3);
    for (const t of changed) {
      await pool.query(
        `UPDATE tickets SET status = 'blocked', updated_at = NOW() WHERE id = $1`,
        [t.id]
      );
    }

    const inc = await api()
      .get('/api/sync/snapshot')
      .set(auth(validatorToken))
      .query({ event_id: event.id, since: baseline.toISOString() });

    expect(inc.status).toBe(200);
    expect(inc.body.total).toBe(3);
    const codes = inc.body.tickets.map((t) => t.ticket_code);
    expect(codes).toEqual(expect.arrayContaining(changed.map((t) => t.ticket_code)));
  });

  test('T-sync-3: Sync de logs offline persiste corretamente', async () => {
    const event = await makeEvent('Evento Sync-3');
    const tickets = [];
    for (let i = 0; i < 5; i += 1) tickets.push(await newTicket(event.id));

    const now = new Date().toISOString();
    const logs = tickets.map((t, i) => ({
      local_id: `local-${i}`,
      ticket_code: t.ticket_code,
      entry_type: 'qrcode',
      created_at: now,
    }));

    const res = await api()
      .post('/api/sync/logs')
      .set(auth(validatorToken))
      .send({ event_id: event.id, terminal_id: crypto.randomUUID(), logs });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(5);
    expect(res.body.ignored).toBe(0);
    expect(res.body.errors).toHaveLength(0);

    const summary = await api()
      .get(`/api/events/${event.id}/dashboard/summary`)
      .set(auth(adminToken));
    expect(summary.status).toBe(200);
    expect(summary.body.validated).toBe(5);
    expect(summary.body.active).toBe(0);
  });

  test('T-sync-4: Idempotência — log duplicado é ignorado', async () => {
    const event = await makeEvent('Evento Sync-4');
    const ticket = await newTicket(event.id);
    const createdAt = new Date().toISOString();

    const payload = {
      event_id: event.id,
      terminal_id: crypto.randomUUID(),
      logs: [{ local_id: 'dup-1', ticket_code: ticket.ticket_code, entry_type: 'qrcode', created_at: createdAt }],
    };

    const first = await api().post('/api/sync/logs').set(auth(validatorToken)).send(payload);
    expect(first.status).toBe(200);
    expect(first.body.processed).toBe(1);
    expect(first.body.ignored).toBe(0);

    const second = await api().post('/api/sync/logs').set(auth(validatorToken)).send(payload);
    expect(second.status).toBe(200);
    expect(second.body.processed).toBe(0);
    expect(second.body.ignored).toBe(1);

    const logs = await pool.query(
      'SELECT COUNT(*)::int AS c FROM entry_logs WHERE ticket_id = $1',
      [ticket.id]
    );
    expect(logs.rows[0].c).toBe(1);
  });

  test('T-sync-5: Heartbeat cria terminal se não existir', async () => {
    const event = await makeEvent('Evento Sync-5');
    const terminalId = crypto.randomUUID();

    const res = await api()
      .post('/api/sync/heartbeat')
      .set(auth(validatorToken))
      .send({ event_id: event.id, terminal_id: terminalId, name: 'Terminal Portaria' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.terminal_id).toBe(terminalId);

    const terminals = await api()
      .get(`/api/events/${event.id}/dashboard/terminals`)
      .set(auth(adminToken));

    expect(terminals.status).toBe(200);
    const terminal = terminals.body.find((t) => t.id === terminalId);
    expect(terminal).toBeTruthy();
    expect(terminal.online).toBe(true);
  });

  test('T-sync-6: Terminal marcado offline após 3 minutos', async () => {
    const event = await makeEvent('Evento Sync-6');
    const terminalId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO terminals (id, event_id, name, last_seen_at, last_sync_at, online)
       VALUES ($1, $2, 'Terminal Antigo', NOW() - interval '4 minutes', NOW() - interval '4 minutes', true)`,
      [terminalId, event.id]
    );

    const affected = await syncService.markOfflineTerminals();
    expect(affected).toBeGreaterThanOrEqual(1);

    const row = await pool.query(
      'SELECT online FROM terminals WHERE id = $1',
      [terminalId]
    );
    expect(row.rows[0].online).toBe(false);
  });
});
