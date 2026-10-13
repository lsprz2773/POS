import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    /** En Lambda se deja vacía y se lee de Parameter Store (`DATABASE_URL_PARAM`). */
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_URL_PARAM: z.string().min(1).optional(),
    /** Único origen del navegador autorizado a enviar solicitudes que modifican datos. */
    APP_ORIGIN: z.url().default('http://localhost:5173'),
    AUTH_PROVIDER: z.enum(['local', 'cognito']).default('local'),
    COGNITO_REGION: z.string().min(1).optional(),
    COGNITO_USER_POOL_ID: z.string().min(1).optional(),
    COGNITO_CLIENT_ID: z.string().min(1).optional(),
    /** Solo para el proveedor local de desarrollo. */
    AUTH_SECRET: z.string().min(32).optional(),
    LOCAL_AUTH_USERS: z.string().optional(),
    ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TTL_SECONDS: z.coerce.number().int().min(300).default(604_800),
  })
  .superRefine((value, ctx) => {
    if (!value.DATABASE_URL && !value.DATABASE_URL_PARAM) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Requerida.' });
    }
    if (value.AUTH_PROVIDER === 'cognito') {
      for (const name of ['COGNITO_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'] as const) {
        if (!value[name]) ctx.addIssue({ code: 'custom', path: [name], message: 'Requerida.' });
      }
    }
    if (value.AUTH_PROVIDER === 'local') {
      if (value.NODE_ENV === 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_PROVIDER'],
          message: 'No usar en producción.',
        });
      }
      if (!value.AUTH_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['AUTH_SECRET'], message: 'Requerida.' });
      }
    }
  });

export type Config = z.infer<typeof schema>;

/** Lee y valida la configuración. El error nombra las variables inválidas, nunca sus valores. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(`Configuración inválida. Revisa las variables: ${names}`);
  }
  return result.data;
}

/** Cadena de conexión para los procesos locales (servidor de desarrollo y scripts). */
export function localDatabaseUrl(config: Config): string {
  if (!config.DATABASE_URL)
    throw new Error('Configuración inválida. Revisa las variables: DATABASE_URL');
  return config.DATABASE_URL;
}
