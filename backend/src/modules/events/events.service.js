const db = require('../../config/database');

async function getActiveEvent() {
  const result = await db.query(
    `SELECT id, name, date, location, capacity, salt
     FROM events
     WHERE active = true
     ORDER BY created_at DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}

module.exports = { getActiveEvent };
