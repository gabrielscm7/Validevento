const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const database = require('./config/database');

// Importar rotas
const authRoutes       = require('./modules/auth/auth.routes');
const importRoutes     = require('./modules/import/import.routes');
const syncRoutes       = require('./modules/sync/sync.routes');
const validationRoutes = require('./modules/validation/validation.routes');
const dashboardRoutes  = require('./modules/dashboard/dashboard.routes');
const eventsRoutes     = require('./modules/events/events.routes');
const adminRoutes      = require('./modules/admin/admin.routes');
const usersRoutes      = require('./modules/users/users.routes');
const clientsRoutes    = require('./modules/clients/clients.routes');
const batchesRoutes    = require('./modules/batches/batches.routes');

const app = express();

// ── Trust proxy (obrigatorio atras do Railway/Caddy) ──
app.set('trust proxy', 1);

// ── Keep-alive (Railway Hobby suspende serviços inativos) ──
// Registrado antes dos demais middlewares para não sofrer rate-limit/helmet.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Security headers (Helmet) ──
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ── Rate limiting ──
// Em testes o limiter é desativado para não interferir nas chamadas rápidas
const isTest = env.nodeEnv === 'test';
const noLimit = (req, res, next) => next();

const generalLimiter = isTest ? noLimit : rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
});

const authLimiter = isTest ? noLimit : rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 5 minutos.' },
});

app.use(generalLimiter);

// Configuração de CORS
// BUG-02: origem vem de CORS_ORIGIN (nunca '*' em produção). Suporta lista separada por vírgula.
function resolveCorsOrigin(value) {
  if (!value) return false; // sem origem configurada → bloqueia origens cruzadas
  if (value === '*') return '*';
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}
const corsOptions = {
  origin: resolveCorsOrigin(env.corsOrigin),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
  credentials: true,
  maxAge: 86400,
};
app.use(cors(corsOptions));

// Middlewares básicos
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ────────────────────────────────────────────────
// Rota de Diagnóstico / Health Monitor
// ────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const diagnostics = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: env.nodeEnv,
    database: 'unknown',
    memory: process.memoryUsage(),
  };

  try {
    await database.testConnection();
    diagnostics.database = 'connected';
  } catch (error) {
    diagnostics.status = 'error';
    diagnostics.database = 'disconnected';
    diagnostics.error = error.message;
  }

  return res.status(diagnostics.status === 'ok' ? 200 : 500).json(diagnostics);
});

// ── Desabilitar ETag (causa 304 via Cloudflare) ──
app.disable('etag');

// ── Desabilitar cache (304) nas rotas da API ──
// Cloudflare CDN respeita CDN-Cache-Control; Pragma/Expires para compatibilidade
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'CDN-Cache-Control': 'no-cache, no-store, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  next();
});

// ────────────────────────────────────────────────
// Registrar Rotas da API
// ────────────────────────────────────────────────
app.use('/api/auth',       authLimiter, authRoutes);
app.use('/api/import',     importRoutes);
app.use('/api/sync',       syncRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/events',     eventsRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/users',      usersRoutes);
app.use('/api/clients',    clientsRoutes);
app.use('/api/batches',    batchesRoutes);

// 404 — Rota não encontrada
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

// Handler global de erros
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(err.status || 500).json({
    error: 'Ocorreu um erro interno no servidor.',
    details: env.nodeEnv === 'development' ? err.message : undefined,
  });
});

// ────────────────────────────────────────────────
// Iniciar o servidor (apenas quando executado diretamente)
// Ao ser importado (ex.: testes via supertest) apenas exporta o app.
// ────────────────────────────────────────────────
if (require.main === module) {
  const server = app.listen(env.port, () => {
    console.log('===================================================');
    console.log(` Servidor Validevento rodando na porta ${env.port}`);
    console.log(` Modo: ${env.nodeEnv}`);
    console.log(` CORS Permitido para: ${env.corsOrigin}`);
    console.log('===================================================');

    database.testConnection().catch(() => {
      console.warn(
        'AVISO: Banco de dados indisponível na inicialização. Verifique o Docker.'
      );
    });
  });

  // Graceful shutdown
  function shutdown(signal) {
    console.log(`\n🛑 Sinal ${signal} recebido. Encerrando graciosamente...`);
    server.close(() => {
      console.log('Servidor HTTP fechado.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
