# Decisiones del proyecto

Registro único de decisiones. La fuente de requisitos es [requerimientos.md](requerimientos.md); aquí solo se anota lo que se decidió, se interpretó o sigue abierto.

**Estados:** `Aprobada` (la dio el propietario), `En requerimientos` (ya fijada por el documento), `Propuesta` (pendiente de aprobación; no se implementa hasta aprobarla).

## 1. Flujo de trabajo

| ID | Decisión | Estado |
|---|---|---|
| W1 | `main` es estable: nunca se hace push directo; solo recibe fases validadas mediante PR desde `dev`. | Aprobada |
| W2 | `dev` es la rama de integración y pruebas. | Aprobada |
| W3 | Una rama por fase o tarea, creada desde `dev`: `<caso>/<descripcion-breve-AAAAMMDD>` (`feat`, `fix`, `docs`, `chore`, `test`, `refactor`). | Aprobada |
| W4 | Los PR (hacia `dev` y hacia `main`) se abren solo cuando el propietario lo aprueba. | Aprobada |
| W5 | No se despliegan ni configuran recursos en la nube sin aprobación explícita y topes de costo. | Aprobada |
| W7 | Cada tarea se registra en [progreso.md](progreso.md): se revisa antes de empezar y se actualiza al terminar o corregir. | Aprobada |
| W8 | El frontend queda en pausa hasta que el propietario entregue el diseño. Mientras tanto cada fase entrega API, migraciones y pruebas; se retiró todo el código de `apps/web`. | Aprobada |

## 2. Decisiones de negocio

| ID | Decisión | Estado |
|---|---|---|
| B1 | Cantidades enteras hoy, pero el modelo guarda cantidades decimales y una unidad por producto para poder vender por peso o volumen sin migrar datos. | Aprobada |
| B2 | La venta tiene un campo opcional de texto libre `cliente/referencia`, sin módulo de clientes. | Aprobada |
| B3 | "Ventas" se corta por fecha de venta; "cobrado" por fecha de pago. La utilidad bruta es devengada (sobre ventas efectivas, cobradas o no). | Aprobada |
| B4 | Una venta confirmada no se edita. Un pago erróneo se anula con motivo (queda registrado). Una venta se cancela completa con motivo. | Aprobada |
| B5 | Precio fijo del catálogo en cada venta. Descuentos y precio libre quedan para una fase posterior. | Aprobada |
| B6 | El costo del producto es obligatorio al crearlo (puede ser 0). | Aprobada |
| B7 | Sin sobrepago: el pago no puede exceder el saldo. El cambio en efectivo no se modela; una calculadora visual de cambio es opcional y está fuera del documento de requerimientos. | Aprobada |
| B9 | La cantidad inicial de un día solo puede aumentarse (ajuste registrado) y nunca bajar de lo ya vendido. | Aprobada |
| B10 | El sistema admite los 7 días de la semana. Los días de operación son una configuración de la tienda (por omisión lunes a viernes, que es como la usará el propietario); sábado y domingo se pueden usar sin restricción. Las semanas de los reportes van de lunes a domingo, de modo que ningún total se pierde. | Aprobada |
| B11 | El usuario y la tienda se dan de alta manualmente; no hay autoregistro público. | Aprobada |
| B13 | Al cancelar una venta de un día anterior no se restituye inventario (ese día ya terminó); solo se registra. Si es del mismo día, sí se restituye. | Aprobada |
| B14 | Los pagos de ventas canceladas no cuentan como "cobrado"; se muestran aparte como "por devolver fuera del sistema". | Aprobada |
| B15 | El horario de la jornada es informativo: una venta fuera de horario se permite con un aviso. El horario es configuración de cada tienda (08:00 a 16:00 es solo el valor inicial) y también se puede ajustar en una jornada concreta; nada del horario va fijo en el código. | Aprobada |

**B8 (jornada). Aprobada.** Existe la entidad *Jornada*: una por tienda y fecha, que se crea al preparar el día. Guarda el horario de esa jornada, tomado de la configuración de la tienda (por omisión 08:00 a 16:00). La disponibilidad diaria de cada producto cuelga de la jornada y las ventas pertenecen a ella. No hay cierre ni arqueo de jornada: el documento pide expresamente evitar un cierre contable complejo. El horario no bloquea ventas (B15).

**B12 (conectividad). Aprobada.** La aplicación se usa siempre en línea; el documento deja fuera la venta sin conexión con sincronización posterior, así que no se construye una cola offline. Sí se exige reintento seguro (idempotencia), estados de error claros y que nunca se dé por registrada una operación sin confirmación del servidor (RNF-054, RNF-055).

**W6. Aprobada (delegada al criterio del desarrollador).** La documentación sigue el mismo flujo que el código: rama `docs/...`, PR hacia `dev` y llegada a `main` con la siguiente fase validada. Así las ramas de trabajo siempre ven los documentos vigentes y existe una sola ruta de integración.

## 3. Decisiones técnicas

| ID | Decisión | Estado |
|---|---|---|
| T1 | Stack: React + TypeScript + Vite + Tailwind; Node LTS + TypeScript + Fastify; PostgreSQL; Cognito; Lambda + API Gateway; REST/JSON. | En requerimientos |
| T2 | Multitenant con base compartida y aislamiento lógico. El tenant sale de la identidad autenticada, nunca del cliente. | En requerimientos |
| T3 | Monorepo: `apps/web`, `apps/api`, `packages/shared` (tipos y esquemas de validación). | Aprobada |
| T4 | Backend en capas: rutas, casos de uso, dominio puro (totales, saldos, estados) y repositorios. El dominio no importa Fastify, el driver de base de datos ni AWS. | Aprobada |
| T5 | La API corre como servidor Fastify normal en local y detrás de un adaptador en Lambda. Todo se desarrolla y prueba sin AWS. | Aprobada |
| T6 | Dinero: `NUMERIC(12,2)` y librería decimal en código, nunca `number`. Cantidades: `NUMERIC(12,3)`. Fechas: `timestamptz` generadas por el backend; la fecha de negocio se calcula en la zona horaria de la tienda. | Aprobada |
| T7 | Idempotencia en crear venta y registrar pago mediante `Idempotency-Key` único por tenant. Misma llave y mismo cuerpo devuelve el resultado original; misma llave y distinto cuerpo da `409`. | Aprobada |
| T8 | Concurrencia: venta, descuento de inventario y pago en una sola transacción; el inventario se descuenta con una actualización atómica condicionada a que haya existencias. | Aprobada |
| T9 | Pruebas: Vitest (unitarias), PostgreSQL real en contenedor para integración y Playwright para E2E. Una utilidad de prueba crea dos tenants y verifica el aislamiento en cada fase. | Aprobada |
| T10 | Row Level Security de PostgreSQL: no se usa al inicio. Se evalúa como defensa adicional en el diseño técnico de la fase 1. | Aprobada |

### Migraciones de base de datos

Política propuesta (M1), válida sea cual sea la herramienta:

- Todo cambio de esquema es un archivo de migración versionado en el repositorio y se revisa en el PR junto con el código que lo usa.
- Una migración ya integrada en `dev` no se edita; las correcciones van en una migración nueva.
- Solo hacia adelante. No se confía en "deshacer" en producción; los cambios destructivos se hacen por etapas (agregar, migrar datos, cambiar el código, eliminar en una versión posterior), de acuerdo con el plan de reversión del documento.
- Cada migración corre en una transacción y queda registrada en una tabla de control de la herramienta.
- La CI aplica todas las migraciones desde cero sobre PostgreSQL y falla si alguna no aplica.
- Las migraciones nunca se ejecutan al arrancar la Lambda; son un paso explícito del despliegue.
- Los datos de prueba (seeds) están separados de las migraciones y nunca se cargan en producción.
- Los tipos de TypeScript de la base de datos se generan desde el esquema, de modo que las migraciones son la fuente de verdad.

| ID | Decisión pendiente | Recomendación | Estado |
|---|---|---|---|
| D1 | Cómo conectarse a Neon desde Lambda. | `pg` sobre el endpoint con pooler de Neon: permite transacciones interactivas y es portable a RDS. | Aprobada |
| D2 | Autenticación y sesión. | Cognito con frontend y API bajo un mismo dominio para cookies `HttpOnly`. El dominio se compra al final; hasta entonces el desarrollo local funciona sin él (T11). | Aprobada |
| D3 | Herramienta de migraciones. | `node-pg-migrate`, con migraciones en SQL puro independientes del acceso a datos. | Aprobada |
| D4 | Acceso a datos. | Kysely con tipos generados desde el esquema. | Aprobada |
| D5 | Infraestructura como código. | AWS SAM, usado en la fase 9. | Aprobada |
| T11 | Desarrollo local sin dominio (se aplica cuando exista el frontend): el servidor de desarrollo del frontend reenvía `/api` a la API, de modo que navegador y API comparten origen en `localhost` y las cookies `HttpOnly` funcionan igual que en producción. El proveedor de identidad local reemplaza a Cognito detrás de la misma interfaz. | Aprobada |
| T12 | Gestor de paquetes: npm con workspaces (sin herramientas adicionales). Reversible. | Aprobada (delegada por el propietario) |
| T13 | Las pruebas de integración usan `TEST_DATABASE_URL`: PostgreSQL en contenedor (`docker-compose.yml`) en local y como servicio en la CI. Equivale a T9 sin añadir Testcontainers. | Aprobada (delegada por el propietario) |
| T14 | Versiones fijadas por compatibilidad: TypeScript `~6.0` (typescript-eslint no admite 6.1 o superior). | Aprobada (delegada por el propietario) |
| T15 | Sesión: cookies `HttpOnly` y `SameSite=Strict` (`Secure` en producción); acceso de 15 minutos y renovación de 7 días en una cookie limitada a `/api/auth`. Sin CORS (web y API comparten origen); las solicitudes que modifican datos desde otro origen se rechazan. | Propuesta |
| T16 | Proveedor de identidad local para desarrollo: JWT HS256, usuarios definidos en una variable de entorno (no hay contraseñas en tablas) y prohibido en producción. Cerrar sesión borra las cookies; el token de renovación local no se puede revocar (Cognito sí, en la fase 9). | Propuesta |
| T17 | Un usuario pertenece a una sola tienda (restricción única) hasta que haga falta elegir tienda. El alta manual vincula el usuario con su `identity_subject` de forma explícita; no se enlaza por correo. | Propuesta |
| T18 | Row Level Security: no se usa por ahora. El aislamiento se garantiza con repositorios acotados al tenant y pruebas entre dos tiendas. Se reevalúa antes de incorporar tiendas de terceros (exigiría `SET LOCAL` por transacción con el pooler de Neon). | Propuesta |
| T19 | Auditoría: tabla `audit_events` solo de inserción, escrita en la misma transacción que el cambio. Se audita el inicio de sesión exitoso; los intentos fallidos solo van a los logs técnicos. | Propuesta |
| T20 | Catálogo: el importe viaja y se guarda como texto decimal de 2 posiciones (`"25.00"`, `NUMERIC(12,2)`), nunca como número JSON. Sin aritmética en esta fase, así que aún no se agrega una librería decimal (llega con las ventas, fase 4). | Propuesta |
| T21 | Catálogo: edición con control de versión. `PATCH /api/products/:id` exige la `version` que la persona vio; si cambió, responde `409 conflict` en lugar de sobrescribir (sección 6.3). Una edición que no cambia nada no sube la versión ni deja auditoría. | Propuesta |
| T22 | Catálogo: el código interno, si existe, es único por tienda sin distinguir mayúsculas (`409 conflict` con error en el campo `code`). El documento no lo pide; se agrega porque la búsqueda por código lo necesita. | Propuesta |
| T23 | Catálogo: el listado responde por omisión solo productos activos (`status=active`; también `inactive` y `all`), ordenado por nombre, con `limit` (50, máximo 100) y `offset`. No existe `DELETE`: un producto se desactiva. La tabla guarda `allows_fractions` (falso) y `unit` para vender por peso o volumen más adelante sin migrar datos (B1); la API aún no permite cambiarlo. | Propuesta |

## 4. Preguntas abiertas

Ninguna. El plan ([plan.md](plan.md)) y las decisiones T3 a T11 están aprobados; la fase 0 puede comenzar.
