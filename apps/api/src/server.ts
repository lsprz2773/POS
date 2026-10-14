import { buildApp } from './app';
import { loadConfig, localDatabaseUrl } from './config';
import { createDb } from './db/client';
import { createIdentity } from './identity';

const config = loadConfig();
const db = createDb(localDatabaseUrl(config));

const { identity, directory } = createIdentity(config);

const app = buildApp({ db, identity, directory, config, logger: true });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Cerrando servidor');
  await app.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
