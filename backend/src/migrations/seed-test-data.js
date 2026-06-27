const { pool } = require('../config/database');

const TEST_TICKETS = [
  { ticket_code: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', batch: 'LOTE-01', display_name: 'Ana Beatriz S.',   status: 'validated' },
  { ticket_code: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', batch: 'LOTE-01', display_name: 'Carlos Eduardo M.', status: 'validated' },
  { ticket_code: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', batch: 'LOTE-02', display_name: 'Marina Oliveira',    status: 'validated' },
  { ticket_code: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', batch: 'LOTE-02', display_name: 'Rafael Costa',       status: 'validated' },
  { ticket_code: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', batch: 'LOTE-03', display_name: 'Juliana Lima',       status: 'active' },
  { ticket_code: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c', batch: 'LOTE-03', display_name: 'Thiago Alves',       status: 'active' },
  { ticket_code: 'a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d', batch: 'LOTE-01', display_name: 'Fernanda Souza',     status: 'blocked' },
  { ticket_code: 'b8c9d0e1-f2a3-4b4c-5d6e-7f8a9b0c1d2e', batch: 'LOTE-04', display_name: 'Gustavo Santos',     status: 'active' },
  { ticket_code: 'c9d0e1f2-a3b4-4c5d-6e7f-8a9b0c1d2e3f', batch: 'LOTE-04', display_name: 'Larissa Rocha',      status: 'active' },
  { ticket_code: 'd0e1f2a3-b4c5-4d6e-7f8a-9b0c1d2e3f4a', batch: 'LOTE-02', display_name: 'Pedro Henrique N.',  status: 'active' },
]

async function seedTestData() {
  console.log('Criando dados de teste...');

  const eventRes = await pool.query(
    'SELECT id, name FROM events WHERE active = true ORDER BY created_at DESC LIMIT 1'
  );
  if (eventRes.rowCount === 0) {
    console.log('Nenhum evento ativo encontrado. Execute npm run seed primeiro.');
    process.exit(1);
  }

  const { id: eventId, name: eventName } = eventRes.rows[0];
  console.log(`Evento: ${eventName} (${eventId})`);

  await pool.query('DELETE FROM entry_logs WHERE event_id = $1', [eventId]);
  await pool.query('DELETE FROM tickets WHERE event_id = $1', [eventId]);

  let inserted = 0;
  const entryLogs = [];

  for (const t of TEST_TICKETS) {
    const validatedAt = t.status === 'validated'
      ? new Date(Date.now() - Math.random() * 7200000).toISOString()
      : null;

    const result = await pool.query(
      `INSERT INTO tickets (event_id, ticket_code, batch, display_name, status, validated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [eventId, t.ticket_code, t.batch, t.display_name, t.status, validatedAt]
    );

    const ticketId = result.rows[0].id;
    inserted++;

    if (t.status === 'validated') {
      entryLogs.push({
        ticket_id: ticketId,
        entry_type: Math.random() > 0.7 ? 'manual' : 'qrcode',
        created_at: validatedAt,
      });
    }
  }

  console.log(`${inserted} ingressos inseridos.`);

  for (const log of entryLogs) {
    const isDuplicate = Math.random() < 0.05;
    if (isDuplicate) {
      await pool.query(
        `INSERT INTO entry_logs (ticket_id, event_id, entry_type, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [log.ticket_id, eventId, log.entry_type, false, true, log.created_at]
      );
      await pool.query(
        `INSERT INTO entry_logs (ticket_id, event_id, entry_type, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [log.ticket_id, eventId, 'qrcode', true, true, new Date(Date.now() - 600000).toISOString()]
      );
    } else {
      await pool.query(
        `INSERT INTO entry_logs (ticket_id, event_id, entry_type, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [log.ticket_id, eventId, log.entry_type, false, true, log.created_at]
      );
    }
  }

  console.log(`${entryLogs.length} logs de entrada criados.`);
  console.log('\n--- Dados de teste criados com sucesso! ---');
  console.log(`${inserted} ingressos (${TEST_TICKETS.filter(t => t.status === 'validated').length} validados, ${TEST_TICKETS.filter(t => t.status === 'active').length} ativos, ${TEST_TICKETS.filter(t => t.status === 'blocked').length} bloqueados)`);
  console.log('Ticket codes UUID (para testar QRCode):');
  TEST_TICKETS.forEach(t => console.log(`  ${t.display_name}: ${t.ticket_code}`));

  await pool.end();
}

if (require.main === module) {
  seedTestData().catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  });
}

module.exports = seedTestData;
