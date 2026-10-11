# Progreso

Registro vivo del trabajo. Se revisa antes de empezar cualquier tarea y se actualiza al terminar o corregir algo.

**Estatus:** `Terminado`, `Corrección` (terminado pero con ajustes por hacer), `En curso`, `Pendiente`.
**Última actualización:** 2026-10-11.

## Resumen por fase

| Fase | Descripción | Estatus |
|---|---|---|
| Planeación | Análisis, decisiones y documentación | Terminado |
| Fase 0 | Fundaciones | Terminado (PR #3 pendiente de fusión) |
| Fase 1 | Identidad, tenant y auditoría base | Pendiente |
| Fase 2 | Catálogo de productos | Pendiente |
| Fase 3 | Jornada y disponibilidad diaria | Pendiente |
| Fase 4 | Ventas | Pendiente |
| Fase 5 | Pagos y pendientes | Pendiente |
| Fase 6 | Cancelación de ventas | Pendiente |
| Fase 7 | Historial, dashboard y reportes | Pendiente |
| Fase 8 | Móvil, accesibilidad y E2E | Pendiente |
| Fase 9 | Despliegue (requiere aprobación) | Pendiente |

## Tareas realizadas

| ID | Tarea | Estatus | Resumen | Archivos | Rama / PR |
|---|---|---|---|---|---|
| T-001 | Análisis de los requerimientos | Terminado | Lectura completa del documento; se identificaron huecos y ambigüedades que originaron las decisiones B1 a B15. | `docs/decisiones.md` | (sin código) |
| T-002 | Creación de `main` y `dev` | Terminado | Commit inicial con README y `.gitignore`; `dev` creada desde `main`. | `README.md`, `.gitignore` | `main`, `dev` |
| T-003 | Documentación inicial | Terminado | Requerimientos, decisiones (con política de migraciones), dominio (modelo, flujos, métricas) y plan por fases con trazabilidad. Decisiones D1 a D5 y B1 a B15 aprobadas. | `docs/requerimientos.md`, `docs/decisiones.md`, `docs/dominio.md`, `docs/plan.md`, `README.md` | `docs/documentacion-inicial-20261011`, PR #1 fusionado en `dev` |
| T-004 | `CLAUDE.md` y documento de progreso | Terminado | Reglas del proyecto para el asistente y este registro; T3 a T11 marcadas como aprobadas y regla W7 agregada. | `CLAUDE.md`, `docs/progreso.md`, `docs/decisiones.md` | `docs/claude-md-progreso-20261011`, PR #2 abierto (pendiente de fusión) |
| T-010 | Monorepo y tooling | Terminado | npm workspaces (`apps/api`, `apps/web`, `packages/shared`), TypeScript estricto, ESLint (con reglas de React Hooks), Prettier, Vitest, `.editorconfig`, `.nvmrc`. `npm run check` pasa. | `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.nvmrc`, `package-lock.json` | `feat/fundaciones-20261011`, PR #3 abierto |
| T-011 | Base de datos local y migraciones | Terminado | PostgreSQL 16 vía `docker-compose.yml` (con base de pruebas), `node-pg-migrate` con SQL puro, migración `baseline` (función `set_updated_at`), tipos de Kysely generados. Migración aplicada y verificada contra PostgreSQL 16 local. | `docker-compose.yml`, `docker/init/01-create-test-db.sql`, `.env.example`, `apps/api/migrations/1760140800000_baseline.sql`, `apps/api/src/db/types.ts`, `apps/api/src/db/client.ts` | `feat/fundaciones-20261011`, PR #3 abierto |
| T-012 | Esqueleto de API y web | Terminado | API Fastify con `buildApp` separado del servidor, rutas `/api/health` y `/api/health/ready`, configuración validada, `x-request-id` y manejo central de errores sin detalles internos. Web React + Tailwind con indicador de conexión y `/api` reenviado en desarrollo (verificado). Esquemas de salud compartidos. 12 pruebas unitarias y 3 de integración en verde. | `apps/api/src/*`, `apps/api/test/*`, `apps/web/src/*`, `apps/web/vite.config.ts`, `packages/shared/src/*` | `feat/fundaciones-20261011`, PR #3 abierto |
| T-013 | CI y plantillas | Terminado | Flujo de GitHub Actions (lint, formato, tipos, pruebas, migraciones desde cero, tipos al día, integración, build y auditoría de dependencias de producción), Dependabot, plantilla de PR, comandos en README y `CLAUDE.md`. La CI corrió en verde en GitHub (`checks`, `audit` y GitGuardian) en el PR #3. | `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.github/pull_request_template.md`, `README.md`, `CLAUDE.md` | `feat/fundaciones-20261011`, PR #3 abierto |
| T-026 | Prompt de diseño del frontend | Terminado | Inventario de 16 vistas, 8 modales u hojas, 8 familias de estados (carga con spinners y skeletons, vacío, error, conectividad, éxito, avisos, sesión, interacción), reglas UI/UX estrictas y estilo glassmorphism (Liquid Glass) con reglas de legibilidad WCAG AA. Sin código; el frontend sigue en pausa (W8) hasta recibir el diseño. | `docs/diseno/prompt-diseno.md`, `docs/plan.md`, `docs/progreso.md` | `docs/prompt-diseno-frontend-20261011` |
| T-027 | Diseño del frontend aprobado | Terminado | El propietario aprobó el diseño (vidrio translúcido, 16 vistas móvil y escritorio, 8 modales, estados, prototipo y notas de accesibilidad). Queda guardado como lienzo en claude.ai y enlazado en la documentación. El frontend sigue en pausa hasta la fase 8. | `docs/diseno/prompt-diseno.md`, `docs/progreso.md` | `docs/prompt-diseno-frontend-20261011` |

## Tareas por hacer

| ID | Tarea | Estatus | Alcance previsto |
|---|---|---|---|
| T-020 | Fase 1: identidad, tenant, auditoría, configuración de tienda | Pendiente | Ver `docs/plan.md`. |
| T-030 | Fase 2: catálogo | Pendiente | Ver `docs/plan.md`. |
| T-040 | Fase 3: jornada y disponibilidad diaria | Pendiente | Ver `docs/plan.md`. |
| T-050 | Fase 4: ventas | Pendiente | Ver `docs/plan.md`. |
| T-060 | Fase 5: pagos y pendientes | Pendiente | Ver `docs/plan.md`. |
| T-070 | Fase 6: cancelación de ventas | Pendiente | Ver `docs/plan.md`. |
| T-080 | Fase 7: historial, dashboard y reportes | Pendiente | Ver `docs/plan.md`. |
| T-090 | Fase 8: móvil, accesibilidad y E2E | Pendiente | Ver `docs/plan.md`. |
| T-100 | Fase 9: despliegue AWS | Pendiente | Requiere aprobación y topes de costo. |

## Correcciones y observaciones

- Docker no está disponible en el entorno de desarrollo de esta sesión; `docker-compose.yml` solo se validó como YAML. La base de pruebas se probó con PostgreSQL 16 local.
- La API aún no tiene paso de construcción (`build`): el empaquetado para Lambda se hace en la fase 9. La CI valida la API con `typecheck` y pruebas.
- `npm audit` completo reporta 3 avisos altos en `braces` (dependencia de desarrollo de `kysely-codegen`); no afecta al código de producción y `npm audit --omit=dev` está limpio.
- Versiones fijadas por compatibilidad (T14): TypeScript `~6.0` y jsdom 29.
