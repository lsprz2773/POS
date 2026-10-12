// Prepara una base propia (pos_e2e), un usuario con tienda y otro sin tienda, con valores aleatorios
// en cada ejecución (nada de contraseñas escritas en el código), y lanza Playwright.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

const root = new URL('../../..', import.meta.url).pathname;
const base = process.env.DATABASE_URL;
if (!base) {
  console.error('Falta DATABASE_URL (consulta .env.example).');
  process.exit(1);
}

const e2eUrl = new URL(base);
e2eUrl.pathname = '/pos_e2e';
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS pos_e2e WITH (FORCE)');
await admin.query('CREATE DATABASE pos_e2e');
await admin.end();

const owner = { email: 'dueno@e2e.test', password: randomUUID() };
const orphan = { email: 'sin-tienda@e2e.test', password: randomUUID() };
const env = {
  ...process.env,
  DATABASE_URL: e2eUrl.toString(),
  AUTH_PROVIDER: 'local',
  AUTH_SECRET: randomBytes(32).toString('hex'),
  LOCAL_AUTH_USERS: JSON.stringify([owner, orphan]),
  E2E_OWNER_EMAIL: owner.email,
  E2E_OWNER_PASSWORD: owner.password,
  E2E_ORPHAN_EMAIL: orphan.email,
  E2E_ORPHAN_PASSWORD: orphan.password,
};

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('npm', ['run', 'migrate', '-w', '@pos/api']);
run('npm', [
  'run',
  'provision',
  '-w',
  '@pos/api',
  '--',
  '--name',
  'Tamales E2E',
  '--email',
  owner.email,
]);
// El segundo usuario existe en el proveedor de identidad pero no tiene tienda (cuenta bloqueada).
run('npx', [
  'playwright',
  'test',
  '--config',
  'apps/web/playwright.config.ts',
  ...process.argv.slice(2),
]);
