# POS

Aplicación web para administrar ventas, pagos, inventario diario y reportes de un pequeño negocio.

Estado: planeación inicial. La documentación y el código se agregarán por fases.

## Ramas

- `main`: versión estable. Solo recibe fases validadas mediante PR desde `dev`.
- `dev`: integración y pruebas.
- `<caso>/<descripcion-breve-AAAAMMDD>`: una rama por fase o tarea, creada desde `dev` (`feat`, `fix`, `docs`, `chore`, `test`, `refactor`).

## Desarrollo local

Requisitos: Node 22 (`.nvmrc`), npm y Docker (o un PostgreSQL 16 propio).

```
npm install
cp .env.example .env     # completa AUTH_SECRET (openssl rand -hex 32) y LOCAL_AUTH_USERS
npm run db:up            # PostgreSQL 16 en contenedor, solo accesible desde tu máquina
npm run db:migrate       # aplica las migraciones
npm run provision -w @pos/api -- --name "Mi tienda" --email dueno@ejemplo.test
npm run dev              # API en :3000
npm run dev:web          # web en :5173 (reenvía /api al API local)
```

Para iniciar sesión se usa `POST /api/auth/login` con un usuario de `LOCAL_AUTH_USERS`; su correo debe coincidir con el del `provision`.

| Comando | Qué hace |
|---|---|
| `npm run check` | Lint, formato, tipos y pruebas unitarias |
| `npm run test:e2e` | Pruebas de extremo a extremo en Chromium (móvil y escritorio) con una base propia `pos_e2e`; en el contenedor de desarrollo, `PW_CHROMIUM_PATH` apunta al navegador instalado, y en otro equipo hace falta `npx playwright install chromium` |
| `npm run build` | Construye la web |
| `npm run test:integration` | Pruebas contra PostgreSQL (recrea la base `pos_test`) |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:types` | Regenera los tipos de Kysely desde la base migrada |
| `npm run provision -w @pos/api -- --name "Tienda" --email dueno@correo.com` | Alta manual de una tienda y su propietario |
| `npm run -w @pos/api migrate:create -- nombre` | Crea una migración nueva |

## Documentación

- [`docs/requerimientos.md`](docs/requerimientos.md): requisitos del MVP (fuente de verdad).
- [`docs/decisiones.md`](docs/decisiones.md): decisiones aprobadas, propuestas y preguntas abiertas.
- [`docs/dominio.md`](docs/dominio.md): modelo conceptual, reglas, flujos y definición de métricas.
- [`docs/plan.md`](docs/plan.md): fases, criterios de aceptación y trazabilidad con los requisitos.
- [`docs/progreso.md`](docs/progreso.md): registro de tareas realizadas y por hacer.
- [`docs/manual-usuario.md`](docs/manual-usuario.md): manual de usuario (parte común, propietario y vendedor) con capturas en `docs/img/manual/`, que se regeneran con `npm run manual:capturas` (necesita PostgreSQL, Chromium de Playwright y Pillow).

Las reglas de trabajo para el asistente están en [`CLAUDE.md`](CLAUDE.md).
