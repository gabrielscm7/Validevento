const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('../config/database');

// Ordena por prefixo numérico (01 < 02 < 003 < 03) preservando arquivos com
// larguras diferentes de numeração. Sem isso, '003_*' ordenaria antes de '01_*'.
function compareMigrationFiles(a, b) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

async function runMigrations() {
  console.log('Iniciando migrações...');
  try {
    await testConnection();

    const migrationsDir = path.join(__dirname, '../../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(compareMigrationFiles);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      console.log(`Executando: ${file}`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await pool.query(sql);
      console.log(`  OK: ${file}`);
    }

    console.log('Migrações executadas com sucesso!');
  } catch (error) {
    console.error('Erro ao executar migrações:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
