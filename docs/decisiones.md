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
| B10 | Reportes semanales: lunes a viernes (días escolares). | Aprobada; falta definir el caso de fin de semana (P2) |
| B11 | El usuario y la tienda se dan de alta manualmente; no hay autoregistro público. | Aprobada |
| B13 | Al cancelar una venta de un día anterior no se restituye inventario (ese día ya terminó); solo se registra. Si es del mismo día, sí se restituye. | Aprobada |

**B8 (jornada), reinterpretación a confirmar (P1).** El propietario indicó que no necesita "jornadas". Pero el documento exige, como prioridad crítica, elegir qué productos se venden cada fecha y con qué cantidad (F-04, F-05, RF-028 a RF-038). Se resuelve así: **no existe una entidad Jornada con apertura y cierre**. Existe una *disponibilidad diaria* por `(fecha, producto)` que lleva la cantidad inicial, y la fecha es la única noción de "día". Con esto se cumple el documento sin añadir ceremonia.

**B12 (conectividad), a confirmar (P4).** Se usará desde el teléfono. El documento deja fuera la venta sin conexión con sincronización posterior, así que no se construye una cola offline. Sí se exige reintento seguro (idempotencia), estados de error claros y que nunca se dé por registrada una operación sin confirmación del servidor (RNF-054, RNF-055).

## 3. Decisiones técnicas

| ID | Decisión | Estado |
|---|---|---|
| T1 | Stack: React + TypeScript + Vite + Tailwind; Node LTS + TypeScript + Fastify; PostgreSQL; Cognito; Lambda + API Gateway; REST/JSON. | En requerimientos |
| T2 | Multitenant con base compartida y aislamiento lógico. El tenant sale de la identidad autenticada, nunca del cliente. | En requerimientos |
| T3 | Monorepo: `apps/web`, `apps/api`, `packages/shared` (tipos y esquemas de validación). | Propuesta |
| T4 | Backend en capas: rutas, casos de uso, dominio puro (totales, saldos, estados) y repositorios. El dominio no importa Fastify, el driver de base de datos ni AWS. | Propuesta |
| T5 | La API corre como servidor Fastify normal en local y detrás de un adaptador en Lambda. Todo se desarrolla y prueba sin AWS. | Propuesta |
| T6 | Dinero: `NUMERIC(12,2)` y librería decimal en código, nunca `number`. Cantidades: `NUMERIC(12,3)`. Fechas: `timestamptz` generadas por el backend; la fecha de negocio se calcula en la zona horaria de la tienda. | Propuesta |
| T7 | Idempotencia en crear venta y registrar pago mediante `Idempotency-Key` único por tenant. Misma llave y mismo cuerpo devuelve el resultado original; misma llave y distinto cuerpo da `409`. | Propuesta |
| T8 | Concurrencia: venta, descuento de inventario y pago en una sola transacción; el inventario se descuenta con una actualización atómica condicionada a que haya existencias. | Propuesta |
| T9 | Pruebas: Vitest (unitarias), PostgreSQL real en contenedor para integración y Playwright para E2E. Una utilidad de prueba crea dos tenants y verifica el aislamiento en cada fase. | Propuesta |
| T10 | Row Level Security de PostgreSQL: no se usa al inicio. Se evalúa como defensa adicional en el diseño técnico de la fase 1. | Propuesta |

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
| D1 | Cómo conectarse a Neon desde Lambda. | `pg` sobre el endpoint con pooler de Neon: permite transacciones interactivas y es portable a RDS. | Propuesta |
| D2 | Autenticación y sesión. | Cognito con frontend y API bajo un mismo dominio para cookies `HttpOnly`. En desarrollo, un proveedor local detrás de la misma interfaz. Se decide el dominio al llegar al despliegue. | Propuesta |
| D3 | Herramienta de migraciones. | Migraciones en SQL puro con `node-pg-migrate` (alternativa: `dbmate`), independientes del acceso a datos. Se valida en la fase 0. | Propuesta |
| D4 | Acceso a datos. | Kysely con tipos generados desde el esquema (más control de SQL para reportes que un ORM completo). | Propuesta |
| D5 | Infraestructura como código (SAM o CDK). | Se decide al planear el despliegue (fase 9). | Propuesta |

## 4. Preguntas abiertas

- **P1.** ¿Confirmas que no hay "jornada" como entidad, y que la disponibilidad diaria por fecha (con cantidad inicial) se mantiene porque el documento la exige?
- **P2.** Fines de semana: ¿se impide registrar disponibilidad y ventas en sábado y domingo? Propuesta: no se impide. Esas ventas cuentan en el reporte mensual y en el rango personalizado, y en el semanal se asignan a la semana lunes a domingo para no perder totales.
- **P3.** Pagos de ventas canceladas: propuesta de excluirlos de "cobrado" y mostrarlos aparte como "por reembolsar fuera del sistema".
- **P4.** ¿Confirmas que no hace falta una cola offline y basta el reintento seguro?
- **D1 a D5.** Decisiones técnicas de la tabla anterior.
