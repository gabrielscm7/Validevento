/**
 * Testes de integração (smoke tests) para API do Validevento
 * Execute: node tests/api-test.js
 */
const http = require('http');

const BASE = process.env.API_URL || 'http://localhost:3000';
const ANONYMOUS_URL = BASE;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ❌ ${name}: ${e.message}`);
    }
  };

  console.log('\n🧪 Validevento API Smoke Tests\n');
  console.log(`Base URL: ${BASE}\n`);

  // ── Health ──
  await test('GET /api/health returns 200', async () => {
    const res = await request('GET', '/api/health');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (res.body.status !== 'ok') throw new Error('Status not ok');
  });

  // ── Auth ──
  await test('POST /api/auth/login without credentials returns error', async () => {
    const res = await request('POST', '/api/auth/login', {});
    if (res.status < 400) throw new Error(`Expected error, got ${res.status}`);
  });

  await test('POST /api/auth/login with invalid credentials returns 400', async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'invalid@test.com',
      password: 'wrong',
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  let adminToken = null;
  await test('POST /api/auth/login with valid credentials returns token', async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'admin@validevento.com',
      password: 'admin123',
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status} - ${res.body.error || 'run npm run seed first'}`);
    if (!res.body.token) throw new Error('No token returned');
    adminToken = res.body.token;
  });

  // ── Protected routes ──
  await test('GET /api/dashboard/summary without token returns 401', async () => {
    const res = await request('GET', '/api/dashboard/summary');
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  if (adminToken) {
    await test('GET /api/dashboard/summary with admin token returns 200', async () => {
      const res = await request('GET', '/api/dashboard/summary', null, adminToken);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await test('GET /api/users with admin token returns 200', async () => {
      const res = await request('GET', '/api/users', null, adminToken);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await test('GET /api/events/active with token returns 200', async () => {
      const res = await request('GET', '/api/events/active', null, adminToken);
      if (![200, 404].includes(res.status)) throw new Error(`Expected 200 or 404, got ${res.status}`);
    });
  }

  // ── 404 ──
  await test('GET /api/nonexistent returns 404', async () => {
    const res = await request('GET', '/api/nonexistent');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log(`\n📊 Resultado: ${passed} passaram, ${failed} falharam de ${passed + failed} testes\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error('Erro ao executar testes:', e.message);
  process.exit(1);
});
