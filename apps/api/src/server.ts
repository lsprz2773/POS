import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { createLocalIdentityProvider } from './modules/auth/local-identity-provider';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);

const identity = createLocalIdentityProvider({
  secret: config.AUTH_SECRET!,
  usersJson: config.LOCAL_AUTH_USERS,
  accessTtlSeconds: config.ACCESS_TTL_SECONDS,
  refreshTtlSeconds: config.REFRESH_TTL_SECONDS,
});

const app = buildApp({ db, identity, config, logger: true });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Cerrando servidor');
  await app.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
