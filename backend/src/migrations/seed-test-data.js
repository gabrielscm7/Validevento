const crypto = require('crypto');
const { pool } = require('../config/database');

function hashCPF(cpf, salt) {
  const cpfClean = cpf.replace(/\D/g, '');
  return crypto.createHash('sha256').update(cpfClean + salt).digest('hex');
}

const TEST_TICKETS = [
  { ticket_code: 'EVT2026-000001', batch: 'LOTE-01', cpf: '529.482.170-01', display_name: 'Ana Beatriz S.',   status: 'validated' },
  { ticket_code: 'EVT2026-000002', batch: 'LOTE-01', cpf: '381.655.920-80', display_name: 'Carlos Eduardo M.', status: 'validated' },
  { ticket_code: 'EVT2026-000003', batch: 'LOTE-02', cpf: '047.326.510-50', display_name: 'Marina Oliveira',    status: 'validated' },
  { ticket_code: 'EVT2026-000004', batch: 'LOTE-02', cpf: '772.548.310-03', display_name: 'Rafael Costa',       status: 'validated' },
  { ticket_code: 'EVT2026-000005', batch: 'LOTE-03', cpf: '613.249.870-08', display_name: 'Juliana Lima',       status: 'linked' },
  { ticket_code: 'EVT2026-000006', batch: 'LOTE-03', cpf: '198.765.430-57', display_name: 'Thiago Alves',       status: 'linked' },
  { ticket_code: 'EVT2026-000007', batch: 'LOTE-01', cpf: '905.432.180-66', display_name: 'Fernanda Souza',     status: 'blocked' },
  { ticket_code: 'EVT2026-000008', batch: 'LOTE-04', cpf: '334.679.210-00', display_name: 'Gustavo Santos',     status: 'generated' },
  { ticket_code: 'EVT2026-000009', batch: 'LOTE-04', cpf: '176.348.920-61', display_name: 'Larissa Rocha',      status: 'linked' },
  { ticket_code: 'EVT2026-000010', batch: 'LOTE-02', cpf: '448.215.670-39', display_name: 'Pedro Henrique N.',  status: 'generated' },
]

async function seedTestData() {
  console.log('Criando dados de teste...');

  const eventRes = await pool.query(
    'SELECT id, salt, name FROM events WHERE active = true ORDER BY created_at DESC LIMIT 1'
  );
  if (eventRes.rowCount === 0) {
    console.log('Nenhum evento ativo encontrado. Execute npm run seed primeiro.');
    process.exit(1);
  }

  const { id: eventId, salt: eventSalt, name: eventName } = eventRes.rows[0];
  console.log(`Evento: ${eventName} (${eventId})`);

  // Limpar dados existentes deste evento
  await pool.query('DELETE FROM entry_logs WHERE event_id = $1', [eventId]);
  await pool.query('DELETE FROM tickets WHERE event_id = $1', [eventId]);

  let inserted = 0;
  const entryLogs = [];

  for (const t of TEST_TICKETS) {
    const hash = t.cpf ? hashCPF(t.cpf, eventSalt) : null;
    const validatedAt = t.status === 'validated'
      ? new Date(Date.now() - Math.random() * 7200000).toISOString()
      : null;

    const result = await pool.query(
      `INSERT INTO tickets (event_id, ticket_code, batch, hash_cpf, display_name, status, validated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [eventId, t.ticket_code, t.batch, hash, t.display_name, t.status, validatedAt]
    );

    const ticketId = result.rows[0].id;
    inserted++;

    if (t.status === 'validated' && hash) {
      entryLogs.push({
        ticket_id: ticketId,
        hash_cpf:  hash,
        entry_type: Math.random() > 0.7 ? 'manual' : 'qrcode',
        created_at: validatedAt,
      });
    }
  }

  console.log(`${inserted} ingressos inseridos.`);

  // Inserir logs das entradas validadas
  for (const log of entryLogs) {
    const isDuplicate = Math.random() < 0.05;
    if (isDuplicate) {
      await pool.query(
        `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [log.ticket_id, eventId, log.hash_cpf, log.entry_type, false, true, log.created_at]
      );
      await pool.query(
        `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [log.ticket_id, eventId, log.hash_cpf, 'qrcode', true, true, new Date(Date.now() - 600000).toISOString()]
      );
    } else {
      await pool.query(
        `INSERT INTO entry_logs (ticket_id, event_id, hash_cpf, entry_type, is_duplicate, synced, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [log.ticket_id, eventId, log.hash_cpf, log.entry_type, false, true, log.created_at]
      );
    }
  }

  console.log(`${entryLogs.length} logs de entrada criados.`);
  console.log('\n--- Dados de teste criados com sucesso! ---');
  console.log(`${inserted} ingressos (${TEST_TICKETS.filter(t => t.status === 'validated').length} validados, ${TEST_TICKETS.filter(t => t.status === 'linked').length} vinculados, ${TEST_TICKETS.filter(t => t.status === 'blocked').length} bloqueados, ${TEST_TICKETS.filter(t => t.status === 'generated').length} gerados)`);
  console.log('CPFs usados (para testar QRCode):');
  TEST_TICKETS.filter(t => t.cpf).forEach(t => console.log(`  ${t.display_name}: ${t.cpf}`));

  await pool.end();
}

if (require.main === module) {
  seedTestData().catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  });
}

module.exports = seedTestData;
