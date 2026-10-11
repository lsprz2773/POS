import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
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
