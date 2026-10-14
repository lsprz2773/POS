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
- **Región.** `us-east-2` (Ohio), la que muestra la consola de AWS del propietario, para AWS y Neon (`aws-us-east-2`): misma región, menor latencia entre Lambda y la base. Los servicios de la plantilla existen ahí (validado con `cfn-lint --regions us-east-2`).
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

- **Despliegue desde AWS CloudShell** (T98). La cuenta del propietario es de la nueva experiencia de AWS y su política de servicio **prohíbe crear un proveedor OIDC** (`iam:CreateOpenIDConnectProvider`), así que GitHub Actions no puede asumir un rol sin llaves. Se despliega desde CloudShell, que ya trae la sesión del propietario: `infra/cloudshell-prepare.sh` (Node 22 y dependencias), `infra/deploy.sh` y `infra/provision.sh`. Los flujos `deploy.yml` y `provision.yml` siguen en el repositorio para una cuenta que sí permita OIDC.
- Orden de cada despliegue: construir (API y web), **migraciones como paso explícito** (nunca al arrancar la Lambda), `aws cloudformation package` y `deploy`, subida de la web a S3 e invalidación de CloudFront, **pruebas de humo**.
- La CI de GitHub sigue haciendo lint, tipos, pruebas, construcción, empaquetado de la Lambda y validación de las plantillas en cada PR.
- Pruebas de humo (RNF-058): `/api/health`, `/api/health/ready`, rutas de la SPA, 404 de la API en JSON, cabeceras de seguridad y, con una cuenta de pruebas, inicio de sesión y lectura autenticada. Los 15 flujos completos con Playwright contra staging se agregan en 9b.
- Reversión: la web y la Lambda se despliegan por etiqueta; volver atrás es volver a desplegar la etiqueta anterior. Las migraciones solo avanzan (CLAUDE.md), así que se hacen compatibles hacia atrás y se prueban primero en staging.

## Monitoreo y alertas

- CloudWatch Logs con retención de 14 días; solicitudes con `x-request-id`.
- Alarmas: errores 5xx repetidos y errores de la Lambda (las primeras 10 alarmas son gratuitas), con aviso al correo del propietario.
- AWS Budgets y Neon: ver topes.
- Revisión mensual de consumo (checklist en este documento cuando exista).

## Topes de costo

| Concepto | Tope propuesto |
|---|---|
| Gasto mensual aceptado | **US$ 1.00** (aprobado por el propietario; en el peor caso se acepta hasta US$ 2.00, porque AWS informa los cargos con hasta un día de retraso y el bloqueo automático actúa al verlos) |
| Presupuesto de AWS Budgets | US$ 1.00 al mes, con avisos al 50 %, 80 % y 100 % del gasto real y al 100 % del pronosticado |
| Acción automática al 100 % | política que niega crear recursos nuevos (Budgets Actions) |
| Neon | plan gratuito sin tarjeta; si se agota algún límite la base se pausa, no se cobra |
| Recursos que no se crean | RDS, EC2, NAT Gateway, WAF, Route 53, Secrets Manager, Cognito Plus, Lambda con memoria fija aprovisionada, dominio |

Con un solo usuario y volumen bajo, el consumo estimado queda muy por debajo de las cuotas permanentes de Lambda (1 millón de solicitudes y 400 000 GB-segundo al mes) y de Cognito (10 000 usuarios activos al mes), y CloudFront (1 TB y 10 millones de solicitudes al mes). Es una estimación; los límites vigentes se vuelven a revisar el día del despliegue, como pide el documento de requerimientos.

Dos riesgos reales que sí hay que vigilar:

1. **Cuenta de la nueva experiencia de AWS (la del propietario).** Free plan: US$ 100 de créditos por 6 meses o hasta gastarlos (183 días en este caso). Al terminar, la cuenta se **cierra** y los datos se conservan 90 días; para seguir hay que actualizar al Paid plan, donde sí se puede fijar un tope de gasto por proyecto que pausa los recursos. Lambda, CloudFront y Cognito conservan su cuota permanente y API Gateway cuesta centavos al mes con este uso.
2. **Neon gratuito: 0.5 GB de almacenamiento y pausa tras 5 minutos sin uso.** La primera solicitud tras una pausa tarda un poco más (la web ya muestra estado de carga). El almacenamiento alcanza para muchos meses de ventas de una tienda, pero se vigila.

## Respaldo y restauración (RNF)

- Neon gratuito conserva solo un historial corto para restaurar.
- Respaldo propio (T99): una función programada (`pos-<entorno>-backup`) exporta cada domingo toda la base a un archivo comprimido y cifrado en un bucket privado de S3 con borrado a los 30 días. Es una exportación lógica (cada fila como JSON, ordenada por llaves foráneas, en una sola transacción de lectura), no un `pg_dump`: así no hace falta un programa externo en Lambda ni credenciales fuera de AWS.
- Restauración: `npm run restore` carga el archivo en una base ya migrada y vacía, dentro de una transacción; se niega si la base no está vacía o el esquema es distinto. La prueba de restauración en una rama de Neon está en el manual (parte 10) y se hace antes de producción.

## Fase 10: cambios en la nube (equipo y vendedores, T110)

La fase 10 ([plan.md](plan.md)) solo toca la nube en dos puntos, ninguno con costo:

- **Permisos de la Lambda sobre Cognito.** La función de la API gana `cognito-idp:AdminCreateUser`, `AdminSetUserPassword`, `AdminDisableUser`, `AdminEnableUser`, `AdminUserGlobalSignOut` y `AdminDeleteUser`, acotados al ARN del grupo de usuarios del entorno (mínimo privilegio, RNF-061). Es un cambio de la plantilla que `deploy.sh` aplica como cualquier otro.
- **Migraciones.** Amplían roles y estado de las membresías, agregan el nombre del usuario y asignan la disponibilidad del día a su dueño. `deploy.sh` las corre antes de publicar el código; son compatibles hacia atrás mientras la tienda solo tenga al propietario.

No se crean recursos nuevos, no cambia el tope de costo y la cuenta del propietario no necesita ningún paso de configuración previo: ya es propietaria y verá Equipo al desplegar. Los pasos para el propietario están en [manual-despliegue.md](manual-despliegue.md), sección "Equipo: vendedores".

## Fases de ejecución

Cada una con su rama y su PR, como hasta ahora.

| Parte | Qué incluye | ¿Crea recursos en la nube? |
|---|---|---|
| 9a | Adaptador de Lambda, plantilla SAM, scripts de humo, flujos de GitHub Actions, plantilla de arranque del rol OIDC, validación local de la plantilla | No |
| 9b | Cuenta, presupuesto y alertas; rol OIDC; Neon; staging; pruebas de humo y E2E contra staging | Sí, con el tope aprobado |
| 9c | Producción desde `main` con etiqueta; respaldo y restauración probados; checklist de consumo | Sí, con el tope aprobado |

## Lo que necesito de ti para empezar 9b

1. **La cuenta de AWS:** resuelto. Es de la nueva experiencia (proyecto "Blank slate" en `us-east-2`, Free plan con US$ 100 que vencen a los 183 días); no hay usuario raíz ni usuarios de IAM que crear.
2. **Aprobar el tope** de US$ 1 al mes, el correo para las alertas y la acción automática al 100 %.
3. **La forma de dar acceso.** Recomendada: tú ejecutas una sola vez la plantilla de arranque que te preparo (crea el proveedor OIDC de GitHub y un rol limitado) y yo nunca manejo llaves. Alternativa: llaves temporales que tú generes para este fin.
4. **Región:** `us-east-2` (Ohio), aprobada.
5. **Entornos:** staging y producción (recomendado) o solo producción.
6. **Respaldo semanal a S3** (recomendado) o alternativa.

Nota de seguridad: el entorno donde trabajo ya tiene variables `AWS_*` definidas. No las he usado ni las usaré hasta que apruebes el tope y la forma de acceso; si no son tuyas o no debían estar ahí, conviene revocarlas.
