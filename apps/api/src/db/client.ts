import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './types';

export type Database = Kysely<DB>;

export function createDb(connectionString: string, maxConnections = 5): Database {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: maxConnections }) }),
  });
}
