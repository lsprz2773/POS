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
| B16 | El método de pago (efectivo o transferencia) es solo informativo: sirve para saber por qué medio pagaron. No se integra ninguna pasarela ni terminal de pago, y no se valida contra ningún banco (regla 44 de `requerimientos.md`). Una pasarela como Mercado Pago, si algún día se quiere, sería un módulo futuro con su propia revisión. El documento solo define efectivo y transferencia; agregar "tarjeta" como método informativo sería un cambio de alcance que se decide en la fase 5. | Aprobada |

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
| T24 | Jornada: las cantidades viajan y se guardan como texto decimal de hasta 3 posiciones (`"40"`, `"2.5"`), sin ceros sobrantes. Un producto que no admite fracciones solo acepta enteros; la aritmética se hace en milésimas exactas, sin `number`. | Propuesta |
| T25 | Jornada: la cantidad inicial no se edita; solo crece con ajustes (aumento mayor que cero, con motivo y responsable), tal como dice B9. Para corregir un error hacia abajo se quita el producto del día (solo si no tiene ventas) y se vuelve a agregar. Quitarlo borra sus ajustes; la auditoría conserva el rastro. | Propuesta |
| T26 | Jornada: no hay un paso aparte para crearla; la primera vez que se agrega un producto a una fecha se crea con el horario de la tienda (B8). "Hoy" lo calcula el servidor en la zona horaria de la tienda y la API acepta `today` en lugar de una fecha. Solo se modifican jornadas de hoy en adelante (hasta 60 días por adelantado, para evitar errores de captura); las pasadas son de solo consulta. | Propuesta |
| T27 | Jornada: "vendido" vale 0 mientras no existan las ventas (fase 4). La regla "no quitar un producto con ventas" y el disponible descontando ventas ya están en el código, pero se prueban de extremo a extremo en la fase 4. | Propuesta |
| T28 | Ventas: el folio es consecutivo por tienda y legible (`V-0043`). Sale de un contador que se incrementa dentro de la transacción de la venta: si la venta falla, el número no se gasta. Las ventas de una misma tienda se numeran una a la vez. | Aprobada |
| T29 | Ventas: `Idempotency-Key` obligatorio al crear (8 a 128 caracteres). Misma llave y mismo contenido devuelven la venta original (`200`, con `Idempotent-Replayed: true`) aunque el inventario ya se haya agotado o el día haya cambiado; misma llave con otro contenido, `409`. La llave es por tienda y se compara con una huella del contenido que no depende del orden de los renglones. | Aprobada |
| T30 | Ventas: solo se vende en la jornada de hoy (zona horaria de la tienda), con productos activos incluidos hoy. Si hoy no está preparado: `409`. | Aprobada |
| T31 | Ventas: nombre, precio y costo salen del catálogo en el instante de vender y se congelan en cada renglón. El cliente no puede enviar precio, costo, subtotales, total, estado, folio ni fecha: esos campos se rechazan. | Aprobada |
| T32 | Ventas: el inventario se descuenta dentro de la transacción de la venta. Se bloquean (`FOR UPDATE`) los productos pedidos, en orden fijo, y después se lee lo vendido; "vendido" se calcula siempre a partir de los renglones de ventas no canceladas, sin contador aparte que pueda descuadrarse. Sin existencias: `409 insufficient_stock` con un mensaje por renglón y sin vender nada. | Aprobada |
| T33 | Ventas: mínimo un renglón y máximo 50; el mismo producto no puede repetirse (se juntan las cantidades). Cliente o referencia hasta 100 caracteres y nota hasta 500. | Aprobada |
| T34 | Ventas: el subtotal de cada renglón se redondea a centavos con la mitad hacia arriba (solo importa con cantidades fraccionarias); el total es la suma de los subtotales. La aritmética se hace en centavos y milésimas exactas, sin `number`. | Aprobada |
| T35 | Ventas: fuera del horario de la jornada la venta se registra igual y la respuesta trae `outsideWorkdayHours: true` (B15). | Aprobada |
| T36 | Ventas confirmadas: la base impide borrarlas o editarlas (disparadores). Solo puede cambiar el estado a cancelada (fase 6). Un producto del día que tuvo ventas, aunque estén canceladas, no se puede quitar: el historial se conserva. | Propuesta |
| T37 | Pagos: se pueden registrar al crear la venta (campo opcional `payments`, en la misma operación) o después (`POST /api/sales/:id/payments`). Un pago mixto es una operación con un renglón de efectivo y otro de transferencia (máximo uno por método). Ambos exigen `Idempotency-Key`: misma llave y mismo contenido devuelven el resultado original (`200`); otro contenido, `409`. | Aprobada |
| T38 | Pagos: solo efectivo y transferencia, como define el documento, y solo como información (B16). No se agrega "tarjeta" ni pasarelas; sumar un método informativo después es un cambio de una migración pequeña. | Aprobada |
| T39 | Pagos: sin sobrepago (B7). El importe es mayor que cero y no excede lo que falta; el mensaje dice cuánto falta ("No puedes cobrar más de $75.00."). Una venta sin saldo responde `409`. No se modela cambio en efectivo. | Aprobada |
| T40 | Pagos: `recibido`, `falta por pagar` y el estado de cobro (`pending`, `partial`, `paid`, `cancelled`) se derivan siempre de los pagos vigentes en el backend. La venta guarda además la fecha en que quedó pagada (`settled_at`), que se borra si una anulación deja saldo. Una venta sin saldo (también una de total cero) cuenta como pagada. | Aprobada |
| T41 | Pagos: cada renglón de pago se anula por separado (`POST /api/payments/:id/void`), con motivo de 1 a 200 caracteres. El pago se conserva marcado como anulado y la venta debe estar activa. Se bloquea primero la venta y luego el pago, y los pagos de una venta se registran de uno en uno. | Aprobada |
| T42 | Pagos: se pueden cobrar ventas de días anteriores; la fecha del pago es la del servidor. Una venta cancelada no admite pagos nuevos ni anulaciones. | Aprobada |
| T43 | Pendientes: `GET /api/sales/pending` devuelve las ventas activas con saldo mayor que cero, de cualquier día, con filtro por rango de fecha de venta, paginación, la cuenta y el total pendiente de todas las que cumplen el filtro. | Aprobada |
| T44 | Pagos: el detalle de la venta (`GET /api/sales/:id`) incluye el historial de pagos con método, importe, fecha, estado y motivo de anulación. | Aprobada |
| T45 | Pagos: la base impide borrar o editar un pago; solo puede pasar de vigente a anulado, con motivo, una vez. Un pago de una tienda no puede apuntar a una venta de otra. | Aprobada |
| T46 | Cancelación: `POST /api/sales/:id/cancel` con motivo obligatorio (1 a 200 caracteres). La confirmación es asunto de la interfaz; no usa `Idempotency-Key` porque repetirla es seguro: la segunda vez responde 409 "ya estaba cancelada". Cualquier venta vigente (pendiente, parcial o pagada) se puede cancelar. | Aprobada |
| T47 | Cancelación: si la venta es de hoy (fecha de la tienda), las unidades vuelven a estar disponibles. Si es de un día anterior no se restituye el inventario y ese día conserva su historial: las unidades siguen contando como vendidas (B13). Se registra si se restituyó. | Aprobada |
| T48 | Cancelación: los pagos se conservan intactos. La venta cancelada muestra lo cobrado como `refundDue` ("por devolver fuera del sistema", B14), su saldo es 0 y no admite pagos nuevos ni anulaciones. No aparece en pendientes. | Aprobada |
| T49 | Cancelación: motivo, fecha, usuario y si se restituyó el inventario se guardan en `sale_cancellations`, que no se edita ni se borra; la venta pasa a `cancelled` y no se reactiva (la base lo impide). Todo, con su evento de auditoría, en una sola transacción con la venta bloqueada. | Aprobada |
| T50 | Cancelación: la venta cancelada conserva folio, renglones y pagos, y sigue impidiendo quitar el producto del día. Sale de las métricas de venta efectiva y se mostrará aparte (fase 7). | Aprobada |
| T51 | Historial: `GET /api/sales` pagina (50 por omisión, máximo 100) de la venta más nueva a la más antigua, con filtros por rango de fecha de venta, estado (`active`/`cancelled`), cobro (`pending`/`partial`/`paid`, solo vigentes) y búsqueda por folio (`V-0043` o `43`) o parte de la referencia del cliente, sin distinguir mayúsculas. El detalle sigue siendo `GET /api/sales/:id`. | Aprobada |
| T52 | Dashboard: `GET /api/dashboard` devuelve, para hoy en la zona de la tienda, ventas, número de ventas, cobrado (total y por método), utilidad bruta estimada y si el día está preparado; el pendiente (número y monto) es el de ventas vigentes de cualquier día (RF-079). | Aprobada |
| T53 | Reportes: `GET /api/reports` con `period=day\|week\|month` y `date` (hoy por omisión), o con `from` y `to`. La semana va de lunes a domingo. Se rechazan rangos incompletos, invertidos, mezclados con periodo o de más de 366 días; un periodo sin datos devuelve ceros. | Aprobada |
| T54 | Reportes: las cifras siguen las definiciones de `dominio.md`. Las ventas se ubican por la fecha de negocio de su jornada; los pagos, por el instante en que se recibieron, convertido a la zona horaria de la tienda (un pago a las 23:30 locales cuenta en ese día). El costo de cada renglón (cantidad × costo congelado) se redondea a centavos con la mitad hacia arriba, igual que el subtotal. | Aprobada |
| T55 | Reportes: utilidad bruta = ventas − costo de productos vendidos, con costos y precios congelados al vender (RF-105). Si es negativa, `isGrossLoss` es verdadero. El margen bruto es un porcentaje con 2 decimales y es nulo cuando no hubo ventas. Nunca se presenta como utilidad neta. | Aprobada |
| T56 | Reportes: productos más vendidos son los 10 primeros por unidades (desempate por importe), con el nombre de la venta más reciente. Las ventas canceladas no entran; se reportan aparte (número, total y por devolver fuera del sistema), ubicadas por la fecha de la venta. | Aprobada |
| T57 | Reportes y dashboard: todo se calcula con agregaciones en la base (RNF-007), sobre una misma lectura consistente (transacción de solo lectura con aislamiento `repeatable read`), para que las cifras cuadren entre sí. | Aprobada |
| T58 | Frontend: la fase 8 se entrega en 6 partes, cada una con su rama y su PR: 8a base (estructura, tokens de vidrio, sesión, navegación, componentes de estados; inicio de sesión, cuenta bloqueada y perfil), 8b catálogo, producto y configuración, 8c preparar día, inventario y jornadas, 8d venta, pago, detalle, cancelar, anular y pendientes, 8e hoy, historial y reportes, 8f accesibilidad y los 15 flujos E2E. Cada parte publica capturas en 360 px y escritorio como página privada, sin imágenes en el repositorio. | Aprobada |
| T59 | Frontend: React, TypeScript, Vite y Tailwind, más React Router, TanStack Query (datos del servidor), Radix Dialog (modales y hojas accesibles), iconos lucide y la tipografía Plus Jakarta Sans instalada en el proyecto, sin pedir recursos a servidores externos. | Aprobada |
| T60 | Frontend: los colores, el vidrio y el espaciado del diseño son variables CSS. Sigue el modo claro y oscuro del sistema y pasa a superficies sólidas cuando se pide reducir la transparencia o el navegador no sabe desenfocar. No hay interruptor de tema (el documento de requerimientos no lo pide). | Aprobada |
| T61 | Frontend: el cliente del API usa el mismo origen (`/api` se reenvía desde el servidor de desarrollo), renueva la sesión una sola vez ante un 401 compartido entre solicitudes, avisa con un diálogo bloqueante si no se puede renovar, traduce los códigos de error a textos del diseño y muestra el `x-request-id` en errores inesperados. La `Idempotency-Key` se genera por intento: el mismo intento reenviado usa la misma llave y si cambia el contenido se estrena otra. | Aprobada |
| T62 | Frontend: los importes viajan como texto. La aritmética exacta de dinero y cantidades (centavos y milésimas con BigInt, saldo, estado de cobro, formato) vive en `packages/shared` y la usan el API y la web; el frontend solo anticipa y lo que cuenta es lo que devuelve el backend. Los formularios reutilizan los esquemas compartidos. | Aprobada |
| T63 | Frontend: la app es solo en línea (B12): un aviso permanente sin conexión y las acciones de escritura deshabilitadas; no hay cola de reintentos. Los textos están en español de México, agrupados por área en un módulo. | Aprobada |
| T64 | Frontend: pruebas con Vitest y Testing Library (componentes y lógica) y Playwright en Chromium contra el API real y PostgreSQL, en 360 px y en escritorio, con revisión automática de accesibilidad con axe (WCAG 2.2 AA) en cada pantalla. La CI suma la construcción de la web y un trabajo de E2E. Las credenciales de las pruebas se generan al azar en cada ejecución. | Aprobada |
| T65 | Frontend: sin hosting ni nube; la web se sirve solo en local hasta la fase 9. | Aprobada |
| T66 | Frontend, catálogo: lista con búsqueda por nombre o código (con pausa entre teclas), filtro Activos/Inactivos/Todos (activos por omisión) y "Cargar más" de 50 en 50. Activar o desactivar desde la lista envía la versión que se vio y, si otra sesión cambió el producto, muestra el aviso del servidor. El formulario separa Descripción y Notas (el diseño las mostraba juntas, pero el modelo las guarda por separado), valida con los mismos esquemas del servidor y al editar envía solo lo que cambió. Avisa antes de salir con cambios sin guardar (la salida segura recibe el foco). | Propuesta |
| T67 | Frontend, configuración de la tienda: el nombre, la moneda (hoy solo MXN), la zona horaria (las de México primero, con su nombre local), el horario con selector de hora y los días de operación como siete botones que caben en 360 px (ancho cercano a 40 px, alto 44 px; el diseño los tenía más anchos y se salían de la pantalla). Se guarda solo lo que cambió y se avisa si no hay cambios. | Propuesta |

## 4. Preguntas abiertas

Ninguna. El plan ([plan.md](plan.md)) y las decisiones T3 a T11 están aprobados; la fase 0 puede comenzar.
