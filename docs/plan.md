# Plan de implementación

Plan incremental. Cada fase entrega funcionalidad de punta a punta (backend, migración y pantalla móvil) y vive en su propia rama `feat/<descripcion>-AAAAMMDD` creada desde `dev`. Una fase se da por terminada cuando cumple su criterio de aceptación y la definición de terminado; después se abre un PR hacia `main` con tu aprobación.

Ninguna fase comienza sin que el propietario apruebe este plan y las decisiones pendientes de [decisiones.md](decisiones.md).

## Definición de terminado (aplica a toda fase)

- Lint, formato, tipos y pruebas en verde en la CI.
- Toda modificación del esquema viene como migración versionada y la CI la aplica desde cero.
- Pruebas de las invariantes que toca la fase, incluida una prueba de aislamiento entre dos tenants.
- Validación de entradas en el backend; el cliente nunca decide totales, saldos ni fechas.
- Textos de error comprensibles y estados de carga, vacío y error en las pantallas nuevas.
- Sin secretos en el repositorio; [decisiones.md](decisiones.md) y [dominio.md](dominio.md) actualizados si cambió algo.

## Fases

### Fase 0. Fundaciones
Monorepo, TypeScript, lint y formato, Vitest, PostgreSQL local en contenedor, herramienta de migraciones (D3) con la migración inicial, CI y esqueleto mínimo de web y API con una ruta de salud.
**Aceptación:** `npm install` y un solo comando levantan el entorno local; la CI pasa lint, tipos, pruebas y aplica las migraciones desde cero.

### Fase 1. Identidad, tenant y auditoría base (F-01, F-02, F-16, F-17)
Interfaz de autenticación con proveedor local de desarrollo (D2), contexto de tenant en cada solicitud, tablas de tenant, usuario, membresía y configuración de tienda (moneda, zona horaria, horario de jornada y días de operación), guion de alta manual, edición de la configuración de la tienda y servicio de auditoría.
**Aceptación:**
- Una ruta privada sin token o con token vencido devuelve `401`.
- Un identificador de tenant enviado por el cliente no cambia el tenant autorizado.
- Un usuario sin tienda recibe un estado de configuración incompleta; un tenant desactivado no puede operar.
- El inicio de sesión funciona en `localhost` sin dominio, con cookie `HttpOnly` (T11).
- La utilidad de prueba con dos tenants queda disponible para las demás fases.

### Fase 2. Catálogo de productos (F-03)
Crear, consultar, editar, activar y desactivar productos, con búsqueda por nombre o código.
**Aceptación:**
- Nombre, precio y costo obligatorios y no negativos; unidad por omisión `pieza`.
- Desactivar no afecta ventas existentes.
- Un usuario no puede leer ni editar productos de otro tenant.

### Fase 3. Jornada y disponibilidad diaria (F-04, F-05)
Crear la jornada de una fecha con el horario de la tienda, seleccionar productos activos con su cantidad inicial, ver inicial, vendido y disponible, aumentar con ajustes y consultar jornadas anteriores.
**Aceptación:**
- Una sola jornada por fecha y tenant; no hay duplicados por (jornada, producto); cantidades negativas se rechazan.
- La cantidad no baja de lo vendido; los ajustes quedan registrados.
- Configurar un día no modifica otro.

### Fase 4. Ventas (F-06)
Crear venta con uno o más renglones, cliente/referencia y nota; descuento atómico de inventario; folio consecutivo.
**Aceptación:**
- Totales y subtotales los calcula el backend; el precio y costo del renglón quedan congelados.
- Con existencias insuficientes se rechaza todo y se indica el producto.
- Un producto fuera de la disponibilidad de hoy se rechaza.
- Dos ventas concurrentes sobre la última unidad: solo una tiene éxito.
- Reenviar la misma llave de idempotencia no duplica la venta.

### Fase 5. Pagos y pendientes (F-07, F-08, F-09, F-10)
Pago en efectivo, transferencia o mixto al crear la venta o después; saldo y estado; lista de pendientes con filtro por fecha; detalle con historial de pagos; anulación de pago.
**Aceptación:**
- Los casos de venta pagada, parcial, mixta y liquidada después terminan con saldo y estado correctos.
- Un pago mayor al saldo se rechaza; importe cero o negativo se rechaza.
- Reenviar la misma llave no duplica el pago.
- Una venta liquidada sale de pendientes; las pendientes de días anteriores siguen apareciendo.
- Anular un pago devuelve la venta a pendiente y deja auditoría.

### Fase 6. Cancelación de ventas (F-15)
Cancelación con confirmación y motivo, restitución de inventario del mismo día y advertencia de reembolso externo.
**Aceptación:**
- Cancelar una venta de hoy restituye el inventario; una de un día anterior no, y queda registrado.
- No se puede cancelar dos veces ni registrar pagos en una venta cancelada.
- La venta cancelada y sus pagos se conservan y se muestran como cancelada.

### Fase 7. Historial, dashboard y reportes (F-11, F-12, F-13, F-14)
Historial paginado y detalle de ventas, dashboard del día, reportes diario, semanal, mensual y por rango, desglose por método de pago, productos más vendidos y utilidad bruta.
**Aceptación:**
- Todas las cifras cumplen las definiciones de [dominio.md](dominio.md) y cuadran con los datos de prueba, incluido un caso con pagos de ventas de días anteriores.
- Las ventas canceladas quedan excluidas y se muestran aparte; sus pagos aparecen como "por devolver fuera del sistema" y no como cobrado.
- Rangos inválidos o invertidos se rechazan; un periodo sin datos muestra ceros.
- Un reporte nunca incluye datos de otro tenant.

### Fase 8. Móvil, accesibilidad y pruebas de extremo a extremo
Pulido responsive desde 360 px, accesibilidad WCAG 2.2 AA en los flujos principales, estados de error de red y las pruebas E2E del documento.
**Aceptación:** pasan los 15 flujos E2E de la sección 10.4 de [requerimientos.md](requerimientos.md) en móvil y escritorio, y los flujos de nueva venta, pago mixto y pendientes se usan con una mano en 360 px.

### Fase 9. Despliegue (requiere aprobación explícita)
Infraestructura como código (D5), Cognito, Neon, Lambda, API Gateway, hosting del frontend, monitoreo, alertas de presupuesto, respaldo y restauración probados, y pruebas de humo.
**Aceptación:** los criterios de finalización del MVP de [requerimientos.md](requerimientos.md), con costos acotados y alertas activas antes de crear recursos.

## Trazabilidad

| Fase | Funcionalidades | Requerimientos funcionales |
|---|---|---|
| 1 | F-01, F-02, F-16, F-17 | RF-001 a RF-016, RF-114 a RF-122 (infraestructura de auditoría) |
| 2 | F-03 | RF-017 a RF-027 |
| 3 | F-04, F-05 | RF-028 a RF-038 |
| 4 | F-06 | RF-039 a RF-050 |
| 5 | F-07, F-08, F-09, F-10 | RF-051 a RF-080 |
| 6 | F-15 | RF-106 a RF-113 |
| 7 | F-11, F-12, F-13, F-14 | RF-081 a RF-105 |
| 8 y 9 | Transversales | RNF-001 a RNF-058 |

Los RNF se aplican en todas las fases mediante la definición de terminado; las fases 8 y 9 cierran los que dependen del conjunto (rendimiento, accesibilidad, respaldos, monitoreo).
