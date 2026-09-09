const dotenv = require('dotenv');
const path = require('path');

// Carregar variáveis de ambiente do arquivo .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

// BUG-02: nunca permitir '*' em produção. O CORS_ORIGIN deve vir do ambiente.
const nodeEnv = process.env.NODE_ENV || 'development';

// Validação de startup — impede subir em produção com configuração insegura.
if (nodeEnv === 'production') {
  const required = ['JWT_SECRET', 'CPF_LOOKUP_SALT', 'DATABASE_URL', 'CORS_ORIGIN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `FATAL: Variáveis de ambiente obrigatórias ausentes em produção: ${missing.join(', ')}`
    );
    process.exit(1);
  }
}

if (nodeEnv !== 'production' && !process.env.JWT_SECRET) {
  console.warn(
    'AVISO: JWT_SECRET não definida. Execute: cp .env.example .env'
  );
}

module.exports = {
  nodeEnv,
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  // Em desenvolvimento o fallback '*' é aceitável; em produção exige CORS_ORIGIN explícito.
  corsOrigin: process.env.CORS_ORIGIN || (nodeEnv === 'production' ? '' : '*')
};
