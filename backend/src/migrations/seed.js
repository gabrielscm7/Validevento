const bcrypt = require('bcryptjs');
const { pool, testConnection } = require('../config/database');
const { cpfLookupHash } = require('../utils/hash');

const SALT_ROUNDS = 10;

async function getOrCreateDemoClient() {
  const res = await pool.query(
    `SELECT id FROM clients WHERE email = $1`,
    ['demo@validevento.com']
  );
  if (res.rowCount > 0) return res.rows[0].id;

  const created = await pool.query(
    `INSERT INTO clients (name, email, cnpj, plan)
     VALUES ($1, $2, $3, 'basic')
     RETURNING id`,
    ['Cliente Demo Validevento', 'demo@validevento.com', '00.000.000/0000-00']
  );
  return created.rows[0].id;
}

async function seed() {
  console.log('Iniciando semeadura de dados (seed)...');
  try {
    await testConnection();

    const tenantId = await getOrCreateDemoClient();
    console.log(`Cliente demo vinculado (tenant_id): ${tenantId}`);

    const adminPasswordHash = await bcrypt.hash('admin123', SALT_ROUNDS);
    const validatorPasswordHash = await bcrypt.hash('validador123', SALT_ROUNDS);
    const supervisorPasswordHash = await bcrypt.hash('supervisor123', SALT_ROUNDS);

    // Usuário Master (tenant_id NULL) — login por CPF 000.000.000-00
    const masterPasswordHash = await bcrypt.hash('master123', SALT_ROUNDS);
    await pool.query(`
      INSERT INTO users (name, email, cpf_lookup_hash, password_hash, role, tenant_id, email_verified)
      VALUES ($1, $2, $3, $4, 'master', NULL, true)
      ON CONFLICT (email) DO NOTHING
    `, ['Master Validevento', 'master@validevento.com', cpfLookupHash('00000000000'), masterPasswordHash]);
    console.log('Usuário MASTER semeado: master@validevento.com (CPF: 000.000.000-00 / senha: master123)');

    await pool.query(`
      INSERT INTO users (name, email, cpf_lookup_hash, password_hash, role, tenant_id, email_verified)
      VALUES ($1, $2, $3, $4, 'admin', $5, true)
      ON CONFLICT (email) DO NOTHING
    `, ['Administrador Validevento', 'admin@validevento.com', cpfLookupHash('11122233344'), adminPasswordHash, tenantId]);
    console.log('Usuário ADMIN semeado: admin@validevento.com (CPF: 111.222.333-44 / senha: admin123)');

    await pool.query(`
      INSERT INTO users (name, email, cpf_lookup_hash, password_hash, role, tenant_id, email_verified)
      VALUES ($1, $2, $3, $4, 'validator', $5, true)
      ON CONFLICT (email) DO NOTHING
    `, ['Validador Portaria 1', 'validador@validevento.com', cpfLookupHash('33344455566'), validatorPasswordHash, tenantId]);
    console.log('Usuário VALIDATOR semeado: validador@validevento.com (CPF: 333.444.555-66 / senha: validador123)');

    await pool.query(`
      INSERT INTO users (name, email, cpf_lookup_hash, password_hash, role, tenant_id, email_verified)
      VALUES ($1, $2, $3, $4, 'supervisor', $5, true)
      ON CONFLICT (email) DO NOTHING
    `, ['Supervisor Portaria', 'supervisor@validevento.com', cpfLookupHash('22233344455'), supervisorPasswordHash, tenantId]);
    console.log('Usuário SUPERVISOR semeado: supervisor@validevento.com (CPF: 222.333.444-55 / senha: supervisor123)');

    const eventRes = await pool.query(
      'SELECT id FROM events WHERE tenant_id = $1 LIMIT 1',
      [tenantId]
    );
    let eventId;

    if (eventRes.rowCount === 0) {
      const newEvent = await pool.query(`
        INSERT INTO events (name, date, location, capacity, tenant_id, active)
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id
      `, [
        'Evento de Teste Validevento',
        new Date('2026-06-29T18:00:00Z'),
        'Centro de Convenções Paulista',
        1000,
        tenantId
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
