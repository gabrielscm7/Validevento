/**
 * Testes de integração das fases do Docs/IMPLEMENTATION_GUIDE.md.
 *  FASE 1 — isolamento MASTER (contexto de cliente obrigatório).
 *  FASE 2 — terminais genéricos: suspender/soft-delete.
 *  FASE 3 — geração de QR code do terminal.
 *  FASE 4 — métricas detalhadas por terminal (admin/master).
 */
const helpers = require('./helpers');
const {
  api, resetDb, pool, createClient, createUser, createEvent, createTicket,
  addTeamMember, loginToken, auth,
} = helpers;

describe('Implementation guide — fases 1–4', () => {
  let clientA;
  let clientB;
  let masterToken;
  let adminToken;
  let eventA;
  let eventB;

  beforeAll(async () => {
    await resetDb();

    clientA = await createClient({ name: 'Cliente A' });
    clientB = await createClient({ name: 'Cliente B' });

    const master = await createUser({
      role: 'master', cpf: '00011122233', password: 'master123', email_verified: true,
    });
    masterToken = await loginToken(master.plain_cpf, 'master123');

    const admin = await createUser({
      tenant_id: clientA.id, role: 'admin', cpf: '44455566677',
      password: 'admin123', email_verified: true,
    });
    adminToken = await loginToken(admin.plain_cpf, 'admin123');

    eventA = await createEvent({ tenant_id: clientA.id, name: 'Evento A', status: 'active' });
    eventB = await createEvent({ tenant_id: clientB.id, name: 'Evento B', status: 'active' });
  });

  afterAll(async () => {
    await pool.end();
  });

  // ── FASE 1 ──
  test('F1: master sem cliente selecionado não acessa evento (403)', async () => {
    const res = await api().get(`/api/events/${eventA.id}`).set(auth(masterToken));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('tenant_context_required');
  });

  test('F1: master com cliente correto acessa o evento', async () => {
    const res = await api()
      .get(`/api/events/${eventA.id}`)
      .set(auth(masterToken))
      .set('X-Tenant-Id', clientA.id);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(eventA.id);
  });

  test('F1: master com outro cliente recebe 404 (não vaza evento)', async () => {
    const res = await api()
      .get(`/api/events/${eventA.id}`)
      .set(auth(masterToken))
      .set('X-Tenant-Id', clientB.id);
    expect(res.status).toBe(404);
  });

  test('F1: admin do tenant continua acessando normalmente', async () => {
    const res = await api().get(`/api/events/${eventA.id}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(eventA.id);
  });

  // ── FASE 2/3: terminal genérico ──
  let slug;
  let terminalId;

  async function createGeneric(name = 'Portaria Teste') {
    const res = await api()
      .post(`/api/events/${eventA.id}/terminals/generic`)
      .set(auth(adminToken))
      .send({ name });
    expect(res.status).toBe(201);
    return res.body;
  }

  test('F2: cria terminal e abre via slug (idempotente)', async () => {
    const created = await createGeneric();
    slug = created.slug;
    terminalId = created.id;

    const [r1, r2] = await Promise.all([
      api().post(`/api/terminal/join/${slug}/open`).send({ operator_name: 'Op 1' }),
      api().post(`/api/terminal/join/${slug}/open`).send({ operator_name: 'Op 2' }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  test('F3: QR code JSON e PNG', async () => {
    const json = await api().get(`/api/terminal/${slug}/qr`);
    expect(json.status).toBe(200);
    expect(json.body.qrcode).toMatch(/^data:image\/png;base64,/);
    expect(json.body.url).toContain(`/terminal/join/${slug}`);

    const png = await api().get(`/api/terminal/${slug}/qr?format=png`);
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toContain('image/png');
    expect(png.body.length).toBeGreaterThan(0);
  });

  test('F2: suspender bloqueia join/open; reativar libera', async () => {
    const sus = await api()
      .patch(`/api/events/${eventA.id}/terminals/${terminalId}/suspend`)
      .set(auth(adminToken))
      .send({ suspended: true });
    expect(sus.status).toBe(200);
    expect(sus.body.suspended).toBe(true);

    const joinBlocked = await api().get(`/api/terminal/join/${slug}`);
    expect(joinBlocked.status).toBe(403);
    expect(joinBlocked.body.error).toBe('terminal_suspended');

    const openBlocked = await api().post(`/api/terminal/join/${slug}/open`).send({});
    expect(openBlocked.status).toBe(403);

    const react = await api()
      .patch(`/api/events/${eventA.id}/terminals/${terminalId}/suspend`)
      .set(auth(adminToken))
      .send({ suspended: false });
    expect(react.status).toBe(200);
    expect(react.body.suspended).toBe(false);

    const joinOk = await api().get(`/api/terminal/join/${slug}`);
    expect(joinOk.status).toBe(200);
  });

  test('F2: soft-delete remove da lista e bloqueia acesso (410)', async () => {
    const del = await api()
      .delete(`/api/events/${eventA.id}/terminals/${terminalId}`)
      .set(auth(adminToken));
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const join = await api().get(`/api/terminal/join/${slug}`);
    expect(join.status).toBe(410);

    const list = await api()
      .get(`/api/events/${eventA.id}/terminals`)
      .set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.find((t) => t.id === terminalId)).toBeUndefined();
  });

  // ── FASE 4: métricas detalhadas ──
  test('F4: admin vê métricas detalhadas por terminal', async () => {
    await createTicket({ event_id: eventA.id, tenant_id: clientA.id });

    const res = await api()
      .get(`/api/events/${eventA.id}/dashboard/terminals/detailed`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('validations_today');
      expect(res.body[0]).toHaveProperty('avg_gap_seconds');
    }
  });

  test('F4: supervisor não acessa métricas detalhadas (403)', async () => {
    const sup = await createUser({
      tenant_id: clientA.id, role: 'supervisor', cpf: '55566677788',
      password: 'sup123', email_verified: true,
    });
    await addTeamMember(eventA.id, sup.id);
    const supToken = await loginToken(sup.plain_cpf, 'sup123');

    const res = await api()
      .get(`/api/events/${eventA.id}/dashboard/terminals/detailed`)
      .set(auth(supToken));
    expect(res.status).toBe(403);
  });

  test('F1: master também acessa métricas com cliente selecionado', async () => {
    const res = await api()
      .get(`/api/events/${eventA.id}/dashboard/terminals/detailed`)
      .set(auth(masterToken))
      .set('X-Tenant-Id', clientA.id);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
