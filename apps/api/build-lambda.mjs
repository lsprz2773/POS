// Empaqueta la API para Lambda en un solo archivo (sin node_modules). SAM sube `dist-lambda/`.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/lambda.ts'],
  outfile: 'dist-lambda/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: false,
  sourcemap: false,
  // `pg` carga el enlace nativo solo si existe; en Lambda no se usa.
  // El SDK v3 de AWS viene incluido en el entorno de ejecución de Node 22 de Lambda.
  external: ['pg-native', '@aws-sdk/*'],
  // Algunas dependencias son CommonJS y necesitan `require` dentro de un módulo ESM.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
