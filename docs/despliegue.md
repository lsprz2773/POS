# Despliegue (fase 9)

Paso a paso para ti, con pantallas y comandos: [manual-despliegue.md](manual-despliegue.md).

Propuesta para aprobar antes de crear cualquier recurso. Todo cabe en capa gratuita; el límite de gasto y las decisiones abiertas están al final. Las decisiones numeradas (T86 a T95) están en [decisiones.md](decisiones.md); el origen de la elección de servicios está en [requerimientos.md](requerimientos.md), secciones 5.3, 9 y 10.

## Arquitectura

```
Navegador ──HTTPS──▶ CloudFront (dirección *.cloudfront.net, sin dominio propio)
                       ├─ /*      ▶ S3 privado (la web compilada)
                       └─ /api/*  ▶ API Gateway (HTTP API) ▶ Lambda (Fastify) ▶ Neon (PostgreSQL)
Cognito (grupo de usuarios) ◀── la Lambda valida y renueva la sesión
```

- **Un solo origen.** La web y `/api` salen de la misma dirección de CloudFront, igual que en local (T11): las cookies `HttpOnly` funcionan sin comprar dominio. El dominio propio se queda para después (D2).
- **Región.** `us-east-1` para AWS y Neon (misma región, menor latencia entre Lambda y la base). Se revisa si Cognito y las demás piezas existen y son gratuitas en `mx-central-1` (Querétaro); si sí, se prefiere por la cercanía a Chiapas.
- **API.** Lambda con Node 22 en arm64, 512 MB, detrás de un adaptador delgado sobre el mismo Fastify de local (T5). API Gateway tipo HTTP API (más barato que REST).
- **Identidad.** Cognito en nivel Lite o Essentials (10 000 usuarios activos al mes sin costo), sin registro público: el propietario crea las cuentas con el script `provision` y no se activan funciones de pago como la seguridad avanzada.
- **Base de datos.** Neon plan gratuito con el endpoint de pooler (D1). Una rama de Neon por entorno.
- **Secretos.** Parameter Store (nivel estándar, gratuito) con `SecureString`; nada en Git ni en variables de la plantilla.
- **Infraestructura como código.** AWS SAM (D5), una plantilla y un stack por entorno.

## Entornos

| Entorno | Se despliega desde | Datos | Para qué |
|---|---|---|---|
| Local | cualquier rama | pruebas locales | desarrollo |
| `staging` | `dev`, a mano (`workflow_dispatch`) | solo de prueba, rama propia de Neon | ensayar migraciones, pruebas de humo y E2E contra la nube |
| `prod` | etiqueta `vX.Y.Z` sobre `main`, con aprobación del propietario en GitHub | reales | uso diario |

Staging es gratis (Lambda, CloudFront y Cognito no cobran en reposo; Neon permite 10 ramas). Se despliega siempre primero a staging y se promueve el mismo código a producción.

## CI/CD

- GitHub Actions con **OIDC**: la acción asume un rol de AWS de mínimo privilegio y no existen llaves de acceso guardadas (RNF-014). El rol lo crea el propietario una sola vez con una plantilla de arranque que yo escribo y él revisa.
- Orden de cada despliegue: dependencias reproducibles, lint, tipos, pruebas, construcción, **migraciones como paso explícito** (nunca al arrancar la Lambda), `sam deploy`, subida de la web a S3 e invalidación de CloudFront, **pruebas de humo**.
- Pruebas de humo (RNF-058): `/api/health`, inicio de sesión del usuario de prueba, `GET /api/workdays/today`, y el subconjunto de los 15 flujos E2E que no modifica datos de producción. Los 15 flujos completos con Playwright contra la dirección de staging se agregan en 9b (hoy el E2E levanta sus propios servidores locales).
- Reversión: la web y la Lambda se despliegan por etiqueta; volver atrás es volver a desplegar la etiqueta anterior. Las migraciones solo avanzan (CLAUDE.md), así que se hacen compatibles hacia atrás y se prueban primero en staging.

## Monitoreo y alertas

- CloudWatch Logs con retención de 14 días; solicitudes con `x-request-id`.
- Alarmas: errores 5xx repetidos y errores de la Lambda (las primeras 10 alarmas son gratuitas), con aviso al correo del propietario.
- AWS Budgets y Neon: ver topes.
- Revisión mensual de consumo (checklist en este documento cuando exista).

## Topes de costo

| Concepto | Tope propuesto |
|---|---|
| Gasto mensual aceptado | **US$ 1.00** |
| Presupuesto de AWS Budgets | US$ 1.00 al mes, con avisos al 50 %, 80 % y 100 % del gasto real y al 100 % del pronosticado |
| Acción automática al 100 % | política que niega crear recursos nuevos (Budgets Actions) |
| Neon | plan gratuito sin tarjeta; si se agota algún límite la base se pausa, no se cobra |
| Recursos que no se crean | RDS, EC2, NAT Gateway, WAF, Route 53, Secrets Manager, Cognito Plus, Lambda con memoria fija aprovisionada, dominio |

Con un solo usuario y volumen bajo, el consumo estimado queda muy por debajo de las cuotas permanentes de Lambda (1 millón de solicitudes y 400 000 GB-segundo al mes) y de Cognito (10 000 usuarios activos al mes), y CloudFront (1 TB y 10 millones de solicitudes al mes). Es una estimación; los límites vigentes se vuelven a revisar el día del despliegue, como pide el documento de requerimientos.

Dos riesgos reales que sí hay que vigilar:

1. **Cuenta de AWS nueva.** Desde julio de 2025 las cuentas nuevas reciben US$ 100 a 200 en créditos y el plan gratuito termina a los 6 meses o al agotarse los créditos, lo que ocurra primero; después hay que pasar al plan de pago. Lambda, CloudFront y Cognito conservan su cuota permanente, pero API Gateway cuesta (centavos de dólar por millón de solicitudes). Con este uso serían centavos al mes, dentro del tope de US$ 1. En una cuenta antigua rige el esquema de 12 meses.
2. **Neon gratuito: 0.5 GB de almacenamiento y pausa tras 5 minutos sin uso.** La primera solicitud tras una pausa tarda un poco más (la web ya muestra estado de carga). El almacenamiento alcanza para muchos meses de ventas de una tienda, pero se vigila.

## Respaldo y restauración (RNF)

- Neon gratuito conserva solo un historial corto para restaurar.
- Propuesta: un `pg_dump` semanal programado en GitHub Actions, cifrado y guardado en un bucket privado de S3 con borrado a los 30 días (unos pocos MB), y una prueba de restauración en una rama de Neon antes de usar producción.

## Fases de ejecución

Cada una con su rama y su PR, como hasta ahora.

| Parte | Qué incluye | ¿Crea recursos en la nube? |
|---|---|---|
| 9a | Adaptador de Lambda, plantilla SAM, scripts de humo, flujos de GitHub Actions, plantilla de arranque del rol OIDC, validación local de la plantilla | No |
| 9b | Cuenta, presupuesto y alertas; rol OIDC; Neon; staging; pruebas de humo y E2E contra staging | Sí, con el tope aprobado |
| 9c | Producción desde `main` con etiqueta; respaldo y restauración probados; checklist de consumo | Sí, con el tope aprobado |

## Lo que necesito de ti para empezar 9b

1. **La cuenta de AWS.** ¿Ya existe? ¿Es nueva (2025 en adelante, con créditos y 6 meses) o antigua? Activa la verificación en dos pasos del usuario raíz y no uses el usuario raíz para nada más.
2. **Aprobar el tope** de US$ 1 al mes, el correo para las alertas y la acción automática al 100 %.
3. **La forma de dar acceso.** Recomendada: tú ejecutas una sola vez la plantilla de arranque que te preparo (crea el proveedor OIDC de GitHub y un rol limitado) y yo nunca manejo llaves. Alternativa: llaves temporales que tú generes para este fin.
4. **Región** (`us-east-1` o `mx-central-1` si todo es gratuito ahí).
5. **Entornos:** staging y producción (recomendado) o solo producción.
6. **Respaldo semanal a S3** (recomendado) o alternativa.

Nota de seguridad: el entorno donde trabajo ya tiene variables `AWS_*` definidas. No las he usado ni las usaré hasta que apruebes el tope y la forma de acceso; si no son tuyas o no debían estar ahí, conviene revocarlas.
