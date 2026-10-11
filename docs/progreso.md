# Progreso

Registro vivo del trabajo. Se revisa antes de empezar cualquier tarea y se actualiza al terminar o corregir algo.

**Estatus:** `Terminado`, `Corrección` (terminado pero con ajustes por hacer), `En curso`, `Pendiente`.
**Última actualización:** 2026-10-11.

## Resumen por fase

| Fase | Descripción | Estatus |
|---|---|---|
| Planeación | Análisis, decisiones y documentación | Terminado |
| Fase 0 | Fundaciones | Terminado |
| Fase 1 | Identidad, tenant y auditoría base (solo API) | Terminado (PR pendiente de aprobación) |
| Fase 2 | Catálogo de productos | Pendiente |
| Fase 3 | Jornada y disponibilidad diaria | Pendiente |
| Fase 4 | Ventas | Pendiente |
| Fase 5 | Pagos y pendientes | Pendiente |
| Fase 6 | Cancelación de ventas | Pendiente |
| Fase 7 | Historial, dashboard y reportes | Pendiente |
| Fase 8 | Frontend, accesibilidad y E2E (en pausa hasta tener el diseño) | Pendiente |
| Fase 9 | Despliegue (requiere aprobación) | Pendiente |

## Tareas realizadas

| ID | Tarea | Estatus | Resumen | Archivos | Rama / PR |
|---|---|---|---|---|---|
| T-001 | Análisis de los requerimientos | Terminado | Lectura completa del documento; se identificaron huecos y ambigüedades que originaron las decisiones B1 a B15. | `docs/decisiones.md` | (sin código) |
| T-002 | Creación de `main` y `dev` | Terminado | Commit inicial con README y `.gitignore`; `dev` creada desde `main`. | `README.md`, `.gitignore` | `main`, `dev` |
| T-003 | Documentación inicial | Terminado | Requerimientos, decisiones (con política de migraciones), dominio (modelo, flujos, métricas) y plan por fases con trazabilidad. Decisiones D1 a D5 y B1 a B15 aprobadas. | `docs/requerimientos.md`, `docs/decisiones.md`, `docs/dominio.md`, `docs/plan.md`, `README.md` | `docs/documentacion-inicial-20261011`, PR #1 fusionado en `dev` |
| T-004 | `CLAUDE.md` y documento de progreso | Terminado | Reglas del proyecto para el asistente y este registro; T3 a T11 marcadas como aprobadas y regla W7 agregada. | `CLAUDE.md`, `docs/progreso.md`, `docs/decisiones.md` | `docs/claude-md-progreso-20261011`, PR #2 fusionado en `dev` |
| T-010 | Monorepo y tooling | Terminado | npm workspaces (`apps/api`, `apps/web`, `packages/shared`), TypeScript estricto, ESLint (con reglas de React Hooks), Prettier, Vitest, `.editorconfig`, `.nvmrc`. `npm run check` pasa. | `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.nvmrc`, `package-lock.json` | `feat/fundaciones-20261011`, PR #3 fusionado en `dev` |
| T-011 | Base de datos local y migraciones | Terminado | PostgreSQL 16 vía `docker-compose.yml` (con base de pruebas), `node-pg-migrate` con SQL puro, migración `baseline` (función `set_updated_at`), tipos de Kysely generados. Migración aplicada y verificada contra PostgreSQL 16 local. | `docker-compose.yml`, `docker/init/01-create-test-db.sql`, `.env.example`, `apps/api/migrations/1760140800000_baseline.sql`, `apps/api/src/db/types.ts`, `apps/api/src/db/client.ts` | `feat/fundaciones-20261011`, PR #3 fusionado en `dev` |
| T-012 | Esqueleto de API y web | Terminado | API Fastify con `buildApp` separado del servidor, rutas `/api/health` y `/api/health/ready`, configuración validada, `x-request-id` y manejo central de errores sin detalles internos. Web React + Tailwind con indicador de conexión (retirada después: ver T-024). Esquemas de salud compartidos. 12 pruebas unitarias y 3 de integración en verde. | `apps/api/src/*`, `apps/api/test/*`, `apps/web/src/*`, `apps/web/vite.config.ts`, `packages/shared/src/*` | `feat/fundaciones-20261011`, PR #3 fusionado en `dev` |
| T-013 | CI y plantillas | Terminado | Flujo de GitHub Actions (lint, formato, tipos, pruebas, migraciones desde cero, tipos al día, integración, build y auditoría de dependencias de producción), Dependabot, plantilla de PR, comandos en README y `CLAUDE.md`. La CI corrió en verde en GitHub (`checks`, `audit` y GitGuardian) en el PR #3. | `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.github/pull_request_template.md`, `README.md`, `CLAUDE.md` | `feat/fundaciones-20261011`, PR #3 fusionado en `dev` |
| T-020 | Fase 1: esquema de tenants, usuarios y auditoría | Terminado | Migración con `tenants`, `store_settings`, `users`, `memberships` (un usuario, una tienda) y `audit_events`, con restricciones de integridad; tipos de Kysely regenerados. | `apps/api/migrations/1791700000000_tenancy_identity_audit.sql`, `apps/api/src/db/types.ts` | `feat/identidad-tenant-20261011` |
| T-021 | Fase 1: autenticación, sesión y contexto de tienda (API) | Terminado | Puerto `IdentityProvider` con proveedor local (JWT HS256), cookies `HttpOnly`/`SameSite=Strict`, renovación y cierre de sesión, `GET /api/me`, plugin que deriva el tenant solo de la identidad (403 sin tienda o con tienda desactivada), verificación de origen y errores centralizados. | `apps/api/src/modules/auth/*`, `apps/api/src/modules/tenancy/context.ts`, `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/errors.ts`, `apps/api/src/validation.ts` | `feat/identidad-tenant-20261011` |
| T-022 | Fase 1: configuración de tienda, auditoría y alta manual (API) | Terminado | `GET`/`PATCH /api/store` con validación completa, repositorio acotado al tenant y auditoría en la misma transacción; comando `npm run provision` y utilidad de pruebas con dos tenants (`createTwoTenants`). | `apps/api/src/modules/store/*`, `apps/api/src/modules/audit/audit.ts`, `apps/api/src/modules/tenancy/provision.ts`, `apps/api/src/scripts/provision-tenant.ts`, `apps/api/test/support/app.ts`, `packages/shared/src/*` | `feat/identidad-tenant-20261011` |
| T-023 | Fase 1: pantallas de acceso y configuración (web) | Revertido (T-024) | Inicio de sesión, estados de cuenta sin tienda/tienda desactivada/servidor caído, renovación automática y regreso al login al expirar, inicio, y edición de la configuración de la tienda con validación en cliente y errores por campo. Revisado a 360 px sin desborde horizontal. | `apps/web/src/*` | `feat/identidad-tenant-20261011` |
| T-024 | Retiro del frontend (W8) | Terminado | A petición del propietario, que aún no tiene el diseño: se eliminó todo `apps/web` (pantallas de la fase 1 y esqueleto de la fase 0) y su tooling (Vite, Tailwind, React Router, Testing Library, reglas de React Hooks, scripts `dev:web` y `build`, paso de build en la CI). Se conservan la API y `packages/shared`. | `apps/web/*` (eliminado), `package.json`, `eslint.config.js`, `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`, `docs/decisiones.md`, `docs/plan.md` | `feat/identidad-tenant-20261011` |
| T-025 | Higiene de credenciales (alertas de GitGuardian) | Terminado | Se quitaron contraseñas escritas en el repositorio: PostgreSQL local y de la CI con autenticación `trust` (el puerto local solo en `127.0.0.1`), URLs sin contraseña, `.env.example` sin secretos de ejemplo y pruebas con secretos y contraseñas aleatorias por ejecución. Se verificó que el historial no contiene secretos reales (claves de nube, tokens, llaves privadas). | `docker-compose.yml`, `.github/workflows/ci.yml`, `.env.example`, `apps/api/test/*`, `apps/api/src/config.test.ts`, `CLAUDE.md` | `feat/identidad-tenant-20261011` |

## Tareas por hacer

| ID | Tarea | Estatus | Alcance previsto |
|---|---|---|---|
| T-030 | Fase 2: catálogo | Pendiente | Ver `docs/plan.md`. |
| T-040 | Fase 3: jornada y disponibilidad diaria | Pendiente | Ver `docs/plan.md`. |
| T-050 | Fase 4: ventas | Pendiente | Ver `docs/plan.md`. |
| T-060 | Fase 5: pagos y pendientes | Pendiente | Ver `docs/plan.md`. |
| T-070 | Fase 6: cancelación de ventas | Pendiente | Ver `docs/plan.md`. |
| T-080 | Fase 7: historial, dashboard y reportes | Pendiente | Ver `docs/plan.md`. |
| T-090 | Fase 8: frontend, accesibilidad y E2E | Pendiente | Requiere el diseño del propietario (W8). Ver `docs/plan.md`. |
| T-100 | Fase 9: despliegue AWS | Pendiente | Requiere aprobación y topes de costo. |

## Correcciones y observaciones

- Docker no está disponible en el entorno de desarrollo de esta sesión; `docker-compose.yml` solo se validó como YAML. La base de pruebas se probó con PostgreSQL 16 local.
- La API aún no tiene paso de construcción (`build`): el empaquetado para Lambda se hace en la fase 9. La CI valida la API con `typecheck` y pruebas.
- `npm audit` completo reporta 3 avisos altos en `braces` (dependencia de desarrollo de `kysely-codegen`); no afecta al código de producción y `npm audit --omit=dev` está limpio.
- Versiones fijadas por compatibilidad (T14): TypeScript `~6.0`.
- Fase 1, pendiente para la fase 9: implementar el proveedor de Cognito (la interfaz ya existe), revocar el token de renovación al cerrar sesión y limitar intentos de inicio de sesión (hoy lo haría Cognito).
- Fase 1: los intentos de inicio de sesión fallidos solo quedan en logs técnicos (T19); RF-008 se cumple para los inicios exitosos.
- Fase 1: la prueba con navegador real (Playwright) queda para la fase 8, cuando exista el frontend.
- GitGuardian notificó 3 incidentes sobre el código fusionado en `dev`. No se pudieron ver en su panel; la hipótesis es que son contraseñas de ejemplo (`pos:pos`) en `.env.example`, `.github/workflows/ci.yml`, `docker-compose.yml` y `apps/api/test/global-setup.ts`. T-025 las elimina; falta marcar los incidentes como resueltos en el panel (lo hace el propietario).
