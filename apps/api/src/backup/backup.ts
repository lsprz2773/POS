import { gunzipSync, gzipSync } from 'node:zlib';
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client';
import type { DB } from '../db/types';

/**
 * Respaldo lógico de toda la base (fase 9c). Cada fila de cada tabla va como una línea JSON
 * (`to_jsonb`), en el orden en que las llaves foráneas permiten volver a insertarlas; el archivo se
 * comprime con gzip. Restaurar es insertar esas filas en una base ya migrada y vacía.
 */
export const BACKUP_FORMAT = 'pos-backup-1';

export interface BackupHeader {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  lastMigration: string | null;
  tables: string[];
}

type Trx = Transaction<DB>;

/** Tablas de datos (sin la bitácora de migraciones), ordenadas para que cada una vaya tras las que referencia. */
export async function orderedTables(db: Database | Trx): Promise<string[]> {
  const tables = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'pgmigrations'`.execute(
    db as Database,
  );
  const names = tables.rows.map((r) => r.name).sort();
  const edges = await sql<{ child: string; parent: string }>`
    select c.relname as child, p.relname as parent
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where k.contype = 'f' and n.nspname = 'public' and c.oid <> p.oid`.execute(db as Database);

  const parents = new Map(names.map((n) => [n, new Set<string>()]));
  for (const { child, parent } of edges.rows) parents.get(child)?.add(parent);

  const ordered: string[] = [];
  const done = new Set<string>();
  while (ordered.length < names.length) {
    const ready = names.filter(
      (n) =>
        !done.has(n) && [...(parents.get(n) ?? [])].every((p) => done.has(p) || !parents.has(p)),
    );
    if (ready.length === 0)
      throw new Error('Ciclo de llaves foráneas: no se puede ordenar el respaldo.');
    for (const n of ready) {
      ordered.push(n);
      done.add(n);
    }
  }
  return ordered;
}

async function lastMigration(db: Database | Trx): Promise<string | null> {
  const result = await sql<{ name: string }>`
    select name from pgmigrations order by id desc limit 1`.execute(db as Database);
  return result.rows[0]?.name ?? null;
}

export interface BackupResult {
  file: Buffer;
  rows: number;
  tables: Record<string, number>;
  header: BackupHeader;
}

/** Exporta la base en una sola transacción de lectura, de modo que el archivo sea una foto consistente. */
export async function createBackup(db: Database, now: Date = new Date()): Promise<BackupResult> {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (trx) => {
      await sql`set transaction read only`.execute(trx);
      const tables = await orderedTables(trx);
      const header: BackupHeader = {
        format: BACKUP_FORMAT,
        createdAt: now.toISOString(),
        lastMigration: await lastMigration(trx),
        tables,
      };
      const lines: string[] = [JSON.stringify(header)];
      const counts: Record<string, number> = {};
      let rows = 0;
      for (const table of tables) {
        const result = await sql<{ r: unknown }>`
        select to_jsonb(t) as r from ${sql.table(table)} t`.execute(trx);
        counts[table] = result.rows.length;
        rows += result.rows.length;
        for (const row of result.rows) lines.push(JSON.stringify({ t: table, r: row.r }));
      }
      return {
        file: gzipSync(Buffer.from(lines.join('\n') + '\n', 'utf8')),
        rows,
        tables: counts,
        header,
      };
    });
}

export class RestoreError extends Error {}

/** Las columnas de identidad se restauran con su valor original; la secuencia debe seguir desde el máximo. */
async function resyncIdentities(trx: Trx) {
  const columns = await sql<{ table: string; column: string }>`
    select table_name as "table", column_name as "column" from information_schema.columns
    where table_schema = 'public' and is_identity = 'YES'`.execute(trx as unknown as Database);
  for (const { table, column } of columns.rows) {
    await sql`
      select setval(
        pg_get_serial_sequence(${`"${table}"`}, ${column}),
        coalesce(max(${sql.ref(column)}), 1),
        max(${sql.ref(column)}) is not null
      ) from ${sql.table(table)}`.execute(trx);
  }
}

const BATCH = 500;

/**
 * Restaura un respaldo en una base que ya tiene el esquema (todas las migraciones aplicadas) y
 * ninguna fila de datos. Todo ocurre en una transacción: si algo falla, no queda nada a medias.
 */
export async function restoreBackup(db: Database, file: Buffer): Promise<Record<string, number>> {
  const lines = gunzipSync(file).toString('utf8').split('\n').filter(Boolean);
  const header = JSON.parse(lines[0] ?? '{}') as BackupHeader;
  if (header.format !== BACKUP_FORMAT)
    throw new RestoreError('El archivo no es un respaldo de POS.');

  return db.transaction().execute(async (trx) => {
    const current = await lastMigration(trx);
    if (current !== header.lastMigration) {
      throw new RestoreError(
        `El esquema no coincide: el respaldo es de la migración ${header.lastMigration} y la base está en ${current}.`,
      );
    }
    for (const table of await orderedTables(trx)) {
      const count = await sql<{
        n: string;
      }>`select count(*)::text as n from ${sql.table(table)}`.execute(trx);
      if (count.rows[0]?.n !== '0') {
        throw new RestoreError(`La base de destino no está vacía (tabla ${table}).`);
      }
    }

    const restored: Record<string, number> = {};
    let table: string | null = null;
    let batch: unknown[] = [];
    const flush = async () => {
      if (table && batch.length > 0) {
        await sql`
          insert into ${sql.table(table)} overriding system value
          select * from jsonb_populate_recordset(null::${sql.table(table)}, ${JSON.stringify(batch)}::jsonb)`.execute(
          trx,
        );
        restored[table] = (restored[table] ?? 0) + batch.length;
      }
      batch = [];
    };
    for (const line of lines.slice(1)) {
      const { t, r } = JSON.parse(line) as { t: string; r: unknown };
      if (!header.tables.includes(t))
        throw new RestoreError(`Tabla desconocida en el respaldo: ${t}.`);
      if (t !== table || batch.length >= BATCH) {
        await flush();
        table = t;
      }
      batch.push(r);
    }
    await flush();
    await resyncIdentities(trx);
    return restored;
  });
}
