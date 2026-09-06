const crypto = require('crypto');
const helpers = require('./helpers');
const {
  api, resetDb, pool, createClient, createUser, createTicket, loginToken, auth,
} = helpers;

const CSV_HEADER = 'ticket_code,display_name,batch,origin,status,entry_type,is_duplicate,validator_name,terminal_name,entry_at,checkout_at';

describe('Relatórios (Fase 3)', () => {
  let client;
  let adminToken;

  beforeAll(async () => {
    await resetDb();

    client = await createClient();
    const admin = await createUser({
      tenant_id: client.id, role: 'admin', cpf: '55500055505', password: 'admin123', email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');
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
        date: new Date('2026-12-25T18:00:00Z').toISOString(),
        location: 'Parque Central',
        capacity,
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function newTicket(eventId) {
    return createTicket({
      event_id: eventId,
      tenant_id: client.id,
      ticket_code: crypto.randomUUID(),
      display_name: 'Participante Relatório',
      status: 'active',
    });
  }

  async function createAndOpenGate(eventId, name = 'Portão Principal') {
    const g = await api()
      .post(`/api/events/${eventId}/gates`)
      .set(auth(adminToken))
      .send({ name });
    expect(g.status).toBe(201);
    const gateId = g.body.id;
    const open = await api()
      .patch(`/api/events/${eventId}/gates/${gateId}/open`)
      .set(auth(adminToken));
    expect(open.status).toBe(200);
    return gateId;
  }

  test('T-15-md: Relatório MD é gerado corretamente', async () => {
    const event = await makeEvent('Festa Junina SESI');
    const ticket = await newTicket(event.id);
    await createAndOpenGate(event.id);

    // validação + uma duplicata para popular ocorrências
    const val = await api()
      .post('/api/validation/qrcode')
      .set(auth(adminToken))
      .send({ ticket_code: ticket.ticket_code, event_id: event.id });
    expect(val.body.status).toBe('authorized');

    await pool.query(
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, is_duplicate, synced, created_at)
       VALUES ($1, $2, $3, 'qrcode', true, true, NOW())`,
      [ticket.id, event.id, client.id]
    );

    const start = Date.now();
    const res = await api()
      .get(`/api/events/${event.id}/reports/md`)
      .set(auth(adminToken));
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');

    const body = res.text;
    expect(body).toContain('# Relatório de Evento — Festa Junina SESI');
    expect(body).toContain('## Resumo Geral');
    expect(body).toContain('## Portões');
    expect(body).toContain('## Fluxo de Entrada por Hora');
    expect(body).toContain('## Ingressos por Lote');
    expect(body).toContain('## Ocorrências');
    expect(body).toContain('## Log de Auditoria');
    expect(elapsed).toBeLessThan(5000);
  });

  test('T-15-csv: Relatório CSV tem cabeçalho correto', async () => {
    const event = await makeEvent('Evento CSV');
    const ticket = await newTicket(event.id);

    await pool.query(
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, is_duplicate, synced, created_at)
       VALUES ($1, $2, $3, 'qrcode', false, true, NOW())`,
      [ticket.id, event.id, client.id]
    );

    const res = await api()
      .get(`/api/events/${event.id}/reports/csv`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8
    const lines = text.slice(1).split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(text).toContain(ticket.ticket_code);
  });

  test('T-15-speed: Relatório gerado em menos de 5 segundos (1000 logs)', async () => {
    const event = await makeEvent('Evento Grande', 3000);

    for (let i = 0; i < 100; i += 1) {
      await newTicket(event.id);
    }

    // 100 tickets × 10 logs = 1000 entry_logs
    await pool.query(
      `INSERT INTO entry_logs (ticket_id, event_id, tenant_id, entry_type, is_duplicate, synced, created_at)
       SELECT t.id, $1, $2, 'qrcode', false, true,
              NOW() - interval '10 hours' + (g || ' minutes')::interval
       FROM tickets t
       CROSS JOIN generate_series(0, 9) g
       WHERE t.event_id = $1 AND t.tenant_id = $2`,
      [event.id, client.id]
    );

    const count = await pool.query(
      'SELECT COUNT(*)::int AS c FROM entry_logs WHERE event_id = $1',
      [event.id]
    );
    expect(count.rows[0].c).toBe(1000);

    const start = Date.now();
    const res = await api()
      .get(`/api/events/${event.id}/reports/md`)
      .set(auth(adminToken));
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
  });

  test('T-audit-1: Log de auditoria registra ações corretamente', async () => {
    const event = await makeEvent('Evento Auditoria');

    const cfg = await api()
      .put(`/api/events/${event.id}/config`)
      .set(auth(adminToken))
      .send({ duplicate_action: 'block' });
    expect(cfg.status).toBe(200);

    await createAndOpenGate(event.id, 'Portão A');

    const res = await api()
      .get(`/api/events/${event.id}/reports/audit`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    const actions = res.body.map((a) => a.action);
    expect(actions).toContain('event_created');
    expect(actions).toContain('event_config_updated');
    expect(actions).toContain('gate_opened');
  });

  test('T-audit-2: Log de auditoria é imutável (DELETE bloqueado)', async () => {
    // Garante ao menos uma linha de auditoria
    const event = await makeEvent('Evento Imutável');
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, event_id, user_id, action, entity_type, entity_id)
       VALUES ($1, $2, NULL, 'test_immutable', 'event', $2)`,
      [client.id, event.id]
    );

    await expect(pool.query('DELETE FROM audit_logs')).rejects.toThrow();

    const remaining = await pool.query('SELECT COUNT(*)::int AS c FROM audit_logs');
    expect(remaining.rows[0].c).toBeGreaterThanOrEqual(1);
  });
});
