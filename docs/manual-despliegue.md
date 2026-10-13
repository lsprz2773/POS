# Manual de despliegue

Guía paso a paso para poner el POS en internet con servicios gratuitos. Está escrita para hacerla tú, en orden. Las decisiones y el porqué están en [despliegue.md](despliegue.md).

> **Antes de empezar**
>
> - Los nombres de los botones y menús de AWS, Neon y GitHub cambian de vez en cuando. Si algo no se ve exactamente igual, busca el nombre parecido; la idea del paso es la misma.
> - Hazlo desde una **computadora** si puedes. Todo se puede en el teléfono, pero las consolas de AWS son incómodas en pantalla chica.
> - **Nunca pegues en el chat, en GitHub ni en el código** contraseñas, llaves de AWS ni la cadena de conexión de la base. Solo van en los lugares que este manual indica.
> - Cada parte termina con una lista de **comprobación**. No sigas a la siguiente si no se cumple.

## Mapa

| Parte | Qué haces | Dónde | Cuánto tarda |
|---|---|---|---|
| 0 | Preparar lo necesario | — | 10 min |
| 1 | Crear y asegurar la cuenta de AWS | aws.amazon.com | 30 min |
| 2 | Crear la base de datos | neon.com | 15 min |
| 3 | Guardar la cadena de conexión | AWS, Parameter Store | 10 min |
| 4 | Ejecutar el arranque (permisos y presupuesto) | AWS, CloudFormation | 20 min |
| 5 | Configurar GitHub | github.com | 20 min |
| 6 | Primer despliegue de **staging** | GitHub, Actions | 15 min |
| 7 | Crear tu tienda y tu usuario | GitHub y AWS CloudShell | 15 min |
| 8 | Probar staging | tu navegador | 30 min |
| 9 | Desplegar **producción** | GitHub | 20 min |
| 10 | Uso diario y mantenimiento | — | cada mes |
| 11 | Si algo sale mal | — | — |
| 12 | Apagar todo | AWS | 15 min |

Las partes 1 a 7 las hace la primera vez que despliegas; las partes 6, 8 y 9 se repiten en cada versión nueva.

---

## Parte 0. Lo que necesitas

- [ ] Un **correo** que revises seguido (recibirá alertas de costo y de fallas).
- [ ] La cuenta con la que entras a AWS (**Google, GitHub, Apple o Amazon**): la nueva experiencia de AWS no usa usuario raíz, entras con ese inicio de sesión.
- [ ] Tu **teléfono** con una app de autenticación (Google Authenticator, Microsoft Authenticator o Authy) para la verificación en dos pasos.
- [ ] Tu cuenta de **GitHub** y acceso de administrador al repositorio `lsprz2773/POS`.
- [ ] Que las fases 8a a 8f y 9a ya estén fusionadas en `main` (revisa en GitHub que la carpeta `.github/workflows` de `main` tenga `deploy.yml` y `provision.yml`). Los botones de GitHub Actions ("Run workflow") solo aparecen si el flujo está en la **rama predeterminada** del repositorio (revísala en GitHub → Settings → General → Default branch).
- [ ] Un lugar seguro (gestor de contraseñas) para guardar lo que vayas generando.

**Anota aquí mientras avanzas** (en tu gestor de contraseñas, no en el repositorio):

| Dato | Dónde se obtiene | Valor |
|---|---|---|
| Correo de alertas | tú | |
| ID de cuenta de AWS (12 dígitos) y fecha en que vencen los créditos | parte 1 | |
| Región | parte 1 | `us-east-2` |
| Cadena de conexión de Neon (staging) | parte 2 | |
| Cadena de conexión de Neon (producción) | parte 2 | |
| ARN del rol de despliegue | parte 4 | |
| Nombre del bucket de artefactos | parte 4 | |
| Dirección de staging | parte 6 | |
| Dirección de producción | parte 9 | |

---

## Parte 1. Cuenta de AWS (nueva experiencia)

Tu cuenta es de la **nueva experiencia de AWS** (*Sign up for AWS (new)*). Funciona distinto a una cuenta clásica:

- Entras con tu **AWS Builder ID**, que se crea con el inicio de sesión que usaste (Google, GitHub, Apple o Amazon). **No hay usuario raíz ni hace falta crear un usuario administrador de IAM.**
- Tu trabajo vive en un **proyecto** (el tuyo se llama "Blank slate"). Un proyecto es una sola cuenta de AWS con su propia facturación, fijada a una región.
- Empiezas en el **Free plan**: US$ 100 de créditos, por 6 meses o hasta gastarlos. En ese plan AWS dice que no hay cargos mientras no actualices.
- Los servicios que usamos (Lambda, API Gateway, CloudFront, Cognito, S3, CloudFormation, IAM, Systems Manager, SNS, CloudWatch, Budgets, CloudShell) están incluidos en el Free plan.
- **No actualices al Paid plan ni actives las "características avanzadas".** Si la consola te dice "actualice la cuenta para activar las características avanzadas", ignóralo: son funciones de empresa que no necesitamos.

**Dónde:** entra a <https://console.aws.amazon.com> con tu inicio de sesión de siempre, o a <https://settings.aws.com> para la cuenta y la facturación.

### 1.1 Proteger tu inicio de sesión

Como no hay usuario raíz, la seguridad de tu cuenta de AWS es la de **la cuenta con la que entras**:

1. Activa la **verificación en dos pasos** en esa cuenta (Google, GitHub, etc.) desde su configuración de seguridad.
2. En tu perfil de AWS Builder ID (<https://profile.aws.amazon.com> → Security) revisa que tenga un dispositivo de verificación (MFA) y agrega uno si no.
3. Guarda en tu gestor de contraseñas el correo y el método con que entras.

### 1.2 Revisar tu plan y tus créditos

1. Abre <https://settings.aws.com> → **Billing**.
2. Anota: el nombre del plan (**Free plan**), el saldo de créditos y la **fecha en que vencen**. Tu cuenta tiene US$ 100 que vencen a los 183 días; agenda un recordatorio un mes antes (ver la parte 10, "Cuando termine el plan gratuito").
3. No pulses **Upgrade**.

### 1.3 Confirmar el proyecto y la región

1. En <https://settings.aws.com> → **Projects**, abre tu proyecto.
2. Confirma que su región es **US East (Ohio) us-east-2**. En la nueva experiencia la región queda fija por proyecto y no se puede cambiar; es la que usaremos para todo.
3. Si más adelante algo "no aparece", revisa que arriba a la derecha de la consola siga diciendo **us-east-2**.

### 1.4 Anotar el ID de cuenta

En la consola, clic en el nombre del proyecto o de tu cuenta, arriba a la derecha: busca **Account ID** (12 dígitos) y cópialo a tu lista.

### 1.5 Comprobar que CloudShell abre

CloudShell es la terminal del navegador que usaremos en la parte 7. En la consola, clic en el ícono `>_` de arriba y espera a que abra una línea de comandos. Ciérrala.

### 1.6 Las alertas de costo

**No crees presupuestos a mano**: la parte 4 crea los dos (`pos-mensual` y `pos-primer-centavo`) y tener más puede generar un cargo por presupuesto adicional. Mientras tanto no hay riesgo de cobro en el Free plan.

### ✅ Comprobación de la parte 1

- [ ] Tu inicio de sesión (Google, GitHub, etc.) tiene verificación en dos pasos.
- [ ] El plan dice **Free plan** y anotaste los créditos y su fecha de vencimiento.
- [ ] El proyecto está en **us-east-2** y anotaste el ID de cuenta.
- [ ] CloudShell abre.

---

## Parte 2. Base de datos en Neon

**Dónde:** <https://neon.com> → **Sign up**. Entra con GitHub o con tu correo. **No pide tarjeta** en el plan gratuito.

1. **Crear proyecto** (Create project):
   - Nombre: `pos`.
   - Versión de Postgres: la que ofrezca por omisión (16 o más nueva).
   - Región: **AWS US East 2 (Ohio)** (`aws-us-east-2`), igual que la de AWS, para que respondan rápido.
2. Neon crea una rama llamada `main` (o `production`). Esa es la base de **producción**.
3. Crea la rama de staging: menú **Branches** → **Create branch** → nombre `staging`, **parent** = la rama principal, y elige **"Current data"** o equivalente. (Tu base aún está vacía; da igual.)
4. Obtén las cadenas de conexión. Para **cada** rama:
   - Selecciona la rama → botón **Connect**.
   - Elige la base `neondb` y el rol que trae.
   - **Activa "Connection pooling"** (conexión con pooler). La dirección debe contener `-pooler` en el nombre del servidor.
   - Copia la cadena completa: empieza con `postgresql://` y termina con `?sslmode=require`.
5. Guarda las dos cadenas en tu gestor de contraseñas, etiquetadas `staging` y `produccion`. **Contienen la contraseña de la base.**

> Neon gratuito pausa la base tras 5 minutos sin uso; la primera petición después de una pausa tarda un par de segundos más. Es normal. Límite: 0.5 GB de almacenamiento.

### ✅ Comprobación de la parte 2

- [ ] Tienes dos ramas: la principal y `staging`.
- [ ] Las dos cadenas contienen `-pooler` y `sslmode=require`.

---

## Parte 3. Guardar las cadenas en AWS (Parameter Store)

La aplicación lee la cadena de la base desde aquí; nunca está en el código ni en GitHub.

**Dónde:** consola de AWS (región `us-east-2`) → busca **Systems Manager** → menú izquierdo **Parameter Store** → **Create parameter**.

Crea **dos** parámetros:

| Campo | Staging | Producción |
|---|---|---|
| Name | `/pos/staging/database-url` | `/pos/prod/database-url` |
| Tier | Standard | Standard |
| Type | **SecureString** | **SecureString** |
| KMS key source | My current account → `alias/aws/ssm` (la de por omisión) | igual |
| Value | la cadena de la rama `staging` | la cadena de la rama principal |

Los nombres deben quedar **exactamente** así (con mayúsculas y minúsculas, y las barras): el despliegue los busca por nombre.

### ✅ Comprobación de la parte 3

- [ ] En Parameter Store ves `/pos/staging/database-url` y `/pos/prod/database-url`, tipo SecureString.

---

## Parte 4. Arranque: permisos de GitHub y presupuesto

Este paso se ejecuta **una sola vez** y crea: el permiso para que GitHub despliegue sin llaves, un bucket de archivos de despliegue y tu **presupuesto con alertas y bloqueo**.

**Dónde:** consola de AWS (`us-east-2`) → **CloudFormation** → **Create stack** → **With new resources (standard)**.

> **Aviso para la nueva experiencia.** IAM y CloudFormation están incluidos en tu plan, pero no pude comprobar si tu proyecto te deja crear el proveedor de identidad de GitHub y el rol. Es posible que este paso falle. Si ocurre, **no insistas**: abre en CloudFormation la pestaña **Events** del stack, copia el primer mensaje en rojo y pégamelo. Hay alternativas (quitar el bloqueo automático del presupuesto o desplegar desde CloudShell en lugar de GitHub Actions) y la elegimos con el mensaje a la vista.

1. **Prerequisite**: *Choose an existing template*. **Specify template**: *Upload a template file* → sube `infra/bootstrap.yaml` (descárgalo del repositorio: GitHub → carpeta `infra` → archivo → botón de descarga "Download raw file").
2. **Siguiente**. Nombre del stack: `pos-bootstrap`.
3. Parámetros:

   | Parámetro | Qué poner |
   |---|---|
   | GitHubOwner | `lsprz2773` |
   | GitHubRepo | `POS` |
   | AlertEmail | tu correo de alertas |
   | MonthlyLimitUsd | `1` |
   | CreateOidcProvider | `true` (si el paso falla diciendo que ya existe, repite con `false`) |

4. **Siguiente** dos veces. En la última pantalla marca **"I acknowledge that AWS CloudFormation might create IAM resources with custom names"** → **Submit**.
5. Espera a que el estado sea **CREATE_COMPLETE** (1 a 3 minutos; actualiza con el botón de refrescar).
6. Pestaña **Outputs** (Salidas): copia **`DeployRoleArn`** y **`ArtifactBucketName`** a tu lista.
7. **Confirma las suscripciones por correo:** AWS Budgets te manda mensajes de confirmación. Ábrelos y confirma. (Las alarmas de la parte 6 también mandarán uno; confírmalo cuando llegue.)

### Qué hace cada recurso

| Recurso | Para qué sirve |
|---|---|
| Rol `pos-github-deploy` | Lo asume GitHub Actions mientras corre el despliegue, solo desde tu repositorio y solo desde los entornos `staging` y `prod`. Dura una hora y no hay llaves. |
| Bucket `pos-deploy-artifacts-…` | Guarda los paquetes que se suben al desplegar (se borran a los 30 días). |
| Presupuesto `pos-mensual` | Tope de US$ 1. Avisa al 50 %, 80 % y 100 % del gasto real y al 100 % del pronosticado. |
| Presupuesto `pos-primer-centavo` | Te avisa en cuanto aparezca **cualquier cobro**, aunque sea de un centavo. |
| Acción automática | Al llegar al 100 % del presupuesto, el rol de despliegue **pierde permiso de desplegar** hasta que tú lo restableces (parte 10). |

### ✅ Comprobación de la parte 4

- [ ] El stack `pos-bootstrap` está en `CREATE_COMPLETE`.
- [ ] Copiaste `DeployRoleArn` y `ArtifactBucketName`.
- [ ] En **Billing → Budgets** ves `pos-mensual` y `pos-primer-centavo`.
- [ ] Confirmaste los correos de suscripción.

---

## Parte 5. Configurar GitHub

**Dónde:** <https://github.com/lsprz2773/POS> → **Settings**.

### 5.1 Crear los dos entornos

1. **Settings → Environments → New environment**. Nombre: `staging`. Crear.
2. Repite con `prod` (nombre exactamente así).
3. En `prod`:
   - Marca **Required reviewers** y agrégate a ti. Así, un despliegue a producción siempre espera tu aprobación.
   - En **Deployment branches and tags** elige **Selected branches and tags** → agrega la regla de etiqueta `v*`. Producción solo se despliega desde etiquetas de versión.

### 5.2 Variables de cada entorno

En **cada** entorno (`staging` y `prod`), sección **Environment variables → Add variable**:

| Nombre | Valor |
|---|---|
| `AWS_ROLE_ARN` | el `DeployRoleArn` de la parte 4 |
| `AWS_REGION` | `us-east-2` |
| `ARTIFACT_BUCKET` | el `ArtifactBucketName` de la parte 4 |
| `ALERT_EMAIL` | tu correo de alertas |

Son datos de configuración, no secretos. Las **llaves** de AWS no existen.

### 5.3 Secretos para las pruebas de humo (más adelante)

En la parte 7 creas el usuario de pruebas. Después, en cada entorno → **Environment secrets**, agrega `SMOKE_EMAIL` y `SMOKE_PASSWORD`. Hasta entonces, las pruebas de humo omiten las que requieren sesión.

### ✅ Comprobación de la parte 5

- [ ] Existen los entornos `staging` y `prod`.
- [ ] `prod` exige tu aprobación y solo acepta etiquetas `v*`.
- [ ] Las cuatro variables están en los dos entornos.

---

## Parte 6. Primer despliegue de staging

**Dónde:** GitHub → pestaña **Actions** → en la lista de la izquierda, **Deploy** → botón **Run workflow**.

1. **Use workflow from:** rama `dev`.
2. **Entorno:** `staging`.
3. **Run workflow**. Se abre una ejecución nueva; haz clic en ella para ver el avance.

**Qué hace, en orden:**

| Paso | Qué significa |
|---|---|
| Comprobaciones | Revisa el código (estilo, tipos y pruebas) antes de tocar la nube. |
| Construir API y web | Empaqueta la API para Lambda y compila la web. |
| Migraciones | Prepara las tablas de la base de datos (Neon). |
| Desplegar | Crea el stack `pos-staging`: Cognito, Lambda, API Gateway, S3 y CloudFront. |
| Dirección pública | Como la API necesita conocer la dirección de CloudFront, que no existe hasta crearse, se despliega **dos veces** la primera vez. |
| Publicar la web | Sube los archivos a S3 y limpia la caché. |
| Pruebas de humo | Comprueba que todo responde. |

**La primera vez tarda entre 10 y 20 minutos** (CloudFront es lo más lento). Es normal que se vea "en curso" un buen rato.

Al final, en el resumen del paso **Desplegar**, verás `Aplicación: https://xxxxxxxx.cloudfront.net`. Esa es la **dirección de staging**: anótala.

**Correo de SNS:** llega un mensaje "AWS Notification - Subscription Confirmation" de las alarmas. **Confírmalo**.

### Si falla

| Dónde se detiene | Causa probable | Qué hacer |
|---|---|---|
| "Configure AWS credentials" dice *Not authorized to perform sts:AssumeRoleWithWebIdentity* | El entorno de GitHub no se llama exactamente `staging`, o GitHubOwner/GitHubRepo del arranque están mal | Corrige el nombre del entorno o repite el arranque con los valores correctos (CloudFormation → `pos-bootstrap` → Update) |
| Migraciones: *ParameterNotFound* | El parámetro no se llama `/pos/staging/database-url` | Corrige el nombre en Parameter Store (parte 3) |
| Migraciones: no conecta o *password authentication failed* | Cadena mal copiada | Vuelve a copiarla de Neon y actualiza el parámetro |
| Desplegar: *AccessDenied* con una acción de IAM, Lambda, CloudFront… | A la política del rol le falta un permiso | Copia el mensaje completo en el chat; se ajusta `infra/bootstrap.yaml` y se actualiza el stack `pos-bootstrap` |
| Desplegar: *ROLLBACK_COMPLETE* | El stack falló al crearse y se deshizo | En CloudFormation → `pos-staging` → pestaña **Events**, busca la primera línea en rojo; envíala. Borra el stack fallido antes de reintentar |
| Pruebas de humo: *llegan las cabeceras de seguridad* falla | CloudFront aún propaga la configuración | Reintenta en 5 minutos |

> Un stack en `ROLLBACK_COMPLETE` no se puede actualizar: hay que **borrarlo** (CloudFormation → seleccionar → Delete) y volver a ejecutar el despliegue.

### ✅ Comprobación de la parte 6

- [ ] El flujo terminó en verde.
- [ ] Anotaste la dirección de staging.
- [ ] Si abres `https://…cloudfront.net/api/health` ves `{"status":"ok"}`.
- [ ] Confirmaste el correo de SNS.

---

## Parte 7. Crear tu tienda y tu usuario

El inicio de sesión necesita dos cosas: una **cuenta en Cognito** (quién eres) y una **tienda en la base** (a qué datos accedes). Un flujo de GitHub hace ambas; **tú solo fijas la contraseña**, para que nunca pase por GitHub.

### 7.1 Crear la cuenta y la tienda

1. GitHub → **Actions** → **Provision** → **Run workflow**.
2. Rama `dev`, entorno `staging`.
3. **Nombre de la tienda:** el de tu negocio. **Correo:** el correo con el que vas a entrar.
4. **Run workflow**. Debe terminar en verde en un par de minutos.

### 7.2 Fijar tu contraseña (AWS CloudShell)

CloudShell es una terminal que AWS te presta dentro del navegador, sin instalar nada.

1. En la consola de AWS (`us-east-2`), arriba a la derecha, clic en el ícono `>_` (**CloudShell**). Espera a que abra.
2. Obtén el identificador del grupo de usuarios:

   ```
   aws cloudformation describe-stacks --stack-name pos-staging \
     --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text
   ```

   Copia el resultado (se ve como `us-east-2_AbC123dEf`).
3. Fija la contraseña (**de al menos 12 caracteres, con mayúscula, minúscula y número**). Reemplaza los dos valores en mayúsculas:

   ```
   aws cognito-idp admin-set-user-password \
     --user-pool-id IDENTIFICADOR_DEL_GRUPO \
     --username TU_CORREO \
     --password 'TU_CONTRASEÑA' --permanent
   ```

   Si no devuelve nada, funcionó. Las comillas simples evitan que la terminal interprete símbolos de tu contraseña.
4. Cierra CloudShell. La contraseña **no** queda en GitHub; guárdala en tu gestor.

### 7.3 Usuario para las pruebas de humo (recomendado)

Para que las pruebas automáticas no usen tus datos reales de producción, crea en **cada** entorno otra cuenta de prueba. Repite 7.1 y 7.2 con:

- Nombre de tienda: `Pruebas de humo`.
- Correo: una variante tuya, por ejemplo `tucorreo+humo@gmail.com` (Gmail entrega a tu bandeja los correos con `+algo`).

Luego, en GitHub → Settings → Environments → (staging o prod) → **Environment secrets**: `SMOKE_EMAIL` y `SMOKE_PASSWORD` con esa cuenta.

### ✅ Comprobación de la parte 7

- [ ] El flujo **Provision** terminó en verde.
- [ ] Fijaste la contraseña sin errores.
- [ ] Guardaste el correo y la contraseña en tu gestor.

---

## Parte 8. Probar staging

1. Abre la dirección de staging en el navegador **del teléfono** y también en la computadora.
2. Inicia sesión con tu correo y tu contraseña. La primera vez puede tardar unos segundos (la base despierta).
3. Recorre esta lista (es la versión corta de los 15 flujos del documento de requerimientos):

   - [ ] Iniciar sesión y ver **Hoy**.
   - [ ] Crear un producto en el catálogo.
   - [ ] Preparar el día con cantidades.
   - [ ] Venta pagada en efectivo.
   - [ ] Venta pagada por transferencia.
   - [ ] Pago mixto.
   - [ ] Venta parcialmente pagada.
   - [ ] Verla en **Pendientes** y liquidarla con un pago posterior.
   - [ ] Reporte del día y de la semana.
   - [ ] Cancelar una venta y ver que el inventario regresa.
   - [ ] Cerrar sesión; volver a entrar.
   - [ ] Abrir `/vender` en una pestaña privada: debe llevarte a iniciar sesión.
4. Instala la aplicación en tu teléfono: menú del navegador → **Agregar a pantalla de inicio**.
5. Revisa que recibes el correo de alarma de prueba si quieres: CloudWatch → Alarms → `pos-staging-errores-lambda` → Actions → **Test**… (opcional).

**Qué mirar si algo se ve raro:** AWS → CloudWatch → **Logs → Log groups** → `/aws/lambda/pos-staging-api`. Cada error muestra el código de referencia (`x-request-id`) que también ve la pantalla en la tarjeta de error.

### ✅ Comprobación de la parte 8

- [ ] Todo lo de la lista funciona en teléfono y computadora.
- [ ] Las pruebas de humo del último despliegue estaban en verde con sesión (si ya cargaste `SMOKE_*`, vuelve a ejecutar **Deploy**).

---

## Parte 9. Producción

Producción repite todo, pero con la base y el usuario reales, y solo desde una versión etiquetada.

### 9.1 Publicar el código en `main` y crear la versión

1. Abre el PR de `dev` a `main` y apruébalo cuando la CI esté en verde (como hiciste con el #17).
2. GitHub → **Releases** → **Draft a new release**.
3. **Choose a tag**: escribe `v0.1.0` y elige "Create new tag on publish". **Target:** `main`.
4. Título `v0.1.0`; en la descripción, un resumen breve. **Publish release**.

### 9.2 Desplegar

1. Actions → **Deploy** → **Run workflow**.
2. **Use workflow from:** elige la **etiqueta** `v0.1.0` (no una rama). Entorno `prod`.
3. GitHub te pedirá **aprobar** el despliegue (por el revisor obligatorio): abre la ejecución → **Review deployments** → marca `prod` → **Approve and deploy**.
4. Espera. Anota la dirección de producción.

### 9.3 Tienda, contraseña y humo

Repite la **parte 7** con el entorno `prod`:

- [ ] Flujo **Provision** con entorno `prod`, **ejecutado desde la etiqueta `v0.1.0`** (el entorno `prod` solo acepta etiquetas), con el nombre real de tu tienda y tu correo.
- [ ] Contraseña en CloudShell (usa el stack `pos-prod`).
- [ ] Usuario de pruebas de humo y sus secretos en el entorno `prod`.

### 9.4 Prueba de humo y uso

- [ ] Abre la dirección de producción, inicia sesión y haz **una** venta pequeña de verdad (o de prueba y cancélala).
- [ ] Revisa en CloudWatch que no hay errores.
- [ ] Guarda la dirección como acceso directo en tu teléfono.

### ✅ Comprobación de la parte 9

- [ ] Flujo **Deploy** de `prod` en verde, con humo.
- [ ] Puedes vender en producción.
- [ ] Recibes alertas en tu correo (prueba una alarma si quieres).

---

## Parte 10. Uso diario y mantenimiento

### Cada mes (10 minutos)

| Revisa | Dónde | Qué esperar |
|---|---|---|
| Costo | AWS → **Billing and Cost Management** → Bills | $0.00 (o centavos) |
| Presupuestos | **Budgets** | Sin alertas disparadas |
| Capa gratuita | **Billing → Free Tier** | Todo por debajo del límite |
| Base de datos | Neon → **Dashboard** | Almacenamiento bajo 0.5 GB; horas de cómputo bajo el límite |
| Alarmas | CloudWatch → **Alarms** | Ninguna en rojo |
| Plan de AWS | settings.aws.com → Billing | Cuántos días y cuántos créditos quedan en el Free plan |

### Publicar una versión nueva

1. Cambios en una rama → PR a `dev` → CI en verde → fusionar.
2. Actions → **Deploy** → rama `dev` → `staging`. Probar.
3. PR de `dev` a `main` → crear etiqueta nueva (`v0.1.1`…) → **Deploy** con esa etiqueta y entorno `prod` → aprobar.

### Volver atrás (reversión)

Ejecuta **Deploy** con la etiqueta de la versión anterior y entorno `prod`. Las migraciones **no** se revierten: por eso se escriben compatibles hacia atrás y se prueban primero en staging.

### Agregar a otra persona o tienda

Flujo **Provision** con el nombre de su tienda y su correo; luego fija su contraseña en CloudShell (parte 7.2).

### Cambiar una contraseña olvidada

CloudShell: el mismo comando `admin-set-user-password` de la parte 7.2 con la contraseña nueva.

### Si llegó la alerta de presupuesto al 100 %

1. Revisa **Billing → Cost Explorer** para ver qué servicio cobró.
2. El despliegue quedó bloqueado por seguridad. La aplicación **sigue funcionando**; solo no se puede desplegar.
3. Cuando entiendas el cobro y quieras seguir: IAM → **Roles** → `pos-github-deploy` → pestaña **Permissions** → quita (**Detach**) la política `pos-deploy-bloqueado`.

### Respaldo y restauración (parte 9c)

Se agrega en la siguiente entrega: copia semanal cifrada a S3 y prueba de restauración en una rama de Neon. Mientras tanto, Neon conserva un historial corto desde su panel (Branches → Restore).

### Cuando termine el plan gratuito de AWS

Tu Free plan termina a los **6 meses o cuando se acaben los US$ 100 de créditos (lo que ocurra primero)**; en tu cuenta, a los 183 días contados desde su apertura. **Si no haces nada, la cuenta se cierra automáticamente y se pierden los recursos.** AWS conserva tus datos 90 días más, y en ese plazo puedes actualizar al Paid plan para recuperarlos.

Lo recomendable es decidir **un mes antes**:

1. Entra a <https://settings.aws.com> → **Billing** → **Upgrade** y agrega un método de pago.
2. En el mismo asistente, o después, elige **Set spend limits** y pon un tope mensual para el proyecto (por ejemplo, US$ 2). Al alcanzarlo, AWS **pausa** los recursos hasta el mes siguiente: es un tope real, no solo una alerta.
3. La actualización **no se puede revertir**. Los créditos que queden se aplican a tus facturas futuras. Con tu volumen el gasto esperado son centavos al mes (sobre todo API Gateway).

Agenda el recordatorio en tu calendario ahora (fecha de vencimiento menos 30 días).

---

## Parte 11. Si algo sale mal

| Síntoma | Qué revisar |
|---|---|
| La página carga pero "no se pudo conectar" | Abre `/api/health`. Si no responde: CloudWatch → log group `/aws/lambda/pos-<entorno>-api`. |
| `/api/health` responde pero `/api/health/ready` da 503 | La base no responde: Neon puede estar pausada (reintenta) o la cadena del parámetro es incorrecta. |
| Iniciar sesión dice "Correo o contraseña incorrectos" | Contraseña no fijada (parte 7.2), correo distinto al del alta, o contraseña de menos de 12 caracteres. |
| Inicia sesión y pide algo de "tienda" o aparece "tu cuenta aún no tiene una tienda" | Falta ejecutar **Provision** para ese correo en ese entorno. |
| Cualquier guardado falla con 403 "origen no permitido" | La API no conoce su dirección: vuelve a ejecutar **Deploy** (el segundo paso la corrige). |
| La primera carga del día es lenta | Normal: base pausada y Lambda en frío. |
| Un despliegue se quedó en `UPDATE_ROLLBACK_FAILED` | No borres nada a ciegas; envía los *Events* del stack. |
| Ves un cargo inesperado | **Billing → Bills** por servicio; dime cuál y revisamos. No sigas desplegando hasta entender. |

---

## Parte 12. Apagar todo

Si quieres borrar un entorno completo (no toca Neon):

1. Vacía el bucket web: S3 → bucket que empieza con `pos-<entorno>-webbucket…` → **Empty**.
2. CloudFormation → stack `pos-<entorno>` → **Delete**. (En producción primero quita la protección de eliminación del grupo de usuarios: Cognito → el grupo → **Settings → Deletion protection → Inactive**.)
3. Para quitar también permisos y presupuesto: vacía el bucket `pos-deploy-artifacts-…` y borra el stack `pos-bootstrap`.
4. En Neon: Project → **Settings → Delete project**.

---

## Apéndice A. Qué se crea en AWS y su costo esperado

| Servicio | Recurso | Costo esperado con 1 usuario |
|---|---|---|
| Lambda | `pos-<entorno>-api` (arm64, 512 MB) | $0: cuota permanente de 1 millón de solicitudes al mes |
| API Gateway | HTTP API | centavos al mes como máximo (con el Free plan, cubierto por créditos) |
| CloudFront | 1 distribución por entorno | $0: cuota permanente de 1 TB y 10 millones de solicitudes |
| S3 | bucket de la web y bucket de artefactos | $0 con los archivos de la web (unos MB) |
| Cognito | 1 grupo de usuarios por entorno | $0 hasta 10 000 usuarios activos al mes |
| CloudWatch | registros a 14 días y 2 alarmas por entorno | $0 dentro de la cuota (5 GB de registros y 10 alarmas) |
| SNS | correos de alarma | $0 |
| Systems Manager | 2 parámetros estándar | $0 |
| Budgets | 2 presupuestos con 1 acción | $0 |
| Neon | proyecto gratuito | $0 |

Los números vienen de las páginas de precios al momento de escribir esto y pueden cambiar; por eso existen las alertas de la parte 4.

## Apéndice B. Qué tocó cada parte del repositorio

| Archivo | Para qué |
|---|---|
| `infra/bootstrap.yaml` | Parte 4 (permisos de GitHub, bucket, presupuesto) |
| `infra/template.yaml` | Partes 6 y 9 (todo el entorno) |
| `infra/deploy.sh` | Parte 6 y 9 (migraciones, despliegue, publicar web) |
| `infra/smoke.mjs` | Pruebas de humo |
| `.github/workflows/deploy.yml` | Botón **Deploy** |
| `.github/workflows/provision.yml` | Botón **Provision** |
| `apps/api/src/lambda.ts` | La API dentro de Lambda |
| `apps/api/src/modules/auth/cognito-identity-provider.ts` | Inicio de sesión con Cognito |

## Apéndice C. Glosario

| Palabra | Significa |
|---|---|
| **Región** | Ciudad (centro de datos) de AWS donde viven tus recursos. |
| **IAM / rol** | Permisos de AWS. Un rol es un conjunto de permisos que alguien (aquí GitHub) puede "ponerse" por un rato. |
| **OIDC** | Forma de que GitHub demuestre quién es ante AWS sin contraseñas ni llaves guardadas. |
| **CloudFormation / SAM** | Texto que describe qué crear en AWS; AWS lo crea y lo puede borrar entero. |
| **Stack** | Un conjunto de recursos creados juntos por una plantilla (`pos-staging`, `pos-prod`). |
| **Lambda** | Código que AWS ejecuta solo cuando alguien lo usa; no hay servidor encendido. |
| **API Gateway** | La puerta de entrada que recibe las peticiones y se las pasa a Lambda. |
| **CloudFront** | La red que entrega tu web y reenvía `/api` a la API, con HTTPS. |
| **S3** | Almacén de archivos (aquí guarda la web compilada). |
| **Cognito** | El servicio que guarda usuarios y contraseñas. |
| **Parameter Store** | Caja fuerte de AWS para datos secretos como la cadena de la base. |
| **Neon** | PostgreSQL administrado donde viven las ventas. |
| **Staging** | Copia de ensayo; produce lo mismo que producción, con datos de prueba. |
| **Etiqueta (tag)** | Nombre fijo (`v0.1.0`) que marca una versión exacta del código. |
| **Pruebas de humo** | Revisión rápida, automática, de que lo principal responde tras desplegar. |
