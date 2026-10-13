import { parseArgs } from 'node:util';
import { createDb } from '../db/client';
import { provisionTenant, ProvisionError } from '../modules/tenancy/provision';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    email: { type: 'string' },
    subject: { type: 'string' },
  },
});

if (!values.name || !values.email) {
  console.error(
    'Uso: npm run provision -w @pos/api -- --name "Mi tienda" --email dueno@correo.com [--subject <sub>]\n' +
      'Con el proveedor local, --subject es opcional (se usa local:<correo>).',
  );
  process.exit(1);
}

// Solo necesita la base de datos: sirve igual contra la local que contra Neon, sin proveedor de identidad.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}
const email = values.email.trim().toLowerCase();
const db = createDb(databaseUrl);
try {
  const result = await provisionTenant(db, {
    storeName: values.name,
    email,
    identitySubject: values.subject ?? `local:${email}`,
  });
  console.log(`Tienda creada. tenant=${result.tenantId} user=${result.userId}`);
} catch (error) {
  console.error(error instanceof ProvisionError ? error.message : 'No se pudo crear la tienda.');
  process.exitCode = 1;
} finally {
  await db.destroy();
}
