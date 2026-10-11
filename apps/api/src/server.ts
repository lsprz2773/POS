import { sql } from 'kysely';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);

const app = buildApp({
  logger: true,
  checkDatabase: async () => {
    await sql`select 1`.execute(db);
  },
});

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Cerrando servidor');
  await app.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
