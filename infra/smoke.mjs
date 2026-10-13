// Pruebas de humo posteriores a un despliegue (RNF-058). Uso:
//   node infra/smoke.mjs https://xxxx.cloudfront.net
// Con SMOKE_EMAIL y SMOKE_PASSWORD (usuario de prueba) también prueba el inicio de sesión y una lectura
// autenticada. Nunca crea ni modifica datos.
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? '').replace(/\/$/, '');
if (!base) {
  console.error('Uso: node infra/smoke.mjs <url-de-la-aplicacion>');
  process.exit(2);
}

let failures = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`  ✘ ${name}: ${error.message}`);
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const get = (path, headers = {}) => fetch(`${base}${path}`, { headers, redirect: 'manual' });

await check('la web responde con HTML', async () => {
  const response = await get('/');
  expect(response.status === 200, `estado ${response.status}`);
  expect((await response.text()).includes('<div id="root">'), 'no es la aplicación');
});

await check('una ruta de la aplicación sirve la misma página (sin 404)', async () => {
  const response = await get('/pendientes');
  expect(response.status === 200, `estado ${response.status}`);
  expect((response.headers.get('content-type') ?? '').includes('text/html'), 'no es HTML');
});

await check('la API está viva', async () => {
  const response = await get('/api/health');
  expect(response.status === 200, `estado ${response.status}`);
  expect((await response.json()).status === 'ok', 'respuesta inesperada');
});

await check('la API llega a la base de datos', async () => {
  const response = await get('/api/health/ready');
  expect(response.status === 200, `estado ${response.status}`);
});

await check('una ruta de la API inexistente da 404 en JSON, no la página', async () => {
  const response = await get('/api/no-existe');
  expect(response.status === 404, `estado ${response.status}`);
  expect((response.headers.get('content-type') ?? '').includes('json'), 'no es JSON');
});

await check('sin sesión no se entregan datos', async () => {
  const response = await get('/api/me');
  expect(response.status === 401, `estado ${response.status}`);
});

await check('las respuestas de la API no se guardan en caché', async () => {
  const response = await get('/api/health');
  expect(response.headers.get('cache-control') === 'no-store', 'falta cache-control: no-store');
});

await check('llegan las cabeceras de seguridad', async () => {
  const response = await get('/');
  expect(response.headers.get('strict-transport-security'), 'falta HSTS');
  expect(response.headers.get('x-content-type-options') === 'nosniff', 'falta nosniff');
});

const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
if (email && password) {
  let cookie = '';
  await check('el usuario de prueba inicia sesión con cookies HttpOnly y seguras', async () => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email, password }),
    });
    expect(response.status === 200, `estado ${response.status}`);
    const cookies = response.headers.getSetCookie();
    expect(cookies.length >= 2, 'faltan cookies de sesión');
    expect(
      cookies.every((c) => /HttpOnly/i.test(c) && /Secure/i.test(c)),
      'una cookie no es HttpOnly y Secure',
    );
    cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  });
  await check('con sesión, /api/me devuelve la tienda', async () => {
    const response = await get('/api/me', { cookie });
    expect(response.status === 200, `estado ${response.status}`);
    expect((await response.json()).tenant?.id, 'sin tienda');
  });
  await check('con sesión, la jornada de hoy se lee', async () => {
    const response = await get('/api/workdays/today', { cookie });
    expect(response.status === 200, `estado ${response.status}`);
  });
  await check('cerrar sesión borra la sesión', async () => {
    const response = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { origin: base, cookie },
    });
    expect(response.status === 204, `estado ${response.status}`);
  });
} else {
  results.push('  - sin SMOKE_EMAIL/SMOKE_PASSWORD: se omiten las pruebas con sesión');
}

console.log(`Pruebas de humo de ${base}\n${results.join('\n')}`);
process.exit(failures === 0 ? 0 : 1);
