import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { restoreBackup, RestoreError } from '../backup/backup';
import { createDb } from '../db/client';

const { values } = parseArgs({ options: { file: { type: 'string' } } });
const databaseUrl = process.env.DATABASE_URL;
if (!values.file || !databaseUrl) {
  console.error(
    'Uso: DATABASE_URL=<base de destino, ya migrada y vacía> npm run restore -w @pos/api -- --file respaldo.ndjson.gz',
  );
  process.exit(1);
}

const db = createDb(databaseUrl, 1);
try {
  const restored = await restoreBackup(db, readFileSync(values.file));
  for (const [table, rows] of Object.entries(restored)) console.log(`${table}: ${rows} filas`);
  console.log('Respaldo restaurado.');
} catch (error) {
  console.error(
    error instanceof RestoreError ? error.message : 'No se pudo restaurar el respaldo.',
  );
  process.exitCode = 1;
} finally {
  await db.destroy();
}
