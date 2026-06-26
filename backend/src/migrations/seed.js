const bcrypt = require('bcryptjs');
const { pool, testConnection } = require('../config/database');

async function seed() {
  console.log('Iniciando semeadura de dados (seed)...');
  try {
    await testConnection();

    // 1. Criar usuários padrão
    const saltRounds = 10;
    const adminPasswordHash = await bcrypt.hash('admin123', saltRounds);
    const validatorPasswordHash = await bcrypt.hash('validador123', saltRounds);
    const supervisorPasswordHash = await bcrypt.hash('supervisor123', saltRounds);

    // Inserir Admin
    await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['Administrador Validevento', 'admin@validevento.com', adminPasswordHash, 'admin']);
    console.log('Usuário ADMIN semeado: admin@validevento.com (senha: admin123)');

    // Inserir Validador
    await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['Validador Portaria 1', 'validador@validevento.com', validatorPasswordHash, 'validator']);
    console.log('Usuário VALIDATOR semeado: validador@validevento.com (senha: validador123)');

    // Inserir Supervisor
    await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['Supervisor Portaria', 'supervisor@validevento.com', supervisorPasswordHash, 'supervisor']);
    console.log('Usuário SUPERVISOR semeado: supervisor@validevento.com (senha: supervisor123)');

    // 2. Criar um evento padrão se não houver nenhum
    const eventRes = await pool.query('SELECT * FROM events LIMIT 1');
    let eventId;

    if (eventRes.rowCount === 0) {
      const newEvent = await pool.query(`
        INSERT INTO events (name, date, location, capacity, salt)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        'Evento de Teste Validevento',
        new Date('2026-06-29T18:00:00Z'),
        'Centro de Convenções Paulista',
        1000,
        'salt_secreto_evento_demonstrativo_2026'
      ]);
      eventId = newEvent.rows[0].id;
      console.log(`Evento de teste criado com ID: ${eventId}`);
    } else {
      eventId = eventRes.rows[0].id;
      console.log(`Evento existente encontrado com ID: ${eventId}`);
    }

    console.log('\n--- ATENÇÃO ---');
    console.log(`Adicione o seguinte ID de evento no seu frontend/.env:`);
    console.log(`VITE_EVENT_ID=${eventId}`);
    console.log('----------------\n');

    console.log('Semeadura de dados concluída com sucesso!');
  } catch (error) {
    console.error('Erro na semeadura de dados:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
