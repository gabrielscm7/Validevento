const { Pool } = require('pg');
const env = require('./env');

const isProduction = env.nodeEnv === 'production';

const pool = new Pool({
  connectionString: env.databaseUrl,
  // O Supabase requer SSL em produção
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 20, // máximo de clientes no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente idle do pool PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  testConnection: async () => {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT NOW()');
      console.log(`Conexão com PostgreSQL bem sucedida: ${res.rows[0].now}`);
      return true;
    } catch (err) {
      console.error('Falha de conexão com PostgreSQL:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }
};
