# Documento de Requerimientos de Software

> **Proyecto:** Aplicación web de ventas e inventario diario tipo POS ligero  
> **Tipo de documento:** Levantamiento y planificación de requerimientos para MVP  
> **Estado:** Planeación inicial  
> **Fecha de referencia:** 05/10/2026  
> **Alcance técnico:** Diseño, desarrollo, pruebas y despliegue. No incluye código fuente ni diseño físico de base de datos.

---

## 1. Propósito

El presente documento define los requerimientos funcionales, no funcionales, técnicos y operativos para desarrollar un **MVP de una aplicación web tipo POS ligero**, orientada al registro diario de productos disponibles, ventas, pagos, cuentas pendientes y reportes básicos de operación.

El sistema no pretende sustituir a un ERP, sistema contable, sistema de inventarios avanzado ni a un POS empresarial. Su objetivo es resolver de forma sencilla la operación cotidiana de una tienda pequeña: indicar qué productos se venderán durante el día, establecer la existencia disponible de cada uno, registrar las ventas y sus pagos, identificar ventas pendientes de cobro y consultar métricas de ventas y utilidad bruta.

Desde su primera versión, la solución se diseñará bajo un esquema **multitenant**, de modo que los datos pertenecientes a una tienda no puedan ser consultados ni modificados por usuarios de otra tienda. Para el MVP, el uso real inicial será de un solo propietario/usuario, pero la arquitectura deberá evitar decisiones que impidan incorporar más tiendas en el futuro.

La aplicación deberá ser **web y responsive**, con prioridad de uso desde teléfono móvil, sin excluir computadoras o tabletas. Se deberá implementar autenticación, manejo de sesión, autorización y aislamiento de datos por tienda.

El documento también establece el stack tecnológico propuesto, estrategia general de arquitectura, criterios de diseño, pruebas, seguridad, despliegue y evolución del sistema.

---

## 2. Alcance del producto / Software

### 2.1. Propósito u objetivo general

Desarrollar una aplicación web responsive que permita a un propietario administrar de forma simple su operación diaria de venta mediante las siguientes capacidades principales:

- Mantener un catálogo de los productos que vende.
- Registrar el precio de compra y precio de venta de cada producto.
- Seleccionar qué productos estarán disponibles para vender en una fecha determinada.
- Definir la cantidad inicial disponible de cada producto para ese día.
- Registrar ventas utilizando los productos habilitados para la jornada.
- Descontar automáticamente del inventario diario las cantidades vendidas.
- Registrar el importe recibido en una venta.
- Registrar uno o varios pagos asociados a una venta.
- Registrar pagos en efectivo, transferencia o una combinación de ambos.
- Registrar fecha y hora de ventas, pagos y cambios relevantes de estado.
- Permitir ventas pagadas, parcialmente pagadas o pendientes.
- Identificar el saldo pendiente de cada venta.
- Mostrar diariamente las ventas que todavía tienen saldo pendiente.
- Consultar reportes de ventas y métricas destacadas.
- Consultar utilidad bruta diaria, semanal y mensual.
- Mantener separación lógica y segura de los datos de cada tienda.
- Permitir el acceso mediante inicio de sesión y sesiones autenticadas.

El sistema deberá priorizar simplicidad operativa, rapidez de captura y buena experiencia desde un teléfono.

**Alcance incluido en el MVP:**

- Autenticación y sesión.
- Creación/asociación de una tienda por propietario.
- Catálogo básico de productos.
- Configuración diaria de productos a vender.
- Inventario diario simple.
- Registro de ventas.
- Registro de pagos.
- Pagos parciales y mixtos.
- Ventas pagadas y pendientes.
- Control de saldo pendiente.
- Reporte diario de ventas pendientes.
- Historial de ventas.
- Dashboard con indicadores.
- Reportes por día, semana, mes y rango de fechas.
- Utilidad bruta con base en costo de compra y precio de venta registrado al momento de la venta.
- Diseño responsive.
- Aislamiento multitenant.
- Registro de fechas y horas relevantes.
- Cancelación controlada de ventas para corregir errores sin eliminar el historial.

**Fuera del alcance inicial del MVP:**

- Inventario por múltiples almacenes o sucursales.
- Órdenes de compra.
- Gestión avanzada de proveedores.
- Lotes, números de serie o caducidades.
- Traspasos entre almacenes.
- Conteos físicos avanzados.
- Kardex contable completo.
- Facturación electrónica o CFDI.
- Integración con SAT.
- Contabilidad completa.
- Módulo de gastos operativos.
- Cálculo de utilidad neta contable.
- Nómina.
- CRM de clientes.
- Programas de puntos.
- Integración con terminales bancarias.
- Lectores de códigos de barras como requisito obligatorio.
- Impresoras térmicas como requisito obligatorio.
- Venta offline con sincronización posterior.
- Aplicaciones móviles nativas.
- Marketplace o comercio electrónico.
- Administración compleja de sucursales.
- Roles avanzados de empleados durante la primera versión. El rol de **vendedor** se agrega después del MVP (fase 10, sección 6.13); siguen fuera los permisos configurables por empleado, los turnos y la nómina.

### 2.2. Beneficios para el área de negocio y la organización

La aplicación permitirá sustituir registros manuales o dispersos por un flujo centralizado y consistente.

Los beneficios esperados son:

- Conocer con rapidez cuánto se vendió durante un periodo.
- Saber cuánto dinero fue realmente cobrado y cuánto continúa pendiente.
- Diferenciar cobros en efectivo y transferencia.
- Mantener registro de pagos parciales o mixtos.
- Evitar vender accidentalmente más unidades de las disponibles para el día.
- Identificar qué productos se vendieron y en qué cantidades.
- Calcular la utilidad bruta de las ventas con base en el costo registrado.
- Consultar información histórica sin depender de notas manuales.
- Acceder al sistema desde un teléfono, tableta o computadora mediante navegador.
- Preparar desde el inicio una arquitectura que pueda soportar múltiples tiendas sin mezclar sus datos.
- Reducir el tiempo necesario para elaborar reportes diarios, semanales o mensuales.
- Mantener trazabilidad de fechas y movimientos importantes.

### 2.3. Objetivos y metas

#### Objetivos funcionales

1. Registrar y administrar productos de forma sencilla.
2. Preparar la oferta e inventario de cada jornada sin administrar un inventario permanente complejo.
3. Registrar una venta con el menor número posible de pasos.
4. Registrar correctamente el dinero recibido.
5. Permitir efectivo, transferencia y combinación de métodos.
6. Mantener el saldo real pendiente de una venta.
7. Facilitar el seguimiento de ventas no liquidadas.
8. Producir reportes comprensibles de ventas, cobros y utilidad bruta.
9. Garantizar que cada tienda trabaje únicamente con sus propios datos.

#### Metas de experiencia de uso

- Diseñar primero para pantallas móviles.
- Mantener la captura de una venta común en un flujo corto.
- Mostrar inmediatamente el total de la venta, monto recibido y saldo restante.
- Evitar que el usuario tenga que realizar cálculos manuales.
- Utilizar mensajes de validación claros y orientados a la acción.
- Permitir consultar la operación del día desde el dashboard principal.

#### Metas de seguridad

- Requerir autenticación para cualquier función privada.
- No confiar en identificadores de tienda enviados por el navegador para autorizar acceso.
- Validar la pertenencia del usuario a la tienda en el backend.
- Separar los datos de cada tenant en todas las operaciones de lectura y escritura.
- Proteger todas las comunicaciones mediante HTTPS.
- No almacenar contraseñas directamente en la aplicación.
- Mantener los secretos y credenciales fuera del repositorio.

#### Metas de calidad

- Cubrir mediante pruebas automatizadas las reglas críticas de ventas, pagos, saldos e inventario.
- Probar explícitamente el aislamiento multitenant.
- Realizar pruebas responsive en tamaños de pantalla representativos.
- Contar con un proceso repetible de despliegue.
- Mantener ambientes de desarrollo y producción separados.

#### Planeación por fases

**Fase de diseño**

- Confirmar alcance del MVP.
- Definir flujos de usuario.
- Crear wireframes mobile-first.
- Definir sistema visual y componentes reutilizables.
- Definir modelo conceptual del dominio, sin crear todavía el esquema físico de base de datos.
- Definir reglas de negocio.
- Definir contrato funcional entre frontend y backend.
- Definir estrategia de autenticación, sesión y multitenancy.
- Definir criterios de aceptación de cada módulo.

**Fase de desarrollo**

- Configurar repositorios, ambientes y calidad de código.
- Implementar autenticación y autorización.
- Implementar contexto de tienda.
- Implementar catálogo de productos.
- Implementar configuración e inventario diario.
- Implementar ventas.
- Implementar pagos y saldos pendientes.
- Implementar reportes.
- Implementar cancelaciones controladas.
- Incorporar validaciones, auditoría básica y manejo centralizado de errores.
- Preparar automatización de construcción y despliegue.

**Fase de pruebas**

- Pruebas unitarias de reglas de negocio.
- Pruebas de integración.
- Pruebas end-to-end.
- Pruebas de aislamiento multitenant.
- Pruebas de seguridad básicas.
- Pruebas responsive.
- Pruebas de rendimiento para el volumen esperado del MVP.
- Pruebas de aceptación del usuario.

**Fase de despliegue**

- Crear recursos de producción.
- Configurar dominio o subdominio si se requiere.
- Configurar HTTPS.
- Configurar autenticación.
- Configurar la base PostgreSQL administrada.
- Configurar backend serverless.
- Publicar frontend.
- Configurar variables y secretos.
- Configurar monitoreo de errores, logs y costos.
- Ejecutar pruebas de humo posteriores al despliegue.
- Documentar recuperación y respaldo.

### 2.4. Relación con objetivos corporativos y estrategias de negocio

Aunque el MVP será utilizado inicialmente por un solo propietario, la solución se diseñará con una base SaaS multitenant para no limitar una posible evolución comercial.

La estrategia técnica deberá favorecer:

- Bajo costo operativo inicial.
- Escalamiento gradual.
- Separación de responsabilidades.
- Reducción de infraestructura que requiera administración manual.
- Uso de servicios administrados y serverless.
- Posibilidad de incorporar nuevos tenants sin desplegar una instancia independiente por tienda.
- Portabilidad de la lógica de negocio.
- Uso de tecnologías ampliamente adoptadas.
- Evitar dependencias innecesarias de hardware especializado.

El MVP deberá demostrar que el flujo principal de negocio funciona antes de agregar módulos avanzados de inventario, contabilidad, facturación o administración de personal.

---

## 3. Funcionalidades del producto

| ID | Funcionalidad | Descripción resumida | Prioridad MVP |
|---|---|---|---|
| F-01 | Inicio de sesión y sesión | Autenticar al usuario y mantener una sesión segura | Crítica |
| F-02 | Contexto de tienda | Asociar cada cuenta con su tienda y aislar sus datos | Crítica |
| F-03 | Catálogo de productos | Crear, consultar, editar, activar y desactivar productos | Crítica |
| F-04 | Preparación diaria | Seleccionar productos que se venderán durante una fecha | Crítica |
| F-05 | Inventario diario | Definir y consultar cantidades disponibles del día | Crítica |
| F-06 | Registro de venta | Crear ventas con uno o más productos y cantidades | Crítica |
| F-07 | Pagos | Registrar efectivo, transferencia o pagos mixtos | Crítica |
| F-08 | Pagos parciales | Permitir que una venta permanezca con saldo pendiente | Crítica |
| F-09 | Estado de cobro | Mostrar pagada o pendiente y registrar fechas de cambio | Crítica |
| F-10 | Ventas pendientes | Consultar las ventas con saldo pendiente | Crítica |
| F-11 | Historial de ventas | Consultar ventas anteriores y su detalle | Alta |
| F-12 | Dashboard | Mostrar métricas rápidas del día | Alta |
| F-13 | Reportes de ventas | Consultar información diaria, semanal, mensual o por rango | Alta |
| F-14 | Utilidad bruta | Calcular ingreso, costo y utilidad bruta | Alta |
| F-15 | Cancelación controlada | Anular una venta con motivo y trazabilidad | Alta |
| F-16 | Auditoría básica | Registrar fechas y acciones críticas del sistema | Alta |
| F-17 | Configuración de tienda | Nombre, moneda, zona horaria y preferencias básicas | Media |
| F-18 | Equipo y vendedores | El propietario da de alta y gestiona vendedores; cada quien prepara su propio día y vende solo lo suyo (fase 10, 6.13) | Posterior al MVP |
| F-19 | Reportes del equipo | Ventas, utilidad bruta y pendiente por cobrar de cada vendedor (fase 10, 6.13) | Posterior al MVP |

### Flujo operativo principal

1. El usuario inicia sesión.
2. El sistema identifica automáticamente su tienda.
3. El usuario consulta o actualiza su catálogo de productos.
4. Al iniciar una jornada, selecciona los productos que estarán a la venta.
5. Para cada producto seleccionado registra la cantidad disponible para ese día.
6. Durante la jornada registra cada venta.
7. El sistema calcula el total.
8. El usuario registra el dinero recibido.
9. El usuario selecciona efectivo, transferencia o pago mixto.
10. Si el importe no cubre la venta, el sistema conserva un saldo pendiente.
11. Si posteriormente se recibe otro pago, se agrega al historial de pagos de la venta.
12. Al completarse el importe, la venta queda liquidada.
13. El inventario diario disminuye conforme se venden unidades.
14. El usuario puede consultar en cualquier momento ventas pendientes, ventas realizadas, cobros y utilidad bruta.
15. Al finalizar la jornada, puede consultar el resumen diario sin necesidad de ejecutar un cierre contable complejo.

---

## 4. Clases y características de usuarios

### 4.1. Frecuencia de uso

El usuario propietario utilizará el sistema diariamente durante la operación de la tienda.

Los momentos principales de uso serán:

- Inicio de jornada: configuración de productos y cantidades.
- Durante la jornada: registro continuo de ventas y pagos.
- Durante la jornada: consulta de existencias y pendientes.
- Final de jornada: consulta de ventas, cobros, pendientes y utilidad.
- Periodicamente: consulta de reportes semanales y mensuales.

### 4.2. Grupo de funcionalidades utilizadas

El propietario tendrá acceso a:

- Inicio y cierre de sesión.
- Catálogo de productos.
- Configuración diaria.
- Inventario diario.
- Registro de ventas.
- Registro de pagos.
- Ventas pendientes.
- Historial.
- Reportes.
- Dashboard.
- Configuración básica de su tienda.

### 4.3. Privilegios de seguridad

Para el MVP existirá un perfil principal denominado **Propietario**. Desde la fase 10 también existe el perfil **Vendedor** (4.5 y 6.13).

El propietario y el vendedor podrán operar únicamente sobre los recursos pertenecientes a su tenant. Dentro de la tienda, el vendedor solo accede a lo permitido por la matriz de 4.6 y solo a las ventas que él mismo registró.

El backend será responsable de comprobar el tenant asociado a la identidad autenticada. La aplicación cliente no tendrá autoridad para cambiar libremente el identificador de tenant.

No se permitirá:

- Consultar información de otra tienda.
- Modificar información de otra tienda.
- Introducir un identificador de tenant para saltar las reglas de aislamiento.
- Ejecutar operaciones privadas sin sesión válida.
- Eliminar definitivamente ventas registradas como mecanismo normal de corrección.

### 4.4. Nivel de experiencia

Se asumirá que el usuario puede utilizar un navegador web y aplicaciones móviles comunes, pero no necesita conocimientos técnicos, contables o de administración de sistemas.

La interfaz deberá reducir términos técnicos y priorizar conceptos cotidianos como:

- Producto.
- Cantidad.
- Precio.
- Total.
- Recibido.
- Falta por pagar.
- Efectivo.
- Transferencia.
- Pagada.
- Pendiente.
- Venta cancelada.

### 4.5. Tipos de usuario

#### Propietario / Administrador de tienda

Usuario incluido en el MVP. Tiene control de la operación de su propia tienda.

#### Vendedor

Incluido a partir de la fase 10 (sección 6.13), una vez que el propietario apruebe T101 a T115 de [decisiones.md](decisiones.md). Lo da de alta el propietario de la tienda. Prepara su propio día con productos del catálogo del propietario, registra ventas y pagos, cancela sus propias ventas y anula sus propios pagos, y consulta sus ventas, sus pendientes y sus reportes con su utilidad bruta. No crea ni edita productos, no ajusta el horario de la jornada, no configura la tienda ni gestiona a otras personas, y no puede cambiar su contraseña (la fija el propietario al darlo de alta). No existe un rol "administrador" aparte: el propietario es quien gestiona el equipo.

#### Administrador global de plataforma

No se requiere interfaz de administración global durante el MVP. Cualquier necesidad operativa global deberá limitarse al equipo técnico y a herramientas administrativas seguras.

### 4.6. Funcionalidades relevantes por tipo de usuario

| Funcionalidad | Propietario | Vendedor (fase 10) | Administrador técnico |
|---|---:|---:|---:|
| Iniciar sesión | Sí | Sí | Según necesidad |
| Crear y editar productos | Sí | No | No como operación normal |
| Consultar productos (precio y costo) | Sí | Sí, solo lectura | No |
| Preparar su día (productos y cantidades) | Sí | Sí, el propio | No |
| Ver el inventario del día | El propio y el de cada vendedor | Solo el propio | No |
| Ajustar el horario de la jornada | Sí | No | No |
| Registrar ventas | Sí | Sí | No |
| Registrar pagos | Sí | Sí, en sus ventas | No |
| Consultar ventas, detalle y pendientes | Todas | Solo las suyas | No |
| Cancelar ventas y anular pagos | Sí, de toda la tienda | Sí, solo de sus ventas | No |
| Consultar reportes y utilidad bruta | De toda la tienda | Solo los suyos | No |
| Reportes del equipo (por vendedor y lo que se le debe a cada uno) | Sí | No | No |
| Alta y baja (o reactivación) de vendedores | Sí | No | No |
| Configurar tienda | Sí | No (solo lee moneda y zona horaria) | Soporte excepcional |
| Cambiar su propia contraseña desde la app | No por ahora | No por ahora | No |
| Acceder a otra tienda | No | No | Solo mediante mecanismos técnicos auditados |

---|---:|---:|---:|
| Iniciar sesión | Sí | Futuro | Según necesidad |
| Administrar productos | Sí | Configurable en futuro | No como operación normal |
| Configurar inventario diario | Sí | Futuro | No |
| Registrar ventas | Sí | Futuro | No |
| Registrar pagos | Sí | Futuro | No |
| Consultar pendientes | Sí | Futuro | No |
| Consultar reportes | Sí | Restringible en futuro | No |
| Configurar tienda | Sí | No | Soporte excepcional |
| Acceder a otra tienda | No | No | Solo mediante mecanismos técnicos auditados |

---

## 5. Entorno operativo

### 5.1. Plataforma de hardware

La solución se ejecutará principalmente en infraestructura cloud y deberá poder ser utilizada desde:

- Teléfonos Android modernos.
- iPhone.
- Tabletas.
- Computadoras de escritorio.
- Laptops.

No se requerirá hardware POS especializado para operar el MVP.

Como objetivos mínimos de interfaz se considerarán:

- Pantallas móviles desde aproximadamente 360 px de ancho.
- Tabletas.
- Pantallas de escritorio convencionales.

La aplicación deberá funcionar mediante controles táctiles y mediante mouse/teclado.

### 5.2. Sistema operativo

Al tratarse de una aplicación web, el sistema deberá ser independiente del sistema operativo del usuario final.

Se contemplará compatibilidad con versiones modernas y soportadas de:

- Android.
- iOS.
- Windows.
- macOS.
- Linux.

El backend utilizará un entorno administrado/serverless en AWS, por lo que no se dependerá de la administración manual de un sistema operativo de servidor en el MVP.

### 5.3. Sistemas o componentes con los que debe coexistir

#### Stack propuesto

**Frontend**

- React.
- TypeScript.
- Vite como herramienta de construcción.
- Tailwind CSS para estilos responsive y consistencia visual.
- Librería de componentes accesibles basada en componentes reutilizables, evitando dependencia excesiva de componentes cerrados.
- Cliente HTTP con capa centralizada de manejo de errores y autenticación.

**Backend**

- Node.js en versión LTS soportada al momento de implementar.
- TypeScript.
- Fastify como framework HTTP ligero.
- Arquitectura modular separando controladores/adaptadores, casos de uso, reglas de negocio y acceso a datos.
- Validación explícita de entradas mediante esquemas.
- API HTTP de estilo REST para el MVP.

**Persistencia**

- PostgreSQL administrado.
- Propuesta inicial: Neon PostgreSQL en plan gratuito para el MVP.
- La capa de persistencia deberá permanecer suficientemente desacoplada para permitir migrar posteriormente a Amazon RDS PostgreSQL u otro proveedor PostgreSQL sin reescribir la lógica de negocio.
- ORM/query builder ligero compatible con PostgreSQL y entornos serverless; la selección final deberá priorizar control de consultas, migraciones y uso correcto de conexiones.

**Autenticación**

- Amazon Cognito User Pools.
- Autenticación con correo/usuario y contraseña.
- Gestión de tokens y renovación de sesión.
- La aplicación deberá evitar almacenar credenciales del usuario.
- Para el navegador se priorizará una estrategia que reduzca exposición de tokens a JavaScript, mediante cookies seguras cuando la arquitectura final lo permita.

**Infraestructura AWS**

- AWS Lambda para ejecutar la API.
- Amazon API Gateway para publicar la API.
- AWS Amplify Hosting o, como alternativa, Amazon S3 + Amazon CloudFront para publicar el frontend.
- Amazon Cognito para identidad.
- Amazon CloudWatch para logs y monitoreo.
- AWS Systems Manager Parameter Store o mecanismo equivalente para parámetros no incluidos en código.
- AWS Budgets y alertas de facturación para vigilar consumos.

**Control de versiones y CI/CD**

- Git.
- GitHub.
- GitHub Actions o integración de despliegue administrada de AWS.
- Estrategia de ramas simple para un proyecto de un solo desarrollador, evitando procesos empresariales innecesarios.

#### Justificación del stack

El stack propuesto se orienta a un MVP de bajo tráfico y un solo desarrollador:

- React es suficiente para una aplicación privada tipo dashboard/POS y no requiere renderizado para SEO.
- TypeScript permite compartir tipos y reducir errores.
- Una SPA evita complejidad de renderizado de servidor innecesaria.
- Lambda elimina la necesidad de mantener un servidor encendido.
- PostgreSQL es apropiado para ventas, pagos, saldos y reportes que requieren integridad relacional.
- Cognito evita construir un sistema propio de almacenamiento de contraseñas.
- Neon permite iniciar con PostgreSQL administrado sin operar un servidor de base de datos.
- El diseño serverless se adapta a un uso intermitente y de bajo volumen.

#### Consideración sobre disponibilidad y costo

El objetivo funcional será que la aplicación pueda ser accedida en cualquier momento. Sin embargo, **ningún plan gratuito deberá considerarse equivalente a un SLA de producción**.

Los servicios gratuitos o free tier pueden:

- Cambiar límites.
- Suspender o escalar a cero recursos inactivos.
- Presentar latencia de reactivación.
- Dejar de ser gratuitos al superar cuotas.
- Modificar sus condiciones comerciales.

Por lo tanto, la arquitectura deberá permitir migrar a planes pagados sin rediseñar la aplicación.

Para el MVP, la expectativa es permanecer dentro de los límites gratuitos por tratarse de un único usuario y volumen bajo, pero deberá configurarse monitoreo de consumo desde el primer despliegue.

---

## 6. Requerimientos funcionales

### 6.1. Autenticación y manejo de sesión

#### Descripción

Permitir que el propietario acceda a la aplicación utilizando credenciales válidas y mantener una sesión autenticada.

#### Prioridad

Crítica.

#### Acciones iniciadoras y comportamiento esperado

- El usuario abre la aplicación.
- Si no existe sesión válida, el sistema muestra el inicio de sesión.
- El usuario introduce sus credenciales.
- El proveedor de identidad valida la autenticación.
- Si es correcta, la aplicación obtiene el contexto del usuario y su tienda.
- El usuario es dirigido al dashboard.
- La sesión podrá renovarse sin solicitar credenciales en cada operación mientras siga siendo válida.
- Al cerrar sesión, las credenciales/tokens de sesión deberán invalidarse o dejar de ser utilizables por la aplicación.

#### Requerimientos funcionales

- RF-001. El sistema deberá requerir autenticación para acceder a módulos privados.
- RF-002. El sistema deberá identificar de forma inequívoca al usuario autenticado.
- RF-003. El sistema deberá asociar la sesión con el tenant correspondiente.
- RF-004. El sistema deberá manejar expiración de sesión.
- RF-005. El usuario deberá poder cerrar sesión.
- RF-006. El frontend deberá redirigir al inicio de sesión cuando la sesión sea inválida.
- RF-007. El backend deberá validar la autenticación independientemente de las validaciones del frontend.
- RF-008. El sistema deberá registrar fecha y hora de eventos de autenticación relevantes cuando sea técnicamente razonable.

#### Respuesta ante condiciones de error

- Credenciales incorrectas: mostrar un mensaje genérico sin revelar si el usuario o la contraseña fueron incorrectos.
- Sesión expirada: solicitar una nueva autenticación cuando no pueda renovarse.
- Servicio de identidad no disponible: mostrar un error temporal y evitar aparentar que el usuario inició sesión.
- Token inválido: rechazar la operación.

#### Manejo de entradas de datos inválidas

- Validar formato de correo si se utiliza correo como identificador.
- Rechazar campos obligatorios vacíos.
- Aplicar la política de contraseña definida en el proveedor de identidad.
- Limitar intentos según capacidades del proveedor y configuración de seguridad.

---

### 6.2. Gestión del tenant y tienda

#### Descripción

Mantener un contexto de tienda asociado al usuario y utilizarlo en todas las operaciones del sistema.

#### Prioridad

Crítica.

#### Acciones iniciadoras y comportamiento esperado

Al iniciar sesión, el backend identifica la tienda correspondiente. Todas las consultas y modificaciones posteriores operan exclusivamente dentro de ese contexto.

#### Requerimientos funcionales

- RF-009. Cada usuario (el propietario y, desde la fase 10, cada vendedor) deberá estar asociado a una sola tienda.
- RF-010. Cada recurso de negocio deberá pertenecer a un tenant cuando corresponda.
- RF-011. El backend deberá determinar el tenant autorizado a partir de la identidad autenticada.
- RF-012. El backend no deberá confiar en un identificador de tenant enviado libremente desde el cliente para conceder acceso.
- RF-013. Una tienda no deberá poder consultar información de otra.
- RF-014. Una tienda no deberá poder modificar información de otra.
- RF-015. Los reportes deberán calcularse únicamente con información del tenant actual.
- RF-016. El nombre y configuración básica de la tienda deberán poder consultarse.

#### Respuesta ante condiciones de error

- Usuario sin tienda asociada: bloquear el acceso operacional y mostrar un estado de configuración incompleta.
- Intento de acceso cruzado: responder como recurso no autorizado/no disponible y registrar el incidente técnico.
- Tenant desactivado: impedir operaciones de negocio.

#### Manejo de entradas de datos inválidas

- Validar campos de configuración de tienda.
- No aceptar identificadores de tenant arbitrarios como fuente de autorización.
- Validar longitud y caracteres permitidos en nombres configurables.

---

### 6.3. Gestión del catálogo de productos

#### Descripción

Permitir registrar los productos que la tienda puede vender. El catálogo es permanente y diferente del inventario diario.

#### Prioridad

Crítica.

#### Acciones iniciadoras y comportamiento esperado

El propietario abre el catálogo, registra un producto y proporciona sus datos. Posteriormente podrá seleccionarlo en la preparación de una jornada.

#### Requerimientos funcionales

- RF-017. El usuario deberá poder crear un producto.
- RF-018. Todo producto deberá tener un nombre.
- RF-019. Todo producto deberá tener un precio de venta válido.
- RF-020. Todo producto deberá permitir registrar un costo/precio de compra.
- RF-021. Los importes monetarios deberán manejar precisión decimal.
- RF-022. Se podrán incluir datos opcionales como descripción, categoría, unidad, código interno y notas.
- RF-023. El usuario deberá poder editar un producto.
- RF-024. El usuario deberá poder activar o desactivar un producto.
- RF-025. Desactivar un producto no deberá eliminar su historial de ventas.
- RF-026. Los cambios de precio futuros no deberán modificar los importes históricos de ventas ya registradas.
- RF-027. El catálogo deberá permitir búsqueda simple por nombre y, si existe, código interno.

#### Respuesta ante condiciones de error

- Error al guardar: conservar los datos ingresados en pantalla y mostrar la causa comprensible.
- Conflicto de edición: evitar sobrescrituras silenciosas cuando sea posible.
- Producto no encontrado: informar que ya no está disponible.

#### Manejo de entradas de datos inválidas

- Precio de venta negativo: rechazar.
- Costo negativo: rechazar.
- Nombre vacío: rechazar.
- Importes no numéricos: rechazar.
- Textos por encima del límite definido: rechazar con indicación clara.

---

### 6.4. Configuración de productos e inventario diario

#### Descripción

Permitir elegir, para una fecha determinada, cuáles productos estarán disponibles y cuántas unidades existirán inicialmente para venta.

Este inventario es deliberadamente simple y corresponde a una **existencia diaria**, no a un inventario empresarial permanente.

#### Prioridad

Crítica.

#### Acciones iniciadoras y comportamiento esperado

- El usuario entra a la preparación del día.
- Selecciona productos del catálogo.
- Introduce la cantidad inicial disponible de cada uno.
- Guarda la configuración.
- Los productos quedan habilitados para vender durante esa fecha.
- Cada venta descuenta unidades de la disponibilidad del día.

#### Requerimientos funcionales

- RF-028. El usuario deberá poder seleccionar productos para una fecha.
- RF-029. El usuario deberá poder establecer cantidad inicial de cada producto seleccionado.
- RF-030. Solo los productos activos deberán poder agregarse normalmente a una nueva jornada.
- RF-031. El sistema deberá mostrar cantidad inicial, vendida y disponible.
- RF-032. Una venta deberá disminuir la cantidad disponible del producto para esa jornada.
- RF-033. Por defecto, no se deberá permitir vender una cantidad mayor a la disponible.
- RF-034. El sistema deberá impedir cantidades iniciales negativas.
- RF-035. La configuración de un día no deberá cambiar automáticamente la configuración de otro día.
- RF-036. El usuario deberá poder consultar jornadas anteriores en modo histórico.
- RF-037. Una venta cancelada deberá restituir las unidades correspondientes cuando aplique.
- RF-038. Las modificaciones manuales de la cantidad inicial después de existir ventas deberán estar restringidas o claramente auditadas para evitar inconsistencias.

Con la fase 10 (6.13) la disponibilidad diaria pasa a ser **por persona**: RF-028 a RF-038 se aplican a la preparación de cada usuario (RF-130 a RF-133). En una tienda sin vendedores no hay diferencia con el MVP.

#### Respuesta ante condiciones de error

- Producto ya agregado al día: evitar duplicado y dirigir al registro existente.
- Cantidad insuficiente: impedir completar la venta e indicar disponibilidad.
- Fallo al guardar configuración: no mostrarla como confirmada hasta recibir respuesta correcta.

#### Manejo de entradas de datos inválidas

- Cantidades negativas: rechazar.
- Cantidades no numéricas: rechazar.
- Cantidades decimales: permitir únicamente si el producto utiliza una unidad que admita fracciones; para el MVP se recomienda trabajar inicialmente con unidades enteras salvo requerimiento posterior.
- Producto inexistente o de otro tenant: rechazar.

---

### 6.5. Registro de ventas

#### Descripción

Permitir crear una venta utilizando los productos disponibles en la jornada.

#### Prioridad

Crítica.

#### Acciones iniciadoras y comportamiento esperado

- El usuario selecciona “Nueva venta”.
- Agrega uno o más productos.
- Selecciona cantidades.
- El sistema calcula subtotales y total.
- El usuario confirma la venta.
- El sistema registra fecha y hora.
- El inventario diario se descuenta de forma consistente.
- El usuario puede registrar inmediatamente el pago o dejar saldo pendiente.

#### Requerimientos funcionales

- RF-039. Una venta deberá contener al menos un producto.
- RF-040. Cada concepto deberá indicar producto, cantidad y precio aplicado.
- RF-041. El sistema deberá calcular el subtotal de cada concepto.
- RF-042. El sistema deberá calcular el total de la venta.
- RF-043. El sistema deberá registrar fecha y hora de creación.
- RF-044. El sistema deberá conservar el precio de venta aplicado en ese momento.
- RF-045. El sistema deberá conservar el costo del producto aplicable al momento de la venta para calcular utilidad histórica.
- RF-046. La venta deberá pertenecer al tenant autenticado.
- RF-047. La confirmación de venta y descuento de inventario deberán comportarse como una única operación consistente.
- RF-048. Si una parte crítica falla, no deberá quedar una venta confirmada con inventario incorrecto.
- RF-049. El sistema deberá asignar un identificador interno legible o consultable a la venta.
- RF-050. El usuario podrá agregar una nota opcional a la venta.

#### Respuesta ante condiciones de error

- Inventario insuficiente: rechazar confirmación y mostrar el producto afectado.
- Producto ya no disponible: solicitar corrección de la venta.
- Falla de red: no duplicar automáticamente la venta al reintentar.
- Error interno: mostrar que la operación no fue confirmada.

#### Manejo de entradas de datos inválidas

- Cantidad cero o negativa: rechazar.
- Producto de otro tenant: rechazar.
- Producto no habilitado para la jornada: rechazar.
- Importe manipulado desde el frontend: recalcular y validar en backend.

---

### 6.6. Registro de pagos

#### Descripción

Permitir asociar pagos a una venta y registrar cuánto dinero fue recibido, mediante qué método y en qué momento.

El modelo funcional utilizará **movimientos de pago** en lugar de un único campo de pago. Esto permite manejar correctamente pagos parciales, pagos posteriores y pagos mixtos.

#### Prioridad

Crítica.

#### Acciones iniciadoras y comportamiento esperado

El usuario registra uno o varios pagos para la venta. Cada pago tendrá importe, método y fecha/hora. El sistema recalculará el total cobrado y el saldo pendiente.

#### Requerimientos funcionales

- RF-051. El usuario deberá poder registrar un pago en efectivo.
- RF-052. El usuario deberá poder registrar un pago por transferencia.
- RF-053. El usuario deberá poder registrar un pago mixto utilizando al menos una parte en efectivo y otra por transferencia.
- RF-054. En pagos mixtos, cada importe deberá quedar identificado por método.
- RF-055. Todo movimiento de pago deberá registrar fecha y hora.
- RF-056. El sistema deberá mostrar el total recibido acumulado.
- RF-057. El sistema deberá mostrar el saldo pendiente.
- RF-058. El usuario deberá poder registrar un pago al momento de crear la venta.
- RF-059. El usuario deberá poder agregar un pago posteriormente a una venta pendiente.
- RF-060. El historial de pagos de una venta deberá permanecer consultable.
- RF-061. El backend deberá validar que los pagos pertenecen a una venta del mismo tenant.
- RF-062. El sistema deberá evitar que un pago duplicado por reintento de red se registre silenciosamente dos veces.

#### Respuesta ante condiciones de error

- Venta inexistente: no registrar el pago.
- Venta cancelada: no aceptar nuevos pagos salvo flujo específico de corrección futura.
- Falla de red: indicar que no se confirmó la operación y prevenir duplicados.
- Pago inválido: mostrar un mensaje específico.

#### Manejo de entradas de datos inválidas

- Importe cero o negativo: rechazar.
- Método no permitido: rechazar.
- Importe no numérico: rechazar.
- Suma incoherente en un pago mixto: solicitar corrección.
- Sobrepago: para el MVP deberá advertirse y no confirmarse automáticamente, salvo que se diseñe explícitamente un flujo de cambio en efectivo.

---

### 6.7. Estado de pago y saldo pendiente

#### Descripción

Determinar si una venta está liquidada o conserva saldo por cobrar y mantener trazabilidad de los cambios.

#### Prioridad

Crítica.

#### Acciones iniciadoras y comportamiento esperado

Al crear una venta, el usuario puede indicar que se paga en ese momento o que queda pendiente. El sistema valida los pagos registrados y mantiene un estado coherente con el saldo.

#### Requerimientos funcionales

- RF-063. Toda venta deberá exponer un estado de cobro.
- RF-064. Como mínimo existirán los estados “Pendiente” y “Pagada”.
- RF-065. Internamente podrá distinguirse “Parcialmente pagada” para mejorar reportes, aun cuando la interfaz agrupe esta condición dentro de pendientes.
- RF-066. Una venta deberá considerarse pagada únicamente cuando el saldo pendiente sea cero.
- RF-067. Una venta con saldo mayor a cero deberá aparecer en pendientes.
- RF-068. El sistema deberá registrar la fecha y hora en que una venta queda completamente pagada.
- RF-069. El sistema deberá registrar fecha y hora de cada pago parcial.
- RF-070. El usuario no deberá poder marcar como pagada una venta cuyo monto recibido sea insuficiente.
- RF-071. El estado deberá mantenerse consistente con los pagos registrados.
- RF-072. La pantalla de venta deberá mostrar total, recibido y saldo pendiente.

#### Respuesta ante condiciones de error

- Intento de marcar como pagada sin cubrir el total: rechazar y mostrar el saldo.
- Inconsistencia detectada: bloquear cambios que agraven la inconsistencia y registrar el error para revisión.

#### Manejo de entradas de datos inválidas

- Estados desconocidos: rechazar.
- Fecha manipulada desde el cliente: utilizar como fuente principal la hora del backend para eventos críticos.
- Importes con precisión inválida: normalizar o rechazar según regla monetaria.

---

### 6.8. Reporte diario de ventas pendientes

#### Descripción

Mostrar las ventas que mantienen saldo pendiente, con énfasis en las que continúan abiertas al consultar el día.

#### Prioridad

Crítica.

#### Acciones iniciadoras y comportamiento esperado

El usuario abre “Pendientes” y obtiene una lista de ventas con saldo por cobrar.

#### Requerimientos funcionales

- RF-073. El sistema deberá mostrar todas las ventas no liquidadas del tenant.
- RF-074. La vista deberá poder filtrar por fecha de venta.
- RF-075. La vista deberá mostrar como mínimo fecha, identificador de venta, total, recibido y saldo.
- RF-076. El usuario deberá poder abrir el detalle de la venta.
- RF-077. Desde el detalle deberá poder agregar un nuevo pago.
- RF-078. Una venta liquidada deberá dejar de aparecer como pendiente.
- RF-079. El dashboard diario deberá destacar el número de ventas pendientes y el monto total pendiente.
- RF-080. Las ventas pendientes de días anteriores no deberán desaparecer por cambiar de fecha.

#### Respuesta ante condiciones de error

- Sin resultados: mostrar un estado vacío comprensible.
- Error al cargar: permitir reintentar y no mostrar totales parciales como definitivos.

#### Manejo de entradas de datos inválidas

- Rango de fechas inválido: rechazar y solicitar corrección.
- Fecha final anterior a fecha inicial: rechazar.

---

### 6.9. Reportes de ventas y métricas destacadas

#### Descripción

Permitir analizar la operación por día, semana, mes o rango personalizado.

#### Prioridad

Alta.

#### Acciones iniciadoras y comportamiento esperado

El usuario selecciona un periodo y el sistema calcula indicadores correspondientes exclusivamente a su tienda.

#### Requerimientos funcionales

- RF-081. El sistema deberá proporcionar reporte diario.
- RF-082. El sistema deberá proporcionar reporte semanal.
- RF-083. El sistema deberá proporcionar reporte mensual.
- RF-084. El sistema deberá permitir un rango personalizado.
- RF-085. El reporte deberá mostrar ventas brutas.
- RF-086. El reporte deberá mostrar monto efectivamente cobrado.
- RF-087. El reporte deberá mostrar monto pendiente.
- RF-088. El reporte deberá mostrar número de ventas.
- RF-089. El reporte deberá mostrar ticket promedio.
- RF-090. El reporte deberá mostrar unidades vendidas.
- RF-091. El reporte deberá permitir identificar productos con mayor cantidad vendida.
- RF-092. El reporte deberá mostrar distribución de cobros por efectivo y transferencia.
- RF-093. Los pagos mixtos deberán aportar la parte correspondiente a cada método.
- RF-094. Las ventas canceladas deberán excluirse de los indicadores de ventas efectivas o mostrarse de manera separada.
- RF-095. Todos los reportes deberán respetar la zona horaria configurada para la tienda.

#### Respuesta ante condiciones de error

- Periodo excesivamente amplio para los límites del sistema: solicitar un rango menor si fuera necesario.
- Sin datos: mostrar ceros y estado vacío, no un error.
- Fallo de consulta: informar que el reporte no pudo calcularse.

#### Manejo de entradas de datos inválidas

- Fechas inválidas: rechazar.
- Rangos invertidos: rechazar.
- Parámetros no permitidos: ignorar de forma segura o rechazar en backend.

---

### 6.10. Reportes de utilidad bruta y pérdidas

#### Descripción

Calcular el resultado bruto de las ventas utilizando el precio de venta y costo de compra conservados históricamente en cada venta.

#### Prioridad

Alta.

#### Acciones iniciadoras y comportamiento esperado

El usuario selecciona día, semana, mes o rango. El sistema suma ingresos de ventas válidas, calcula el costo de los productos vendidos y obtiene utilidad bruta.

#### Requerimientos funcionales

- RF-096. El sistema deberá calcular ingresos por ventas del periodo.
- RF-097. El sistema deberá calcular costo de mercancía vendida del periodo.
- RF-098. El sistema deberá calcular utilidad bruta como ingreso de ventas menos costo de mercancía vendida.
- RF-099. El sistema deberá mostrar margen bruto porcentual cuando los datos permitan calcularlo.
- RF-100. El sistema deberá identificar un resultado bruto negativo como pérdida bruta.
- RF-101. El reporte deberá estar disponible por día.
- RF-102. El reporte deberá estar disponible por semana.
- RF-103. El reporte deberá estar disponible por mes.
- RF-104. El reporte deberá permitir rango personalizado.
- RF-105. El cálculo histórico deberá utilizar los costos y precios aplicados cuando se realizó la venta y no el precio actual del catálogo.

#### Aclaración funcional

El MVP **no registra gastos operativos, impuestos, nómina, renta ni otros egresos**, por lo que el resultado mostrado no representa utilidad neta contable.

Los términos recomendados en interfaz son:

- Ventas.
- Costo de productos vendidos.
- Utilidad bruta.
- Margen bruto.

#### Respuesta ante condiciones de error

- Venta sin costo histórico válido: señalarla como dato incompleto y evitar ocultar la inconsistencia.
- Sin ventas: reportar cero.
- Venta cancelada: excluir del resultado efectivo.

#### Manejo de entradas de datos inválidas

Los costos y precios utilizados deberán provenir de registros validados. No se aceptarán parámetros monetarios enviados por el cliente para alterar el cálculo del reporte.

---

### 6.11. Cancelación y corrección controlada de ventas

#### Descripción

Permitir corregir errores sin destruir el historial.

#### Prioridad

Alta.

#### Acciones iniciadoras y comportamiento esperado

El usuario abre una venta y selecciona cancelar. El sistema solicita confirmación y motivo. Si la venta es cancelable, actualiza su estado, registra fecha/hora y restituye inventario cuando corresponda.

#### Requerimientos funcionales

- RF-106. Las ventas confirmadas no deberán eliminarse físicamente como operación normal.
- RF-107. El usuario deberá poder cancelar una venta.
- RF-108. La cancelación deberá registrar fecha y hora.
- RF-109. La cancelación deberá registrar un motivo.
- RF-110. La cancelación deberá revertir el efecto de unidades vendidas sobre el inventario diario cuando proceda.
- RF-111. Los reportes deberán distinguir ventas canceladas.
- RF-112. Los pagos asociados deberán conservarse para trazabilidad; el MVP no incluirá un sistema bancario de reembolso automático.
- RF-113. Si una cancelación requiere devolver dinero, la interfaz deberá advertir que el reembolso real se realiza fuera del sistema salvo que se agregue dicho módulo en el futuro.

#### Respuesta ante condiciones de error

- Venta ya cancelada: no repetir la operación.
- Inventario diario no disponible: registrar el incidente y no ocultar la inconsistencia.
- Error parcial: utilizar una operación transaccional para evitar cancelar la venta sin restaurar el inventario requerido.

#### Manejo de entradas de datos inválidas

- Motivo vacío: rechazar si se define como obligatorio.
- Venta de otro tenant: rechazar.
- Identificador inexistente: informar de forma segura.

---

### 6.12. Auditoría y trazabilidad básica

#### Descripción

Conservar información mínima para entender cuándo ocurrieron las operaciones críticas.

#### Prioridad

Alta.

#### Acciones iniciadoras y comportamiento esperado

El sistema registra automáticamente marcas de tiempo y datos técnicos necesarios en operaciones importantes.

#### Requerimientos funcionales

- RF-114. Registrar fecha de creación de la venta.
- RF-115. Registrar fecha de cada pago.
- RF-116. Registrar fecha en que una venta queda pagada.
- RF-117. Registrar fecha de cancelación.
- RF-118. Registrar fecha de creación y modificación de productos.
- RF-119. Registrar el usuario responsable cuando exista más de un usuario en un tenant. Desde la fase 10 aplica a cada venta, pago, cancelación, ajuste de disponibilidad y operación de equipo.
- RF-120. Los timestamps críticos deberán originarse en el backend.
- RF-121. Los registros de auditoría no deberán exponer secretos o tokens.
- RF-122. Los logs técnicos y el historial de negocio deberán considerarse conceptos diferentes.

#### Respuesta ante condiciones de error

Si no puede registrarse la información necesaria para una operación crítica, la operación no deberá confirmarse como exitosa cuando dicha ausencia comprometa la integridad del historial.

#### Manejo de entradas de datos inválidas

El cliente no deberá poder sustituir arbitrariamente las fechas de auditoría generadas por el sistema.

---

### 6.13. Equipo y vendedores (fase 10, posterior al MVP)

#### Descripción

Permitir que el propietario de una tienda dé de alta a vendedores y los gestione. Cada vendedor prepara su propio día con productos del catálogo del propietario, registra ventas y pagos, y ve solo lo suyo, incluida su utilidad bruta. El propietario ve a todo el equipo: ventas, utilidad bruta y lo que le deben a cada vendedor. Una tienda sin vendedores funciona exactamente como en el MVP. No existe un rol "administrador" aparte.

#### Prioridad

Alta, posterior al MVP. Requiere aprobación del propietario (T101 a T115 de [decisiones.md](decisiones.md)).

#### Acciones iniciadoras y comportamiento esperado

- El propietario entra a Equipo, da de alta un vendedor (nombre, correo y contraseña inicial) y se la entrega.
- El vendedor inicia sesión, prepara su día (elige productos del catálogo y cantidades), vende y cobra.
- El propietario consulta los reportes del equipo y, cuando hace falta, da de baja o reactiva a un vendedor.

#### Requerimientos funcionales

Roles y autorización

- RF-123. Cada tienda tendrá exactamente un propietario y hasta 10 vendedores. Los roles son `owner` y `seller`.
- RF-124. Una tienda sin vendedores deberá operar exactamente como en el MVP.
- RF-125. El backend deberá determinar el rol y el estado de la persona a partir de su identidad autenticada; el cliente no podrá enviarlos. Toda ruta privada deberá declarar el permiso que exige, y una ruta sin permiso declarado no deberá poder ponerse en servicio.
- RF-126. El permiso deberá verificarse en el caso de uso y no solo en la ruta, y el control de la interfaz será solo una comodidad.
- RF-127. Un vendedor solo podrá consultar y operar las ventas, pagos, pendientes, historial, dashboard y reportes de las ventas que él registró. Una venta de otro vendedor deberá responderse como no disponible.
- RF-128. Un vendedor no podrá crear, editar, activar ni desactivar productos, ni modificar la configuración de la tienda ni el horario de una jornada. Sí podrá consultar los productos activos con su precio y su costo.
- RF-129. Un vendedor podrá cancelar sus propias ventas y anular sus propios pagos, con motivo y con las mismas reglas que el propietario (RF-106 a RF-113). No podrá hacerlo sobre ventas o pagos de otra persona. Cancelar restituye el inventario a la disponibilidad de esa venta cuando aplique.

Inventario del día por persona

- RF-130. Cada usuario deberá preparar su propio día: elige productos activos del catálogo y la cantidad inicial de cada uno, y solo podrá vender lo que preparó.
- RF-131. La disponibilidad (inicial, ajustes, vendida y disponible) será por persona, producto y fecha. Vender descuenta la disponibilidad de quien vende, y cancelar la restituye a la de esa venta cuando aplique (RF-037).
- RF-132. El propietario podrá consultar, en solo lectura, el día de cada vendedor.
- RF-133. Dos personas de la misma tienda podrán preparar el mismo producto en la misma fecha sin afectarse.

Gestión del equipo

- RF-134. El propietario podrá dar de alta un vendedor registrando su correo y una contraseña (y un nombre para mostrar) que cumpla la política de contraseñas; con eso el vendedor podrá iniciar sesión.
- RF-135. El propietario podrá dar de baja a un vendedor; su acceso deberá bloquearse de inmediato y su historial se conservará. También podrá reactivarlo.
- RF-136. Por ahora la contraseña que fija el propietario no se podrá cambiar desde la app, ni por el vendedor ni por el propietario. Si se olvida, se restablece desde CloudShell (manual de despliegue). Cambiar y restablecer contraseñas desde la app queda como mejora futura.
- RF-137. La app no mostrará ninguna pantalla de cambio ni de restablecimiento de contraseña (T108).
- RF-138. Las contraseñas no deberán guardarse, registrarse en logs ni aparecer en la auditoría.
- RF-139. El alta, la baja y la reactivación deberán quedar auditadas con usuario y fecha.
- RF-140. Un correo no podrá pertenecer a más de una tienda.

Reportes del equipo

- RF-141. El propietario deberá ver el nombre del vendedor en cada venta del historial, del detalle y de pendientes, y poder filtrar por vendedor.
- RF-142. El sistema deberá ofrecer un reporte por vendedor y periodo con ventas, número de ventas, ticket promedio, unidades, cobrado (total y por método), pendiente de las ventas del periodo, costo, utilidad bruta, margen bruto, participación en las ventas de la tienda y ventas canceladas aparte.
- RF-143. El sistema deberá mostrar, por vendedor, lo que se le debe en total: la suma de los saldos de sus ventas vigentes de cualquier día y el número de ventas con saldo, sin depender del periodo elegido. El propietario lo verá en el reporte, en Hoy y en Pendientes.
- RF-144. La suma de todas las filas del reporte por vendedor (incluida la del propietario) deberá coincidir con el reporte general en ventas, costo, utilidad bruta y pendiente.
- RF-145. El sistema deberá ofrecer el detalle de un vendedor: sus cifras del periodo, su pendiente con antigüedad, sus productos más vendidos y su serie diaria.
- RF-146. Un vendedor deberá ver sus propios reportes y su utilidad bruta, calculada con el precio y el costo congelados en sus ventas, con el mismo cálculo que ve el propietario en su fila.
- RF-147. Los reportes del equipo solo se mostrarán cuando la tienda tenga al menos un vendedor. Un vendedor dado de baja seguirá apareciendo mientras tenga ventas en el periodo.

#### Respuesta ante condiciones de error

- Acción sin permiso: rechazar con un mensaje comprensible; si el recurso es de otro vendedor, responder como no disponible.
- Correo ya existente o tope de vendedores alcanzado: rechazar indicando el motivo.
- Si falla el alta en la base después de crear la cuenta en el proveedor de identidad, deshacer la cuenta creada.
- Cuenta dada de baja: impedir el acceso e indicar que contacte al propietario.

#### Manejo de entradas de datos inválidas

- Nombre vacío o de más de 80 caracteres, correo inválido o contraseña que no cumpla la política: rechazar con el campo afectado.
- Identificador de vendedor de otra tienda: rechazar como no disponible.

---

## 7. Reglas de negocio

1. Cada usuario propietario del MVP pertenece a una tienda.
2. Cada tienda constituye un tenant independiente.
3. Un tenant no puede acceder a datos de otro tenant.
4. El tenant autorizado se obtiene del contexto autenticado y no de un valor libre enviado por el cliente.
5. Un producto pertenece a una tienda.
6. Un producto puede existir en el catálogo sin estar disponible todos los días.
7. La disponibilidad para venta se configura por fecha.
8. El inventario del MVP es diario, no un inventario perpetuo empresarial.
9. Cada producto habilitado para una jornada debe tener una cantidad inicial.
10. La cantidad disponible del día no puede ser negativa.
11. Por defecto no se permite vender más cantidad de la disponible.
12. Una venta debe contener al menos un producto.
13. Una venta utiliza el precio vigente/aplicado al momento de confirmarla.
14. El precio histórico de una venta no cambia si posteriormente se modifica el catálogo.
15. El costo utilizado para utilidad bruta también debe conservar el valor aplicado al momento de la venta.
16. Los cálculos monetarios deben utilizar representación decimal exacta y no aritmética binaria de punto flotante.
17. El total de una venta es la suma de los subtotales de sus conceptos.
18. El total recibido es la suma de los pagos válidos asociados a la venta.
19. El saldo pendiente es el total de la venta menos el total recibido.
20. Una venta con saldo pendiente mayor a cero no puede considerarse completamente pagada.
21. Una venta queda pagada cuando su saldo pendiente llega a cero.
22. El sistema registra la fecha/hora en que la venta queda liquidada.
23. Cada pago registra su propia fecha/hora.
24. Un pago puede ser en efectivo o transferencia.
25. Un pago mixto se registra como importes separados por método dentro de la misma operación o como movimientos relacionados.
26. El sistema debe poder reflejar pagos parciales.
27. Una venta pendiente puede recibir pagos posteriores.
28. Las ventas pendientes no desaparecen al terminar el día.
29. Las ventas canceladas no forman parte de las ventas efectivas del periodo.
30. Cancelar una venta debe restaurar el inventario diario cuando corresponda.
31. Una venta confirmada no se elimina físicamente para corregir errores.
32. El sistema debe prevenir duplicados provocados por reintentos de red en operaciones críticas.
33. Los reportes pertenecen exclusivamente al tenant autenticado.
34. El “reporte de ganancias/pérdidas” del MVP representa utilidad o pérdida bruta, no utilidad neta.
35. La utilidad bruta se obtiene de ventas válidas menos costo de los productos vendidos.
36. Los gastos operativos están fuera de alcance del MVP.
37. La moneda inicial será MXN, pero deberá tratarse como configuración y no como texto disperso en el sistema.
38. La zona horaria inicial será `America/Mexico_City`, configurable si el producto evoluciona.
39. Los timestamps deberán almacenarse de forma consistente y convertirse a la zona horaria de la tienda para presentación y cortes de reportes.
40. El backend es la autoridad para totales, saldos, autorización, inventario y estados.
41. El frontend puede anticipar cálculos para mejorar experiencia, pero el backend debe recalcular y validar antes de confirmar.
42. Ningún secreto de infraestructura deberá almacenarse en el repositorio.
43. No se almacenarán datos de tarjetas bancarias.
44. “Transferencia” representa únicamente el método de pago informado por el usuario; el MVP no valida automáticamente la transferencia con un banco.
45. El cambio entregado en efectivo no formará parte de la primera versión salvo que se defina expresamente; se recomienda impedir sobrepagos durante el MVP.

---

## 8. Requerimientos de interfaces externas

### 8.1. Interfaces de usuario

#### Tipos o áreas de interfaz

La aplicación tendrá como mínimo las siguientes áreas:

1. Inicio de sesión.
2. Dashboard.
3. Catálogo de productos.
4. Preparación del día.
5. Inventario/disponibilidad del día.
6. Nueva venta.
7. Detalle de venta.
8. Registro de pago.
9. Ventas pendientes.
10. Historial de ventas.
11. Reportes.
12. Configuración de tienda.
13. Perfil y cierre de sesión.
14. Equipo: lista, alta, baja y reactivación de vendedores (fase 10).
15. Reportes del equipo: por vendedor y su detalle, y el pendiente por cobrar de cada uno (fase 10).

#### Ejemplos de pantallas

**Inicio de sesión**

- Identificador de usuario/correo.
- Contraseña.
- Botón de acceso.
- Estado de carga.
- Mensajes de error.

**Dashboard**

- Ventas del día.
- Dinero cobrado.
- Dinero pendiente.
- Número de ventas.
- Utilidad bruta estimada.
- Acceso rápido a “Nueva venta”.
- Acceso a “Pendientes”.
- Resumen por forma de pago.

**Preparar día**

- Fecha.
- Lista/buscador de productos.
- Control para incluir/excluir producto.
- Cantidad inicial.
- Cantidad ya vendida.
- Cantidad restante.
- Acción de guardar.

**Nueva venta**

- Buscador/listado de productos disponibles.
- Cantidad.
- Resumen de conceptos.
- Total.
- Acción de confirmar.
- Registro de pago.
- Opción de dejar pendiente.

**Pago**

- Total de la venta.
- Total recibido acumulado.
- Saldo.
- Efectivo.
- Transferencia.
- Opción mixta.
- Importes por método.
- Confirmación.

**Pendientes**

- Fecha de venta.
- Identificador.
- Total.
- Recibido.
- Saldo.
- Estado.
- Acción para registrar pago.

**Reportes**

- Selector de periodo.
- Indicadores.
- Tablas/resúmenes.
- Desglose por método de pago.
- Productos destacados.
- Utilidad bruta.

#### Estándares de interfaz gráfica (GUI)

- Diseño mobile-first.
- Interfaz limpia y de alta legibilidad.
- Contraste suficiente.
- Tamaños táctiles adecuados.
- Estados visibles de carga, éxito y error.
- Confirmación para operaciones destructivas o de alto impacto.
- No depender únicamente del color para comunicar estados.
- Formularios con etiquetas visibles.
- Navegación consistente.
- Evitar tablas anchas como interfaz principal en móvil; utilizar tarjetas o vistas adaptativas cuando sea necesario.
- Objetivo de accesibilidad: WCAG 2.2 nivel AA en los componentes principales.

#### Guías de estilo

- Definir tokens de diseño para espaciado, tipografía, bordes y estados.
- Utilizar una escala de tipografía consistente.
- Mantener un conjunto pequeño de colores semánticos.
- Mantener consistencia entre botones, campos, alertas y tarjetas.
- Diseñar primero estados reales: vacío, carga, error, sin conexión y datos completos.

#### Organización de pantalla

**Móvil**

- Navegación principal compacta.
- Acciones frecuentes accesibles con una mano cuando sea razonable.
- “Nueva venta” como acción prominente.
- Información del día priorizada sobre reportes históricos.

**Escritorio**

- Navegación lateral o superior.
- Mayor densidad de información.
- Reportes con tablas y gráficos cuando aporten valor.

#### Estándares para botones

- Una acción primaria clara por contexto.
- Acciones destructivas separadas visualmente.
- Botones deshabilitados cuando la operación no pueda enviarse.
- Indicador de procesamiento para evitar dobles clics.
- Etiquetas de acción concretas: “Guardar producto”, “Confirmar venta”, “Registrar pago”, “Cancelar venta”.

#### Funciones comunes en las pantallas

- Indicador de carga.
- Mensajes de error.
- Confirmación de éxito.
- Manejo de sesión expirada.
- Navegación hacia atrás sin pérdida accidental de datos.
- Prevención de doble envío.
- Formato monetario MXN.
- Formato de fecha/hora consistente.
- Filtros reutilizables.
- Estados vacíos explicativos.

---

### 8.2. Interfaces de hardware

#### Dispositivos soportados

- Pantalla táctil de teléfonos.
- Teclado y mouse.
- Pantallas de laptop/escritorio.
- Tabletas.

No se requiere para el MVP:

- Impresora térmica.
- Cajón de dinero.
- Lector de código de barras.
- Terminal bancaria.
- Básculas.
- Escáneres especializados.

Estos elementos deberán considerarse extensiones futuras y no dependencias del diseño central.

#### Protocolos de comunicación

Los dispositivos cliente se comunicarán con el sistema mediante HTTPS sobre redes IP convencionales.

#### Interacciones de datos y control entre software y hardware

No se requiere control directo de hardware especializado en el MVP.

El navegador será la capa de interacción con el dispositivo.

---

### 8.3. Interfaces de software

#### Otros componentes de software

- Proveedor de autenticación: Amazon Cognito.
- API del sistema: backend propio.
- Servicio PostgreSQL administrado.
- Plataforma de observabilidad de AWS.
- Plataforma de CI/CD.

#### Otros sistemas

No se requerirán integraciones con sistemas externos de negocio durante el MVP.

Quedan fuera:

- Bancos.
- SAT.
- ERPs.
- Servicios de facturación.
- Proveedores de pago.
- Plataformas de delivery.

#### Bases de datos

Se utilizará PostgreSQL administrado.

Proveedor inicial recomendado para el MVP: **Neon**, sujeto a validación de los límites vigentes del plan gratuito en el momento del despliegue.

La elección de PostgreSQL se basa en:

- Integridad transaccional.
- Relaciones claras entre ventas, conceptos y pagos.
- Agregaciones para reportes.
- Soporte sólido de tipos monetarios/decimales mediante una estrategia adecuada.
- Portabilidad entre proveedores PostgreSQL.
- Capacidad de evolucionar a una solución administrada de AWS posteriormente.

No se define en este documento el esquema físico, tablas, SQL, índices ni migraciones concretas.

#### Sistemas operativos

El cliente se ejecutará en navegador.

El backend deberá permanecer abstraído del sistema operativo al ejecutarse en AWS Lambda.

#### Herramientas

**Diseño**

- Figma o herramienta equivalente para wireframes y prototipos.

**Desarrollo**

- Visual Studio Code, JetBrains o IDE equivalente.
- Git.
- GitHub.
- Administrador de paquetes de Node.js.
- Herramientas de inspección de API.

**Calidad**

- ESLint.
- Prettier.
- Pruebas unitarias con Vitest o herramienta equivalente.
- Pruebas end-to-end con Playwright.
- Herramienta de pruebas de API como Bruno, Postman o equivalente.

**Infraestructura**

- AWS Console.
- Infrastructure as Code recomendada para evitar configuración manual irreproducible.
- AWS SAM, AWS CDK o herramienta equivalente como decisión de implementación.

#### Librerías

Las librerías deberán elegirse con los siguientes criterios:

- Mantenimiento activo.
- Licencia compatible.
- Comunidad suficiente.
- Soporte para TypeScript.
- Compatibilidad con ejecución serverless.
- Evitar dependencias innecesariamente pesadas.
- No introducir un framework adicional cuando una función nativa sea suficiente.

#### Componentes de software comercial

No se requerirá software comercial de pago para construir el MVP.

Los servicios cloud deberán seleccionarse inicialmente dentro de planes gratuitos/free tier, entendiendo que los límites pueden cambiar y que la producción futura puede requerir plan pagado.

---

### 8.4. Interfaces de comunicación

#### Email

El MVP no requiere envío de correos de negocio.

El proveedor de identidad puede utilizar correo para recuperación/verificación de cuenta si se habilita esa función.

#### Navegadores web

Compatibilidad objetivo:

- Chrome moderno.
- Safari moderno.
- Edge moderno.
- Firefox moderno.

La prioridad de pruebas será Chrome/Chromium en Android, Safari en iPhone y Chrome/Edge en Windows.

#### Protocolos de comunicación de red

- HTTPS.
- HTTP/2 o superior cuando la infraestructura lo proporcione.
- REST/JSON para la API del MVP.

#### Formularios electrónicos

Los formularios deberán incluir:

- Validación de cliente para experiencia inmediata.
- Validación independiente de servidor.
- Mensajes de error por campo.
- Prevención de doble envío.
- Conservación razonable de datos al ocurrir errores recuperables.

#### Formatos de mensajería

- JSON para intercambio entre frontend y API.
- UTF-8.
- Fechas transmitidas en formato estándar ISO 8601.
- Importes monetarios manejados de forma que no pierdan precisión.

#### Estándares de comunicación

- API versionable.
- Convenciones coherentes de errores.
- Códigos HTTP semánticamente apropiados.
- Correlation/request ID recomendado para diagnóstico.
- Idempotencia o mecanismo equivalente en operaciones críticas susceptibles a reintentos.

#### Encriptación

- TLS/HTTPS obligatorio en producción.
- Cifrado administrado por el proveedor para datos en reposo cuando esté disponible.
- Secretos fuera del código fuente.
- No transmitir contraseñas fuera del flujo del proveedor de identidad.

#### Seguridad de las comunicaciones

- CORS restringido a los orígenes necesarios.
- Cabeceras de seguridad apropiadas.
- Protección contra inyección mediante consultas parametrizadas/capa de persistencia segura.
- Validación de payloads.
- Autorización backend por recurso y tenant.
- Rate limiting en endpoints sensibles cuando sea necesario.
- No almacenar tokens sensibles en logs.
- Evaluar cookies `Secure`, `HttpOnly` y `SameSite` en el diseño final de sesión.
- No depender exclusivamente de validaciones del navegador.

---

## 9. Requerimientos no funcionales

### 9.1. Eficiencia

- RNF-001. Las operaciones comunes deberán sentirse inmediatas bajo la carga del MVP.
- RNF-002. Como objetivo, las operaciones de consulta y registro más frecuentes deberán responder normalmente en menos de 2 segundos, excluyendo latencias extraordinarias de servicios externos o reactivación de recursos serverless.
- RNF-003. Los reportes habituales del periodo reciente deberán responder normalmente en menos de 3 segundos para el volumen esperado del MVP.
- RNF-004. La aplicación deberá minimizar solicitudes innecesarias.
- RNF-005. El frontend deberá cargar únicamente los recursos necesarios para la vista.
- RNF-006. Los listados históricos deberán soportar paginación o carga incremental.
- RNF-007. Los reportes no deberán descargar todo el historial al navegador para calcularse.
- RNF-008. Los cálculos de negocio relevantes deberán ejecutarse de manera confiable en backend.
- RNF-009. La estrategia de consultas deberá revisarse antes de producción con datos representativos.
- RNF-010. El uso de Lambda deberá considerar cold starts y conexiones a PostgreSQL.
- RNF-011. La capa de acceso a datos deberá utilizar una estrategia compatible con conexiones serverless y pooling cuando el proveedor lo recomiende.

### 9.2. Seguridad lógica y de datos

- RNF-012. Toda ruta privada deberá requerir autenticación.
- RNF-013. Toda operación sobre datos de negocio deberá validar tenant.
- RNF-014. Se deberá aplicar el principio de mínimo privilegio en AWS.
- RNF-015. Las credenciales de base de datos no deberán incluirse en frontend.
- RNF-016. Los secretos no deberán versionarse en Git.
- RNF-017. HTTPS será obligatorio en producción.
- RNF-018. Las contraseñas serán gestionadas por Amazon Cognito y no por tablas propias de la aplicación.
- RNF-019. Se deberán validar todas las entradas en backend.
- RNF-020. Se deberán utilizar consultas parametrizadas o mecanismos equivalentes.
- RNF-021. Se deberán controlar errores sin exponer stack traces, secretos o detalles internos al usuario.
- RNF-022. Se deberán registrar logs técnicos suficientes para investigar errores.
- RNF-023. Los logs no deberán incluir contraseñas, tokens completos ni secretos.
- RNF-024. Se deberán probar ataques de acceso horizontal entre tenants.
- RNF-025. Se deberán prevenir modificaciones de totales, precios o saldos únicamente desde el cliente.
- RNF-026. Las operaciones sensibles deberán generar trazabilidad.
- RNF-027. Se deberán aplicar actualizaciones periódicas de dependencias.
- RNF-028. Se deberá ejecutar análisis automatizado de dependencias vulnerables en CI.
- RNF-029. Los entornos de desarrollo y producción deberán utilizar credenciales distintas.
- RNF-030. No se almacenará información completa de tarjetas bancarias.
- RNF-031. La aplicación deberá minimizar la recolección de datos personales innecesarios.
- RNF-059. Cada fase deberá probar la matriz completa de rol por ruta, y toda ruta privada deberá tener su permiso declarado.
- RNF-060. Se deberán probar ataques de acceso horizontal entre vendedores de una misma tienda, además de entre tiendas.
- RNF-061. Los permisos de la función de la API sobre el proveedor de identidad deberán limitarse a las acciones necesarias y al grupo de usuarios del entorno.
- RNF-062. La baja de un usuario deberá surtir efecto a más tardar en su siguiente petición.

#### Estrategia multitenant de seguridad

Para el MVP se propone **base de datos compartida con aislamiento lógico por tenant**.

Principios obligatorios:

- Los recursos de negocio pertenecen a un tenant.
- El contexto de tenant se obtiene del usuario autenticado.
- Cada caso de uso debe operar dentro de ese tenant.
- Las consultas deben aplicar siempre el ámbito del tenant.
- Las pruebas deberán intentar acceder a identificadores de otro tenant.
- Los reportes también deberán respetar el tenant.
- Las tareas administrativas no deberán saltarse este aislamiento de forma accidental.

La decisión sobre controles adicionales a nivel de PostgreSQL, como Row Level Security, se realizará durante diseño técnico. Puede emplearse como defensa adicional, pero no sustituirá la autorización de la aplicación.

### 9.3. Usabilidad

- RNF-032. La aplicación deberá diseñarse mobile-first.
- RNF-033. Las acciones comunes deberán requerir pocos pasos.
- RNF-034. Los importes deberán mostrarse con formato monetario.
- RNF-035. Los estados pagada/pendiente/cancelada deberán distinguirse claramente.
- RNF-036. El saldo pendiente deberá ser visible sin cálculos manuales.
- RNF-037. Los errores deberán explicar qué debe corregir el usuario.
- RNF-038. Los formularios deberán preservar información cuando ocurra un error recuperable.
- RNF-039. La aplicación deberá mostrar confirmación después de guardar operaciones críticas.
- RNF-040. Las acciones destructivas deberán requerir confirmación.
- RNF-041. El diseño deberá contemplar navegación táctil.
- RNF-042. Se buscará conformidad WCAG 2.2 AA para los flujos principales.
- RNF-043. La aplicación no deberá depender solo de colores para comunicar información.
- RNF-044. El dashboard deberá priorizar información del día.
- RNF-045. Las métricas deberán acompañarse de etiquetas claras y no depender de gráficos para ser entendidas.

### 9.4. Dependibilidad

- RNF-046. Una venta y su descuento de inventario deberán conservar consistencia transaccional.
- RNF-047. Un pago deberá registrarse una sola vez aun ante reintentos razonables.
- RNF-048. Las operaciones deberán ser recuperables ante errores de red sin crear duplicados.
- RNF-049. Se deberá contar con estrategia de respaldo antes de considerar el MVP como producción real.
- RNF-050. Se deberán documentar pasos de restauración.
- RNF-051. Se deberán conservar logs de errores.
- RNF-052. Se deberá configurar monitoreo básico de fallas.
- RNF-053. Se deberán configurar alertas de presupuesto/consumo en AWS.
- RNF-054. El frontend deberá manejar temporalmente la indisponibilidad del backend sin perder silenciosamente operaciones.
- RNF-055. El usuario deberá recibir confirmación explícita antes de asumir que una venta o pago quedó registrado.
- RNF-056. Los planes gratuitos no se considerarán una garantía contractual de disponibilidad.
- RNF-057. La arquitectura deberá permitir migrar de tier gratuito a infraestructura pagada sin rehacer la lógica de negocio.
- RNF-058. Se deberán ejecutar pruebas de humo después de cada despliegue a producción.

#### Objetivo inicial de disponibilidad

El sistema se diseñará para ser accesible las 24 horas, pero el MVP operará sobre servicios gratuitos/free tier sin SLA garantizado. Por ello se distingue entre:

- **Disponibilidad objetivo de la aplicación:** acceso bajo demanda durante todo el día.
- **Disponibilidad garantizada:** no aplica mientras se utilicen exclusivamente planes gratuitos sin SLA.

---

## 10. Otros requerimientos

### 10.1. Requerimientos de bases de datos

Este documento no define tablas ni SQL. Únicamente establece requerimientos conceptuales de persistencia.

#### Tecnología

- PostgreSQL.
- Servicio administrado.
- Proveedor inicial propuesto: Neon.
- Posibilidad futura de migrar a Amazon RDS PostgreSQL.

#### Información conceptual que deberá persistirse

Sin definir todavía el modelo físico, el sistema requerirá almacenar conceptos equivalentes a:

- Tienda/tenant.
- Usuario y asociación con tienda.
- Configuración de tienda.
- Producto.
- Configuración de producto para una jornada.
- Existencia diaria.
- Venta.
- Conceptos de venta.
- Pagos.
- Estado de cobro.
- Cancelaciones.
- Datos de auditoría y fechas relevantes.

#### Integridad requerida

La futura base de datos deberá garantizar:

- Relación válida entre una venta y su tenant.
- Relación válida entre una venta y sus conceptos.
- Relación válida entre un pago y su venta.
- No mezclar recursos de tenants.
- Precisión decimal en importes.
- Fechas/hora consistentes.
- Integridad transaccional en venta e inventario.
- Integridad transaccional en pagos y saldo.
- Conservación de valores históricos de precio y costo.
- Restricciones que impidan valores imposibles cuando corresponda.

#### Estrategia de crecimiento

Para el MVP se prioriza simplicidad:

- Una única base PostgreSQL.
- Datos multitenant compartidos con aislamiento lógico.
- Sin particionamiento prematuro.
- Sin réplicas dedicadas.
- Sin múltiples regiones.
- Sin almacén analítico separado.

El diseño deberá permitir agregar índices, archivado, réplicas o una plataforma de reporting cuando el volumen real lo justifique.

#### Respaldo

Antes de uso productivo se deberá definir al menos:

- Qué mecanismo de recuperación ofrece el proveedor.
- Con qué frecuencia se realizará una exportación adicional.
- Dónde se almacenará.
- Cómo se probará una restauración.
- Cuánto historial se necesita conservar.

No deberá asumirse que un plan gratuito ofrece las mismas capacidades de respaldo que un plan productivo.

---

### 10.2. Internacionalización

Configuración inicial:

- Idioma: español.
- País de operación inicial: México.
- Moneda: MXN.
- Zona horaria: `America/Mexico_City`.
- Formato visual de fechas adaptado a español de México.
- Formato de moneda local.

Criterios de diseño:

- No insertar símbolos de moneda de forma rígida en la lógica de negocio.
- Mantener la zona horaria como configuración.
- Almacenar timestamps de forma consistente y convertirlos para presentación.
- No concatenar textos de interfaz de forma que impida traducciones futuras.
- Centralizar textos de interfaz cuando el esfuerzo sea razonable.
- Preparar el modelo para otras monedas únicamente como capacidad futura; el MVP no realizará conversión de divisas.

---

### 10.3. Requerimientos legales

El MVP deberá minimizar los datos personales recopilados.

Consideraciones iniciales para México:

- Revisar aplicabilidad de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares cuando el sistema almacene información personal.
- Contar con aviso de privacidad cuando corresponda.
- No recopilar datos de clientes si no son necesarios para el objetivo del sistema.
- Proteger credenciales y datos de cuenta.
- Definir política de conservación y eliminación de datos si el sistema se abre a terceros.
- Mantener un mecanismo para atender eliminación de una cuenta/tenant en una etapa comercial.
- Revisar licencias de dependencias utilizadas.
- Evitar utilizar el reporte de utilidad bruta como sustituto de contabilidad fiscal.
- Aclarar que el MVP no genera CFDI ni sustituye obligaciones fiscales.
- No almacenar información sensible de tarjetas.
- Si en una etapa futura se integran pagos reales, facturación o datos financieros adicionales, deberá realizarse una revisión legal y de seguridad específica.

---

### 10.4. Objetivos de reúso de componentes de software

El sistema deberá construirse de forma modular para reutilizar:

- Componentes de formulario.
- Selector de productos.
- Controles de cantidad.
- Componentes monetarios.
- Selector de fechas y periodos.
- Tarjetas de métricas.
- Estados visuales.
- Tablas/listas adaptativas.
- Diálogos de confirmación.
- Manejo de errores.
- Capa de autenticación.
- Contexto de tenant.
- Validadores.
- Casos de uso de ventas y pagos.
- Capa de acceso a datos.
- Componentes de reportes.

El objetivo no será crear un framework interno, sino reducir duplicación sin introducir abstracciones prematuras.

#### Principios de arquitectura

- Separar interfaz, lógica de negocio e infraestructura.
- Mantener reglas de negocio fuera de componentes visuales.
- Mantener autorización en backend.
- No acoplar la lógica central directamente a Neon o a una interfaz específica de AWS.
- Utilizar PostgreSQL estándar siempre que sea posible.
- Diseñar adaptadores para servicios externos.
- Favorecer módulos cohesivos y pequeños.

#### Estructura funcional sugerida del backend

Sin definir código, los módulos conceptuales serán:

- Identidad/autenticación.
- Tenant/tienda.
- Productos.
- Jornadas e inventario diario.
- Ventas.
- Pagos.
- Pendientes.
- Reportes.
- Auditoría.
- Configuración.

#### Estrategia de pruebas

**Pruebas unitarias**

Cubrirán principalmente:

- Cálculo de total.
- Cálculo de saldo.
- Estado pagada/pendiente.
- Pago parcial.
- Pago mixto.
- Utilidad bruta.
- Validación de inventario.
- Cancelación y restitución de inventario.
- Reglas monetarias.

**Pruebas de integración**

Cubrirán:

- API + persistencia.
- Autenticación + autorización.
- Venta + inventario.
- Pago + saldo.
- Cancelación + inventario.
- Reportes.
- Tenant + recursos asociados.

**Pruebas de seguridad**

Casos obligatorios:

- Usuario A intenta leer venta de usuario B.
- Usuario A intenta modificar producto de usuario B.
- Usuario A intenta registrar pago a venta de usuario B.
- Usuario A intenta obtener reportes de otro tenant.
- Modificación manual de tenant en petición.
- Modificación manual de totales.
- Token ausente.
- Token expirado.
- Payload inválido.
- Doble envío de una venta.
- Doble envío de un pago.

**Pruebas end-to-end**

Flujos mínimos:

1. Inicio de sesión correcto.
2. Registro de producto.
3. Preparación del día.
4. Venta completamente pagada en efectivo.
5. Venta completamente pagada por transferencia.
6. Venta con pago mixto.
7. Venta parcialmente pagada.
8. Consulta de pendiente.
9. Pago posterior que liquida la venta.
10. Reporte del día.
11. Reporte semanal/mensual.
12. Cancelación de venta.
13. Validación de inventario después de cancelar.
14. Sesión expirada.
15. Intento de acceso entre tenants.

**Pruebas responsive**

Como mínimo:

- Teléfono Android pequeño/mediano.
- iPhone de tamaño representativo.
- Tableta.
- Escritorio.

Se deberán probar específicamente:

- Nueva venta.
- Registro de pago mixto.
- Pendientes.
- Reportes.
- Formularios.
- Modales.
- Navegación.

**Pruebas de aceptación del MVP**

El MVP se considerará funcionalmente aceptable cuando sea posible completar sin intervención técnica:

- Crear un producto.
- Prepararlo para venta en el día.
- Registrar inventario inicial.
- Venderlo.
- Registrar distintos métodos de pago.
- Dejar una venta pendiente.
- Completar posteriormente el pago.
- Consultar pendientes.
- Consultar reportes.
- Consultar utilidad bruta.
- Cancelar una venta y observar la corrección del inventario.
- Verificar que otro tenant no puede acceder a dichos datos.

#### Estrategia de despliegue propuesta

**Frontend**

Opción preferida:

- AWS Amplify Hosting para publicar la SPA y automatizar despliegues desde Git.

Alternativa:

- Amazon S3 para archivos estáticos.
- Amazon CloudFront como CDN y terminación HTTPS.

La selección final deberá basarse en costos vigentes y facilidad operativa en la cuenta AWS utilizada.

**Backend**

- AWS Lambda.
- Amazon API Gateway.
- Runtime Node.js LTS compatible.
- Logs en Amazon CloudWatch.

Ventajas para este MVP:

- No requiere mantener una instancia EC2 encendida.
- Escala bajo demanda.
- El costo se relaciona con uso.
- Adecuado para tráfico bajo/intermitente.
- Reduce mantenimiento de sistema operativo.

**Autenticación**

- Amazon Cognito User Pools.
- Configuración mínima necesaria para login y recuperación de cuenta.
- Evitar características pagadas no requeridas para el MVP.

**Base de datos**

- Neon PostgreSQL Free como punto de inicio.
- Usar conexión compatible con serverless.
- Mantener portabilidad hacia Amazon RDS PostgreSQL.

**Ambientes**

Mínimo:

- Local/desarrollo.
- Producción.

Recomendado cuando las cuotas lo permitan:

- Desarrollo.
- Staging.
- Producción.

El ambiente de staging deberá usar datos de prueba y no credenciales reales de producción.

**CI/CD**

Cada cambio destinado a producción deberá pasar por:

1. Instalación reproducible de dependencias.
2. Lint.
3. Validación de tipos.
4. Pruebas unitarias.
5. Pruebas de integración disponibles.
6. Construcción del frontend/backend.
7. Despliegue.
8. Pruebas de humo.

**Configuración y secretos**

- Variables de entorno por ambiente.
- Secretos nunca incluidos en Git.
- Credenciales de base de datos únicamente disponibles al backend.
- Configuración de CORS por ambiente.
- Identificadores de Cognito por ambiente.
- URL de API configurable.

**Monitoreo**

Configurar desde el MVP:

- Logs de errores del backend.
- Métricas de errores 4xx/5xx.
- Alarmas básicas ante fallos repetidos.
- Alertas de presupuesto en AWS.
- Revisión periódica de consumo de base de datos.
- Identificadores de solicitud para rastrear operaciones problemáticas.

**Plan de reversión**

Antes de publicar una versión:

- Conservar la versión anterior desplegable.
- No realizar cambios incompatibles de datos sin estrategia de migración.
- Poder revertir frontend y backend.
- Tener respaldo cuando una migración de datos sea destructiva.
- Ejecutar prueba de humo después del cambio.

#### Criterios para pasar del MVP gratuito a infraestructura pagada

Se deberá evaluar migración cuando ocurra cualquiera de las siguientes condiciones:

- Las cuotas gratuitas comiencen a limitar la operación.
- Se requiera SLA formal.
- Se incremente el número de tiendas.
- La latencia de reactivación afecte ventas.
- El volumen de datos supere el almacenamiento incluido.
- Los reportes comiencen a degradar el rendimiento.
- Se necesiten respaldos de mayor retención.
- Se requieran entornos permanentes adicionales.
- Se necesite soporte comercial.
- El sistema se convierta en una herramienta crítica para terceros.

La ruta preferida de evolución será conservar PostgreSQL y migrar la infraestructura de manera incremental, evitando una reescritura completa del producto.

#### Riesgos principales del proyecto

| Riesgo | Impacto | Mitigación planificada |
|---|---|---|
| Mezcla de datos entre tenants | Crítico | Autorización backend, aislamiento por tenant y pruebas específicas |
| Duplicación de ventas por red | Alto | Prevención de doble envío e idempotencia |
| Duplicación de pagos | Crítico | Identificación única de operación e idempotencia |
| Inventario negativo | Alto | Validación transaccional de disponibilidad |
| Reportes incorrectos por cambio de precios | Alto | Conservar precio y costo históricos |
| Estado “pagada” inconsistente | Alto | Derivar/validar estado a partir de pagos y saldo |
| Pérdida de información | Alto | Respaldo, restauración documentada y trazabilidad |
| Exceso de costos cloud | Medio | Budgets, alertas y revisión de cuotas |
| Dependencia de un plan gratuito | Medio | Arquitectura portable y plan de migración |
| Mala experiencia móvil | Alto | Diseño mobile-first y pruebas en dispositivos |
| Sobrecrecimiento del alcance | Alto | Mantener fuera del MVP inventario/contabilidad avanzados |
| Interpretar utilidad bruta como utilidad neta | Medio | Etiquetas correctas y exclusión explícita de gastos |

#### Criterios de finalización del MVP

El MVP se considerará listo para uso personal cuando:

- La autenticación funcione de manera estable.
- El aislamiento multitenant esté probado.
- Se puedan administrar productos.
- Se pueda preparar inventario diario.
- Las ventas descuenten existencias correctamente.
- Efectivo, transferencia y pago mixto funcionen.
- Los pagos parciales funcionen.
- Las ventas pendientes puedan liquidarse posteriormente.
- El reporte de pendientes sea correcto.
- Los reportes de ventas sean coherentes.
- La utilidad bruta corresponda con los datos registrados.
- Las cancelaciones preserven trazabilidad.
- Los flujos principales funcionen correctamente en móvil.
- Existan pruebas automatizadas para reglas críticas.
- Se haya probado restauración o recuperación de datos según el mecanismo elegido.
- Existan logs y monitoreo básico.
- AWS tenga alertas de consumo/costo configuradas.
- El despliegue pueda repetirse sin depender de pasos manuales no documentados.

---

### Decisiones de alcance consolidadas

Para evitar que el proyecto se convierta prematuramente en un POS o sistema de inventario empresarial, las siguientes decisiones quedan fijadas para el MVP:

- El inventario se administra **por jornada/día**.
- No existe un módulo complejo de compras.
- No existe kardex empresarial.
- No existe administración de múltiples almacenes.
- No existe contabilidad completa.
- No existe facturación electrónica.
- No existe integración bancaria.
- Los pagos se registran como información operativa.
- Las ganancias reportadas son **utilidad bruta**.
- La prioridad es registrar rápido y consultar información clara.
- La primera interfaz se diseña para móvil.
- La arquitectura sí es multitenant desde el inicio.
- El propietario es el único rol obligatorio del MVP. El vendedor es una extensión posterior propuesta (fase 10, sección 6.13; T101 a T115 de [decisiones.md](decisiones.md), pendientes de aprobación), sin rol de administrador aparte.
- La infraestructura inicial se optimiza para bajo costo y uso reducido.
- La evolución hacia funciones más avanzadas dependerá de necesidades comprobadas y no de anticipar un POS empresarial completo.

---

### Stack tecnológico consolidado

| Capa | Tecnología propuesta | Motivo |
|---|---|---|
| Frontend | React + TypeScript + Vite | SPA simple, rápida y adecuada para una app privada |
| Estilos/UI | Tailwind CSS + componentes accesibles | Responsive y consistencia visual |
| Backend | Node.js LTS + TypeScript + Fastify | API ligera y modular |
| API | REST/JSON | Suficiente para el MVP y simple de mantener |
| Autenticación | Amazon Cognito | Evita implementar almacenamiento propio de contraseñas |
| Compute backend | AWS Lambda | Serverless, bajo mantenimiento, adecuado para poco tráfico |
| Exposición API | Amazon API Gateway | Integración estándar con Lambda y controles HTTP |
| Frontend cloud | AWS Amplify Hosting | Despliegue web administrado y CI/CD sencillo |
| Alternativa frontend | S3 + CloudFront | Hosting estático desacoplado |
| Base de datos | PostgreSQL en Neon Free | PostgreSQL administrado, adecuado para MVP |
| Futuro de base de datos | Amazon RDS PostgreSQL | Ruta de crecimiento sin cambiar de motor |
| Logs | Amazon CloudWatch | Observabilidad integrada con AWS |
| Repositorio | GitHub | Control de versiones y automatización |
| CI/CD | GitHub Actions / AWS | Pruebas y despliegue reproducible |
| Pruebas unitarias | Vitest o equivalente | Validación rápida de reglas |
| Pruebas E2E | Playwright | Validación de flujos reales en navegador |
| Diseño | Figma o equivalente | Wireframes y prototipado responsive |

---

### Nota sobre planes gratuitos

Los límites exactos de AWS, Neon y cualquier otro proveedor deberán verificarse nuevamente inmediatamente antes del despliegue, ya que sus planes y condiciones pueden cambiar.

La arquitectura propuesta busca aprovechar servicios gratuitos o free tier para el uso personal inicial, pero **el requerimiento correcto no debe ser “costo garantizado de $0”**, sino:

> Mantener el costo del MVP en cero o lo más cercano posible mientras el uso permanezca dentro de las cuotas gratuitas disponibles, con alertas de consumo y una ruta clara de migración cuando el producto crezca.

Esto evita diseñar el sistema alrededor de una promoción temporal y permite conservar la arquitectura cuando deje de ser razonable depender exclusivamente de planes gratuitos.
