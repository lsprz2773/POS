# Progreso

Registro vivo del trabajo. Se revisa antes de empezar cualquier tarea y se actualiza al terminar o corregir algo.

**Estatus:** `Terminado`, `Corrección` (terminado pero con ajustes por hacer), `En curso`, `Pendiente`.
**Última actualización:** 2026-10-11.

## Resumen por fase

| Fase | Descripción | Estatus |
|---|---|---|
| Planeación | Análisis, decisiones y documentación | Terminado |
| Fase 0 | Fundaciones | Pendiente |
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
| T-004 | `CLAUDE.md` y documento de progreso | En curso | Reglas del proyecto para el asistente y este registro; T3 a T11 marcadas como aprobadas y regla W7 agregada. | `CLAUDE.md`, `docs/progreso.md`, `docs/decisiones.md` | `docs/claude-md-progreso-20261011` (PR pendiente de aprobación) |

## Tareas por hacer

| ID | Tarea | Estatus | Alcance previsto |
|---|---|---|---|
| T-010 | Monorepo y tooling | Pendiente | Estructura `apps/web`, `apps/api`, `packages/shared`; TypeScript, lint, formato, Vitest. |
| T-011 | Base de datos local y migraciones | Pendiente | PostgreSQL en contenedor, `node-pg-migrate`, migración inicial, generación de tipos con Kysely. |
| T-012 | Esqueleto de API y web | Pendiente | Fastify con ruta de salud, app React mínima, reenvío de `/api` en desarrollo. |
| T-013 | CI | Pendiente | GitHub Actions: instalación, lint, tipos, pruebas y migraciones desde cero; plantilla de PR; actualizar comandos en `CLAUDE.md`. |
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

Ninguna por ahora.
