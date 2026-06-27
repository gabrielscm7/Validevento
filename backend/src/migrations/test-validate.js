const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, body: b }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // Login
  const auth = await req('POST', '/api/auth/login', {
    email: 'validador@validevento.com', password: 'validador123'
  });
  console.log('Login:', auth.status, auth.body.user?.role || auth.body.error);

  if (!auth.body.token) { console.log('Falha no login'); return; }
  const token = auth.body.token;

  // Test validation with first UUID from the spreadsheet (uppercase)
  const cases = [
    { label: 'QR original (uppercase)', code: '001C7038-52E1-4315-A969-6966C8E494F2' },
    { label: 'QR lowercase', code: '001c7038-52e1-4315-a969-6966c8e494f2' },
    { label: 'QR inexistente', code: '00000000-0000-0000-0000-000000000000' },
  ];

  for (const c of cases) {
    const r = await req('POST', '/api/validation/qrcode', {
      ticket_code: c.code,
      event_id: '307f80da-f4df-41f9-9353-398daa6b6a2e',
    }, token);
    console.log(c.label + ':', r.status, JSON.stringify(r.body));
  }

  // Search test
  const s = await req('GET', '/api/validation/search?event_id=307f80da-f4df-41f9-9353-398daa6b6a2e&q=SESI', null, token);
  console.log('Search "SESI":', s.status, s.body.results?.length + ' results');
}

main().catch(console.error);
