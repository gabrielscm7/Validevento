const { pool } = require('../config/database');
const { importFile } = require('../modules/import/import.service');

async function importBase() {
  try {
    const eventRes = await pool.query(
      'SELECT id, name FROM events WHERE active = true ORDER BY created_at DESC LIMIT 1'
    );
    const eventId = eventRes.rows[0].id;
    console.log('Evento:', eventRes.rows[0].name, '(' + eventId + ')');

    await pool.query('DELETE FROM entry_logs WHERE event_id = $1', [eventId]);
    await pool.query('DELETE FROM tickets WHERE event_id = $1', [eventId]);
    console.log('Ingressos antigos removidos.');

    const result = await importFile(
      eventId,
      process.argv[2],
      process.argv[3] || 'base.xlsx',
      undefined,
      null
    );
    console.log(JSON.stringify(result, null, 2));

    await pool.end();
  } catch (err) {
    console.error('Erro:', err);
    process.exit(1);
  }
}

importBase();
