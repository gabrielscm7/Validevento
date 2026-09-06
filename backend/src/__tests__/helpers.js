/**
 * Helper compartilhado dos testes de integração (Fase 1).
 *
 * IMPORTANTE: define as variáveis de ambiente ANTES de carregar qualquer
 * módulo do backend (o dotenv do backend não sobrescreve variáveis já
 * definidas no processo).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ── Ambiente de teste ──
process.env.NODE_ENV = 'test';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/validevento_test';
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-fase1';
process.env.CPF_LOOKUP_SALT = process.env.CPF_LOOKUP_SALT || 'test-cpf-salt-fixo-fase1';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
delete process.env.RESEND_API_KEY; // nunca enviar e-mail real durante os testes

// ── Módulos do backend (após o ambiente definido) ──
const app = require('../app');
const { pool } = require('../config/database');
const { cpfLookupHash } = require('../utils/hash');

const supertest = require('supertest');

// Remove um possível segundo listener residual (app não faz listen em teste)
function api() {
  return supertest(app);
}

// ── Setup do banco ──

async function createDatabaseIfMissing() {
  const url = new URL(process.env.DATABASE_URL);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  const { Client } = require('pg');

  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });

  await admin.connect();
  try {
    const res = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}

function compareMigrationFiles(a, b) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(compareMigrationFiles);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
  }
}

async function truncateAll() {
  await pool.query(`
    TRUNCATE TABLE
      audit_logs, entry_logs, tickets, terminals, batches,
      event_team, event_config, master_tickets, gates, events,
      users, clients
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Garante o banco de teste: cria a base, aplica migrations e limpa as tabelas.
 * Deve ser chamado no beforeAll de cada suíte.
 */
async function resetDb() {
  await createDatabaseIfMissing();
  await runMigrations();
  await truncateAll();
}

// ── Fábricas de fixtures ──

let seq = 0;
function nextSeq() {
  seq += 1;
  return seq;
}

async function createClient(over = {}) {
  const n = nextSeq();
  const name = over.name !== undefined ? over.name : `Cliente Teste ${n}`;
  const email = over.email !== undefined ? over.email : `cliente${n}@teste.com`;
  const cnpj = over.cnpj !== undefined ? over.cnpj : `12.345.678/0001-${String(n).padStart(2, '0')}`;

  const result = await pool.query(
    `INSERT INTO clients (
       name, cnpj, email, plan,
       max_admins, max_supervisors, max_validators,
       max_tickets_per_event, max_events_active, active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      name,
      cnpj,
      email,
      over.plan || 'basic',
      over.max_admins !== undefined ? over.max_admins : 2,
      over.max_supervisors !== undefined ? over.max_supervisors : 5,
      over.max_validators !== undefined ? over.max_validators : 10,
      over.max_tickets_per_event !== undefined ? over.max_tickets_per_event : 3000,
      over.max_events_active !== undefined ? over.max_events_active : 1,
      over.active !== undefined ? over.active : true,
    ]
  );
  return result.rows[0];
}

/**
 * Cria usuário (default: verificado, com senha 'senha123', tenant informado ou null).
 * Passar { password: null } para criar sem senha (ativação pendente) e
 * { activationToken } para definir o token de e-mail.
 */
async function createUser(over = {}) {
  const n = nextSeq();
  const name = over.name !== undefined ? over.name : `Usuário ${n}`;
  const cpf = over.cpf !== undefined ? over.cpf : String(10000000000 + n).slice(-11);
  const email = over.email !== undefined ? over.email : `usuario${n}@teste.com`;
  const role = over.role || 'validator';
  const tenantId = over.tenant_id !== undefined ? over.tenant_id : null;
  const active = over.active !== undefined ? over.active : true;
  const emailVerified = over.email_verified !== undefined ? over.email_verified : true;
  const password = over.password !== undefined ? over.password : 'senha123';

  const lookup = cpfLookupHash(cpf);
  let passwordHash = null;
  if (over.password_hash !== undefined) {
    passwordHash = over.password_hash;
  } else if (password !== null) {
    passwordHash = await bcrypt.hash(password, 4); // rounds baixos apenas p/ fixtures
  }

  const token = over.activationToken || null;
  const tokenExp = over.activationExp || null;

  const result = await pool.query(
    `INSERT INTO users (
       tenant_id, name, email, cpf_lookup_hash, password_hash, role,
       email_verified, email_token, email_token_exp, active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [tenantId, name, email, lookup, passwordHash, role, emailVerified, token, tokenExp, active]
  );

  const user = result.rows[0];
  user.plain_cpf = cpf;
  user.plain_password = password;
  return user;
}

async function createEvent(over = {}) {
  const n = nextSeq();
  const name = over.name || `Evento ${n}`;
  const result = await pool.query(
    `INSERT INTO events (tenant_id, name, date, location, capacity, expected_start, status, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      over.tenant_id,
      name,
      over.date || new Date('2026-12-31T20:00:00Z'),
      over.location || 'Local de Teste',
      over.capacity !== undefined ? over.capacity : 3000,
      over.expected_start || null,
      over.status || 'draft',
      over.active !== undefined ? over.active : true,
    ]
  );
  return result.rows[0];
}

async function createTicket(over = {}) {
  const result = await pool.query(
    `INSERT INTO tickets (event_id, tenant_id, ticket_code, batch, display_name, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      over.event_id,
      over.tenant_id,
      over.ticket_code || crypto.randomUUID(),
      over.batch || 'LOTE-01',
      over.display_name || 'Participante Teste',
      over.status || 'active',
    ]
  );
  return result.rows[0];
}

// ── Helpers HTTP ──

async function login(cpf, password) {
  const res = await api().post('/api/auth/login').send({ cpf, password });
  return res;
}

async function loginToken(cpf, password) {
  const res = await login(cpf, password);
  if (res.status !== 200) {
    throw new Error(`Login falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  api,
  resetDb,
  truncateAll,
  pool,
  createClient,
  createUser,
  createEvent,
  createTicket,
  login,
  loginToken,
  auth,
};
