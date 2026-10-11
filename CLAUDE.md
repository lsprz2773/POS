# CLAUDE.md

Aplicación web multitenant para administrar ventas, pagos, inventario diario y reportes de un pequeño negocio. Hoy hay un solo usuario real (el propietario), pero el diseño debe permitir más tiendas.

## Antes de cualquier tarea

1. Lee [docs/progreso.md](docs/progreso.md) para saber en qué punto estamos.
2. Revisa [docs/plan.md](docs/plan.md) (fase vigente y criterios de aceptación) y [docs/decisiones.md](docs/decisiones.md) (lo aprobado).
3. Al terminar o corregir algo, actualiza `docs/progreso.md` en la misma rama. Una tarea sin registro no está terminada.

## Fuentes de verdad

| Tema | Documento |
|---|---|
| Qué se debe construir (RF, RNF, reglas de negocio) | [docs/requerimientos.md](docs/requerimientos.md) |
| Decisiones aprobadas y preguntas abiertas | [docs/decisiones.md](docs/decisiones.md) |
| Modelo, invariantes, flujos y definición de métricas | [docs/dominio.md](docs/dominio.md) |
| Fases, aceptación y trazabilidad | [docs/plan.md](docs/plan.md) |
| Estado actual del trabajo | [docs/progreso.md](docs/progreso.md) |

Si algo del código contradice estos documentos, se corrige el código o se pregunta al propietario; no se reinterpreta en silencio. No se agrega funcionalidad que el documento de requerimientos no pida sin aprobación (prepara el diseño para escalar, pero no lo construyas antes de tiempo).

## Flujo de ramas (obligatorio)

- `main`: nunca se hace commit ni push directo. Solo recibe fases validadas por PR desde `dev`.
- `dev`: integración y pruebas.
- Una rama por fase o tarea, creada desde `dev`: `<caso>/<descripcion-breve-AAAAMMDD>` con `feat`, `fix`, `docs`, `chore`, `test` o `refactor`. Ejemplo: `feat/fundaciones-20261011`.
- Los PR se abren y se fusionan solo cuando el propietario lo aprueba.
- Mensajes de commit breves, en español, con prefijo del caso (`feat:`, `fix:`, `docs:`…).
- No hacer push a ninguna otra rama, y no reescribir historia de ramas ya publicadas.

## Reglas de dominio que no se negocian

- **Tenant:** sale siempre de la identidad autenticada en el backend; nunca de un valor enviado por el cliente. Todo repositorio filtra por tenant. Cada fase incluye una prueba de aislamiento entre dos tenants.
- **El backend manda** sobre totales, saldos, estados, inventario y fechas críticas. El frontend solo anticipa cálculos.
- **Dinero:** decimal exacto (2 posiciones), nunca `number`. **Cantidades:** decimal (3 posiciones), hoy solo enteras para productos sin fracciones.
- **Precio, costo y nombre** de cada renglón de venta se congelan al vender.
- **Nada se borra** para corregir: ventas se cancelan con motivo y pagos se anulan con motivo.
- **Idempotencia:** crear venta y registrar pago exigen `Idempotency-Key`.
- **Venta + inventario** (y pago + saldo) se confirman en una sola transacción.
- La utilidad es **bruta**; nunca se presenta como utilidad neta.
- Moneda y zona horaria son configuración de la tienda, no constantes en el código. El horario de jornada es configurable y solo informativo.

## Stack aprobado

React + TypeScript + Vite + Tailwind en `apps/web`; Node LTS + TypeScript + Fastify en `apps/api`; tipos y esquemas compartidos en `packages/shared`. PostgreSQL con el driver `pg`, consultas con Kysely (tipos generados desde el esquema) y migraciones con `node-pg-migrate`. Pruebas con Vitest, PostgreSQL real en contenedor y Playwright. Despliegue final en AWS (Lambda, API Gateway, Cognito, SAM) y Neon.

Arquitectura del backend: rutas → casos de uso → dominio puro → repositorios. El dominio no importa Fastify, el driver ni AWS.

## Migraciones

- Todo cambio de esquema es una migración versionada, revisada en el PR.
- Una migración ya integrada en `dev` no se edita; se corrige con otra nueva.
- Solo hacia adelante; los cambios destructivos se hacen por etapas.
- La CI aplica todas las migraciones desde cero. Los seeds de prueba van aparte y nunca a producción.
- No ejecutar migraciones al arrancar la Lambda.

## Costos, secretos y nube

- No crear, desplegar ni configurar recursos en la nube (AWS, Neon, dominios) sin aprobación explícita y topes de costo. Hasta la fase 9, todo corre en local.
- Nunca versionar secretos, tokens ni archivos `.env` reales; usar `.env.example`.
- El desarrollo local debe funcionar sin dominio ni servicios pagados (proveedor de identidad local; `/api` reenviado desde el servidor de desarrollo para compartir origen).

## Estilo y convenciones

- Interfaz y documentación en español de México; formato monetario MXN.
- Identificadores de código en inglés, siguiendo los nombres de [docs/dominio.md](docs/dominio.md).
- Comentarios solo donde el código no se explique solo; sin documentación redundante: si algo ya está en un documento, se enlaza.
- Mobile-first (desde 360 px) y accesibilidad WCAG 2.2 AA en los flujos principales.
- Validar toda entrada en el backend; errores sin stack traces ni secretos.

## Comandos

Se completan al terminar la fase 0 (instalar dependencias, levantar el entorno local, lint, tipos, pruebas, migraciones). Hasta entonces no hay comandos del proyecto.
