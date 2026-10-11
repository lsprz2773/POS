# Prompt de diseño del frontend

Prompt para generar el diseño de la interfaz con una herramienta de diseño. El frontend sigue en pausa (W8, [decisiones.md](../decisiones.md)); esto prepara la entrega del diseño que lo desbloquea (fase 8, [plan.md](../plan.md)).

**Cómo usarlo:** pega el bloque de la sección 3 completo. La sección 2 solo indica de dónde sale cada vista, para revisar que no falte ni sobre nada respecto a [requerimientos.md](../requerimientos.md) (sección 8.1) y [dominio.md](../dominio.md).

## Diseño resultante

El propietario aprobó el diseño generado con este prompt: [lienzo en claude.ai](https://claude.ai/artifact/YNnZiLekSbMpcmrbJfocrU) (enlace privado). Contiene el sistema de diseño, las 16 vistas en móvil y escritorio, los 8 modales, el catálogo de estados, un prototipo de nueva venta, los flujos clave y las notas de accesibilidad y textos. Es la referencia visual de la fase 8 ([plan.md](../plan.md)).

## 1. Resumen

16 vistas, 8 modales u hojas, 8 familias de estados y un estilo visual de vidrio translúcido (Liquid Glass) con reglas de legibilidad. Está fuera de alcance todo lo que el documento de requerimientos deja fuera del MVP.

Decisiones tomadas al preparar el prompt (el propietario puede cambiarlas):

- "Preparar día" (acción) e "Inventario del día" (consulta) son pantallas separadas. Alternativa: una sola con dos pestañas.
- El prompt es agnóstico a la herramienta (Figma, Claude Design u otra).
- La marca (logo, colores) está libre: aún no existe. Si hay preferencias, agrégalas a la sección "Estilo visual".
- El vidrio translúcido choca con WCAG 2.2 AA (RNF-042) si el texto cae sobre fondos variables; por eso el prompt exige superficies con opacidad suficiente, variante sólida con "reducir transparencia" y blur ligero para teléfonos modestos.

## 2. Trazabilidad de las vistas

| # | Vista | Fuente |
|---|---|---|
| 1 | Inicio de sesión | RF-001 a RF-008, 6.1 |
| 2 | Cuenta bloqueada (sin tienda / tienda desactivada) | RF-009, 6.2 |
| 3 | Dashboard "Hoy" | RF-079, 8.1 |
| 4 | Catálogo | RF-017 a RF-027 |
| 5 | Producto (crear y editar) | RF-018 a RF-022, B6 |
| 6 | Preparar día | RF-028 a RF-038, B9 |
| 7 | Inventario del día | RF-031 |
| 8 | Jornadas anteriores | RF-036 |
| 9 | Nueva venta | RF-039 a RF-050, 6.5 |
| 10 | Venta registrada | RNF-055 |
| 11 | Detalle de venta | RF-060, RF-072, RF-111 a RF-113 |
| 12 | Pendientes | RF-073 a RF-080 |
| 13 | Historial de ventas | RF-081, RNF-006 |
| 14 | Reportes | RF-081 a RF-105, 8.1 |
| 15 | Configuración de tienda | F-17, B10, B15 |
| 16 | Perfil y cierre de sesión | 8.1 |

Las 13 áreas de la sección 8.1 quedan cubiertas. Se agregan tres que el documento implica: cuenta bloqueada (6.2), jornadas anteriores (RF-036) y venta registrada (RNF-055). Modales: M1 a M8 (pago, cancelar venta, anular pago, aumentar cantidad, quitar producto del día, salir sin guardar, sesión expirada, filtro de fecha).

## 3. Prompt

````text
Diseña la interfaz completa de una aplicación web responsive "mobile-first" para
administrar ventas, pagos, inventario diario y reportes de una tienda pequeña
(POS ligero). Idioma: español de México. Moneda: pesos mexicanos (MXN).

USUARIO
Un solo propietario, sin conocimientos técnicos ni contables. Usa el teléfono
(desde 360 px) durante la jornada, con una mano y a veces con prisa; en
escritorio solo para revisar reportes. Vocabulario cotidiano: Producto,
Cantidad, Precio, Total, Recibido, Falta por pagar, Efectivo, Transferencia,
Pagada, Pendiente, Venta cancelada.

USO
Cada mañana prepara el día (elige productos y cantidades). Durante el día
registra ventas rápido y cobra total, parcial o deja pendiente; después cobra
pendientes. Al final consulta cuánto vendió, cobró, cuánto falta y la utilidad
bruta.

PRINCIPIOS
- Una venta común en pocos toques; "Nueva venta" es la acción más prominente.
- Total, recibido y falta por pagar siempre visibles, sin cálculos manuales.
- Estados Pagada / Pendiente / Cancelada con texto e ícono, no solo color.
- WCAG 2.2 AA: contraste, foco visible, etiquetas visibles en formularios,
  objetivos táctiles de 44 px o más, errores que digan qué corregir.
- Tarjetas en móvil (evitar tablas anchas); mayor densidad en escritorio.
- Una acción primaria por contexto; las destructivas separadas y con confirmación.
- Nunca dar una operación por registrada sin confirmación del servidor; botones
  con indicador para evitar doble envío.

ESTILO VISUAL
- Glassmorphism al estilo "Liquid Glass" de Apple: superficies translúcidas con
  desenfoque de fondo (backdrop blur), bordes finos con brillo sutil,
  reflejos y gradientes suaves, profundidad por capas, esquinas muy redondeadas
  y animaciones fluidas. Fondo con color o degradado atmosférico detrás de los
  paneles. La barra de navegación, las hojas y diálogos, y las tarjetas de
  métricas son las superficies de vidrio.
- Legibilidad ante todo (el vidrio no puede romper la usabilidad): el texto y
  los importes se colocan sobre superficies con opacidad suficiente para cumplir
  contraste AA (4.5:1 texto, 3:1 componentes) en cualquier punto del fondo;
  formularios y listas largas usan vidrio más opaco; bordes y foco visibles
  aunque el fondo cambie; el blur es ligero para rendir bien en teléfonos
  modestos. Respeta "reducir transparencia" y "reducir movimiento" (variante
  sólida sin blur) y ofrece modo claro y oscuro.
- Identidad libre salvo lo anterior (aún no existe marca): propón una paleta
  pequeña con colores semánticos, escala tipográfica, espaciado y componentes.

NAVEGACIÓN
Móvil: barra inferior con Hoy, Vender (central y prominente), Pendientes, Día
y Más. "Más" agrupa Catálogo, Historial, Reportes, Configuración y Perfil.
Escritorio: barra lateral con los mismos destinos.

PANTALLAS (las 16, en móvil 360 px y en escritorio)
1. Inicio de sesión: correo, contraseña, botón de acceso, carga, error genérico
   que no revela cuál dato falló, servicio no disponible.
2. Cuenta bloqueada: dos variantes ("tu cuenta aún no tiene tienda" y "tienda
   desactivada"); solo permite cerrar sesión.
3. Hoy (dashboard): ventas del día, cobrado, pendiente (monto y número de
   ventas), número de ventas, utilidad bruta estimada, resumen por efectivo y
   transferencia, si el día ya está preparado, acceso prominente a Nueva venta
   y acceso a Pendientes.
4. Catálogo: lista de productos con precio y costo, búsqueda por nombre o
   código, filtro activos/inactivos, activar o desactivar, crear producto.
5. Producto (crear y editar): nombre*, precio de venta*, costo* (puede ser 0),
   descripción, categoría, unidad (por omisión "pieza"), código interno, notas,
   activo. Errores por campo y los datos se conservan si falla el guardado.
6. Preparar día: selector de fecha (hoy por omisión), buscador de productos
   activos, incluir o excluir, cantidad inicial, vendido y disponible; aumentar
   la cantidad con motivo (nunca bajar de lo vendido); quitar un producto solo
   si no tiene ventas; guardar. Aviso si el día no es de operación.
7. Inventario del día (solo consulta): inicial, vendido y disponible por
   producto, con alerta de poco o nada disponible; aviso fuera de horario.
8. Jornadas anteriores: lista por fecha con resumen; al abrir una, vista de solo
   lectura.
9. Nueva venta, en dos pasos. Paso 1: buscador y lista de productos del día con
   su disponible, control de cantidad (más, menos y teclado numérico) y resumen
   fijo con el total. Paso 2: cliente o referencia y nota (opcionales), cobrar
   (abre la hoja de pago) o "Dejar pendiente", aviso de fuera de horario y
   "Confirmar venta".
10. Venta registrada: confirmación del servidor con folio, total, recibido, falta
    por pagar y estado; acciones "Nueva venta" y "Ver detalle".
11. Detalle de venta: folio, fecha y hora, cliente o referencia, nota, estado
    (Pagada / Pendiente / Cancelada, con texto e ícono), renglones con nombre,
    cantidad, precio y subtotal, total / recibido / falta por pagar, historial de
    pagos (método, monto, fecha, anulado), acciones "Registrar pago", "Anular
    pago" y "Cancelar venta". Si está cancelada: motivo, fecha y "por devolver
    fuera del sistema".
12. Pendientes: tarjetas con folio, fecha, total, recibido, falta por pagar y
    estado; filtro por fecha; total pendiente arriba; acción rápida "Registrar
    pago"; incluye pendientes de días anteriores.
13. Historial de ventas: lista paginada o con carga incremental, filtros por
    fecha y estado, búsqueda por folio o cliente/referencia, canceladas marcadas.
14. Reportes: selector de periodo (día, semana lunes a domingo, mes, rango);
    ventas, cobrado, pendiente del periodo, número de ventas, ticket promedio,
    unidades vendidas, cobrado por efectivo y transferencia, productos más
    vendidos, costo de productos vendidos, utilidad bruta y margen bruto (pérdida
    bruta si es negativa), ventas canceladas aparte y "por devolver fuera del
    sistema". Tablas y gráficas solo donde aporten; las cifras se entienden sin
    la gráfica.
15. Configuración de tienda: nombre, moneda, zona horaria, horario de la jornada
    (08:00 a 16:00 al inicio) y días de operación (lunes a viernes al inicio;
    los siete días se pueden activar).
16. Perfil: correo, tienda y cerrar sesión.

COMPONENTES REUTILIZABLES
Tarjeta de métrica, insignia de estado, campo de dinero MXN, control de
cantidad, selector de producto con buscador, selector de fecha y de periodo,
hoja de pago (Efectivo / Transferencia / Mixto), diálogo de confirmación con
motivo, tarjeta de venta, fila de producto del día, toast, banner, botón con
estado de carga, skeleton por tipo de contenido.

MODALES Y HOJAS (diseña los 8; hoja inferior en móvil, modal centrado en escritorio)
M1. Registrar pago: total, recibido, falta por pagar; Efectivo / Transferencia /
    Mixto; importes por método; validación en vivo (mayor que cero y sin exceder
    el saldo); botón "Registrar pago" con indicador anti doble envío. Se abre
    desde Nueva venta, Detalle y Pendientes.
M2. Cancelar venta (alto impacto): resumen de la venta, motivo obligatorio,
    advertencia de que la devolución del dinero se hace fuera del sistema, aviso
    si es de un día anterior (no se restituye el inventario), botón destructivo
    "Cancelar venta" y salida segura "Volver".
M3. Anular pago (alto impacto): pago a anular (método, monto, fecha), motivo
    obligatorio y efecto (la venta vuelve a Pendiente).
M4. Aumentar cantidad del día: producto, inicial actual, vendido, nueva cantidad
    (no menor a lo vendido) y motivo.
M5. Quitar producto del día: confirmación; si tiene ventas, explica por qué no
    se puede.
M6. Salir sin guardar: "Seguir editando" (primaria) y "Descartar cambios".
M7. Sesión expirada: diálogo bloqueante que explica y lleva al inicio de sesión,
    conservando el borrador de la venta.
M8. Filtro de fecha o periodo: calendario y atajos (Hoy, Ayer, Esta semana, Este
    mes, Rango).
Reglas estrictas: rol dialog o alertdialog con título accesible; foco inicial,
foco atrapado y devuelto al cerrar; Esc, clic fuera y botón cerrar (excepto
sesión expirada y mientras procesa); un solo modal a la vez; una acción primaria
y salida segura siempre visible; acción destructiva separada, en color de peligro
y con texto; etiquetas concretas (nunca "Aceptar" ni "Sí"); sin pérdida de datos
al cerrar por accidente; scroll del fondo bloqueado; el teclado virtual no tapa
el botón primario; animación breve que respeta "reducir movimiento".

ESTADOS (diseña cada uno, en cada vista donde aplique)
- Carga: skeleton loaders con la forma real del contenido (tarjeta de métrica,
  fila, tarjeta de venta, tabla); spinner dentro de botones ("Procesando…",
  deshabilitado); indicador de arranque de sesión; barra de progreso superior;
  "Cargar más" en listas.
- Vacío: uno por vista, con ilustración ligera, explicación y llamada a la acción
  (catálogo sin productos, día sin preparar, sin ventas hoy, sin pendientes
  "¡Todo cobrado!", búsqueda sin resultados, reporte en ceros).
- Error: de campo; de formulario (resumen con enlaces a los campos); de carga con
  "Reintentar" y sin mostrar totales parciales como definitivos; de operación no
  confirmada ("No se registró la venta"); inventario insuficiente (indica el
  producto); sin tienda o tienda desactivada; no encontrado ("ya no está
  disponible"); conflicto; inesperado con código de referencia para soporte.
- Conectividad: sin conexión (banner persistente, escrituras deshabilitadas,
  explica que nada se guardó), servidor no disponible, reintentando, recuperada.
- Éxito: toast, pantalla de venta registrada, "Guardado" en formularios; con
  aria-live y sin depender del color.
- Importante, advertencia e información: venta fuera de horario, día no
  operativo, disponible bajo, pendientes de días anteriores, "la utilidad bruta
  no es utilidad neta", "por devolver fuera del sistema", datos incompletos.
- Sesión: expirada, cierre confirmado, cuenta bloqueada.
- Interacción: hover, foco, presionado, deshabilitado, seleccionado, solo lectura,
  campo vacío / con valor / con error.

UI/UX ESTRICTO
Aplica las 10 heurísticas de Nielsen, la ley de Fitts (acciones primarias grandes
al alcance del pulgar), la ley de Hick (pocas opciones por pantalla), jerarquía
visual con una sola acción primaria por contexto, consistencia entre
componentes, formularios con etiqueta visible, teclado correcto por campo
(inputmode) y mensajes que digan qué corregir, retroalimentación inmediata
(100 ms al tocar; indicador si tarda más de 1 s) y WCAG 2.2 AA (contraste, foco
visible, objetivos de 44 px, no solo color, zoom 200 %, reflujo a 320 px).
Documenta qué heurística justifica cada decisión no obvia.

REGLAS QUE LA INTERFAZ DEBE COMUNICAR
- Utilidad bruta (ventas menos costo de productos vendidos), nunca "neta".
- Cancelar una venta conserva sus pagos: avisar que cualquier devolución de
  dinero se hace fuera del sistema; si la venta es de un día anterior, avisar
  que no se restituye el inventario.
- Los pagos de ventas canceladas no cuentan como cobrado; se muestran aparte
  como "por devolver fuera del sistema".
- No se puede cobrar más que el saldo. Las ventas no se editan; un pago erróneo
  se anula con motivo.
- El horario de la jornada es informativo: fuera de horario se avisa, no se bloquea.
- La cantidad inicial de un día solo se puede aumentar (con motivo) y no baja de
  lo vendido.
- Precio fijo del catálogo en cada venta (sin descuentos ni precio libre).

FUERA DE ALCANCE (no diseñar)
Clientes o CRM, descuentos, gastos, utilidad neta, cambio en efectivo, modo sin
conexión, impresoras, lector de códigos, roles de empleados, varias tiendas,
registro público, recuperación de contraseña propia.

ENTREGABLES
1) Sistema de diseño (tokens de vidrio, color, tipografía, espaciado, sombras,
movimiento; componentes). 2) Las 16 vistas en móvil 360 px y escritorio. 3) Los
8 modales u hojas. 4) El catálogo completo de estados. 5) Flujos clave
conectados: venta pagada en efectivo, pago mixto, venta parcial o pendiente,
cobro posterior y cancelación. 6) Variantes sin transparencia (reducir
transparencia) y modo oscuro. 7) Notas de accesibilidad, heurísticas aplicadas y
textos de interfaz por pantalla.
````
