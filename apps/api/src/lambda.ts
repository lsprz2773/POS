import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import awsLambdaFastify from '@fastify/aws-lambda';
import { sql } from 'kysely';
import { buildApp, type AppOptions } from './app';
import { loadConfig, type Config } from './config';
import { createDb, type Database } from './db/client';
import { createIdentity } from './identity';

/** Lee la cadena de conexión de Parameter Store (SecureString); nunca viaja en variables de la plantilla. */
async function databaseUrlOf(config: Config): Promise<string> {
  if (config.DATABASE_URL) return config.DATABASE_URL;
  const ssm = new SSMClient({});
  const result = await ssm.send(
    new GetParameterCommand({ Name: config.DATABASE_URL_PARAM!, WithDecryption: true }),
  );
  const value = result.Parameter?.Value;
  if (!value) throw new Error('El parámetro de la base de datos está vacío.');
  return value;
}

/** Pool pequeño: cada instancia de Lambda atiende una solicitud a la vez y Neon limita conexiones. */
export const LAMBDA_POOL_SIZE = 2;

export async function createHandler(overrides: Partial<AppOptions> & { db?: Database } = {}) {
  const config = loadConfig();
  const db = overrides.db ?? createDb(await databaseUrlOf(config), LAMBDA_POOL_SIZE);
  const { identity, directory } = createIdentity(config);
  const app = buildApp({
    db,
    identity,
    directory,
    config,
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    checkDatabase: async () => {
      await sql`select 1`.execute(db);
    },
    ...overrides,
  });
  // Las cookies llegan en `cookies` (carga útil 2.0 de API Gateway); el adaptador las convierte.
  return awsLambdaFastify(app, { decorateRequest: false });
}

// La inicialización ocurre una vez por instancia (arranque en frío) y se reutiliza después.
let ready: ReturnType<typeof createHandler> | undefined;

type LambdaEvent = {
  headers?: Record<string, string | undefined>;
  requestContext?: { requestId?: string };
};

export const handler = async (event: LambdaEvent, context: unknown) => {
  ready ??= createHandler();
  // El contador de solicitudes de Fastify se repite entre instancias: se usa el identificador de
  // API Gateway, que el usuario puede citar a soporte y aparece en los registros.
  const requestId = (event as { requestContext?: { requestId?: string } }).requestContext
    ?.requestId;
  if (requestId && !event.headers?.['x-request-id']) {
    event.headers = { ...event.headers, 'x-request-id': requestId };
  }
  try {
    return await (
      await ready
    )(event as never, context as never);
  } catch (error) {
    // Si el arranque falló, la siguiente solicitud lo reintenta en lugar de quedar rota.
    ready = undefined;
    throw error;
  }
};
