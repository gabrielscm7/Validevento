const dotenv = require('dotenv');
const path = require('path');

// Carregar variáveis de ambiente do arquivo .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

// BUG-02: nunca permitir '*' em produção. O CORS_ORIGIN deve vir do ambiente.
const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  nodeEnv,
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-key-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  // Em desenvolvimento o fallback '*' é aceitável; em produção exige CORS_ORIGIN explícito.
  corsOrigin: process.env.CORS_ORIGIN || (nodeEnv === 'production' ? '' : '*')
};
