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
| 4 | Ejecutar el arranque (bucket y presupuesto) | AWS, CloudFormation | 20 min |
| 5 | Preparar CloudShell | AWS CloudShell | 20 min |
| 6 | Primer despliegue de **staging** | AWS CloudShell | 20 min |
| 7 | Crear tu tienda y tu usuario | AWS CloudShell | 15 min |
| 8 | Probar staging | tu navegador | 30 min |
| 9 | Desplegar **producción** | GitHub y AWS CloudShell | 20 min |
| 10 | Uso diario y mantenimiento | — | cada mes |
| 11 | Si algo sale mal | — | — |
| 12 | Apagar todo | AWS | 15 min |

Las partes 1 a 7 las hace la primera vez que despliegas; las partes 6, 8 y 9 se repiten en cada versión nueva.

---

## Parte 0. Lo que necesitas

- [ ] Un **correo** que revises seguido (recibirá alertas de costo y de fallas).
- [ ] La cuenta con la que entras a AWS (**Google, GitHub, Apple o Amazon**): la nueva experiencia de AWS no usa usuario raíz, entras con ese inicio de sesión.
- [ ] Tu **teléfono** con una app de autenticación (Google Authenticator, Microsoft Authenticator o Authy) para la verificación en dos pasos.
- [ ] Tu cuenta de **GitHub** (para ver el repositorio `lsprz2773/POS` y crear la versión de producción).
- [ ] Que las fases 8a a 8f y 9a ya estén fusionadas en `main` (revisa en GitHub que `main` tenga la carpeta `infra` con `deploy.sh` y `provision.sh`).
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

## Parte 4. Arranque: bucket de despliegue y presupuesto

> **Qué pasó con la versión anterior.** El primer intento de esta parte pedía además un permiso para que GitHub desplegara por ti. Falló porque la política de tu cuenta (*service control policy*) **prohíbe crear un proveedor de identidad OIDC** (`iam:CreateOpenIDConnectProvider`). Es una restricción de la nueva experiencia de AWS, no un error tuyo. Por eso el despliegue se hace desde **CloudShell**, que ya tiene tu sesión: no necesita llaves ni permisos extra, y es igual de seguro. Los flujos de GitHub **Deploy** y **Provision** no se usan en esta cuenta.

Este paso se ejecuta **una sola vez** y crea el **bucket** donde se suben los paquetes al desplegar y tus **dos presupuestos con alertas**.

**Dónde:** consola de AWS → **CloudFormation** → **Create stack** → **With new resources (standard)**. Esa consola abre en Ohio (`us-east-2`) aunque la dirección diga otra cosa.

1. **Prerequisite**: *Choose an existing template*. **Specify template**: *Upload a template file* → sube `infra/bootstrap.yaml` (GitHub → carpeta `infra` → archivo → botón de descarga "Download raw file").
2. **Siguiente**. Nombre del stack: `pos-bootstrap`.
3. Parámetros:

   | Parámetro | Qué poner |
   |---|---|
   | AlertEmail | tu correo de alertas |
   | MonthlyLimitUsd | `1` |

4. **Siguiente** dos veces y **Submit**. No pide reconocer permisos de IAM porque ya no crea ninguno.
5. Espera a **CREATE_COMPLETE** (1 a 2 minutos).
6. Pestaña **Outputs**: copia **`ArtifactBucketName`** a tu lista.
7. **Confirma las suscripciones por correo** que AWS Budgets te manda.

| Recurso | Para qué sirve |
|---|---|
| Bucket `pos-deploy-artifacts-…` | Guarda los paquetes de la API al desplegar (se borran a los 30 días). |
| Presupuesto `pos-mensual` | Tope de US$ 1. Avisa al 50 %, 80 % y 100 % del gasto real y al 100 % del pronosticado. |
| Presupuesto `pos-primer-centavo` | Te avisa en cuanto aparezca **cualquier cobro**, aunque sea de un centavo. |

Mientras estés en el **Free plan** AWS no cobra, así que los presupuestos son una segunda alarma. El tope real, que pausa los recursos, llega al pasar al Paid plan (ver "Cuando termine el plan gratuito").

### Si falla

Abre la pestaña **Events**, copia el **Logical ID** y el **Status reason** de la primera fila roja y pásamelos. Si el problema son los presupuestos, se pueden quitar de la plantilla: no son necesarios para desplegar.

### ✅ Comprobación de la parte 4

- [ ] El stack `pos-bootstrap` está en `CREATE_COMPLETE`.
- [ ] Copiaste `ArtifactBucketName`.
- [ ] Confirmaste los correos de suscripción.

---

## Parte 5. Preparar CloudShell

Desde aquí todo se hace en **AWS CloudShell** (el ícono `>_` de la consola). Es una terminal en el navegador, ya con tu sesión iniciada.

> **Desde el teléfono** es incómodo teclear comandos largos. Copia y pega cada bloque tal cual. Si puedes, usa una computadora.

1. Abre CloudShell y espera el cursor. Comprueba la región: `echo $AWS_REGION` debe decir `us-east-2`.
2. Descarga el código (el repositorio es público):

   ```
   git clone https://github.com/lsprz2773/POS.git
   cd POS
   ```

3. Prepara las herramientas (instala Node 22 en tu carpeta y las dependencias; tarda unos 5 minutos):

   ```
   ./infra/cloudshell-prepare.sh
   source ~/.bashrc
   node -v
   ```

   `node -v` debe decir `v22` o más.
4. Define los datos del despliegue (cambia el correo y el bucket por los tuyos):

   ```
   export ARTIFACT_BUCKET=pos-deploy-artifacts-505467908806-us-east-2
   export ALERT_EMAIL=tu-correo@ejemplo.com
   ```

   Si el nombre del bucket de la parte 4 es otro, usa el que copiaste.

> **Importante:** CloudShell borra los archivos del directorio de trabajo temporal tras un tiempo sin usarse, pero conserva ~1 GB de tu carpeta personal. Si al volver ya no encuentras `POS`, repite los pasos 2 a 4.

### ✅ Comprobación de la parte 5

- [ ] `echo $AWS_REGION` dice `us-east-2`.
- [ ] `node -v` dice `v22` o más.
- [ ] `npm ci` terminó sin errores.

---

## Parte 6. Primer despliegue de staging

En CloudShell, dentro de la carpeta `POS`:

```
git pull
ENVIRONMENT=staging BUILD=1 ./infra/deploy.sh
```

**Qué hace, en orden:**

| Paso | Qué significa |
|---|---|
| 0. Construir | Empaqueta la API para Lambda y compila la web. |
| 1. Migraciones | Prepara las tablas en Neon (lee la cadena de Parameter Store). |
| 2. API, identidad y distribución | Crea el stack `pos-staging`: Cognito, Lambda, API Gateway, S3 y CloudFront. |
| 3. Dirección pública | La API necesita conocer la dirección de CloudFront, que no existe hasta crearse, así que la primera vez se despliega **dos veces**. |
| 4. Publicar la web | Sube los archivos a S3 y limpia la caché. |
| 5. Listo | Imprime `Aplicación: https://xxxx.cloudfront.net`. |

**La primera vez tarda entre 10 y 20 minutos** (CloudFront es lo más lento). Es normal que parezca detenido.

Al final anota la dirección de staging. Después corre las pruebas de humo:

```
node infra/smoke.mjs https://TU-DIRECCION.cloudfront.net
```

Debe mostrar todo con ✓. Si más tarde fijas una cuenta de pruebas, agrega `SMOKE_EMAIL` y `SMOKE_PASSWORD` escribiéndolos en la terminal (no en archivos).

**Correo de SNS:** llega un mensaje "AWS Notification - Subscription Confirmation" de las alarmas. Confírmalo.

### Si falla

| Dónde se detiene | Causa probable | Qué hacer |
|---|---|---|
| `ParameterNotFound` en las migraciones | Falta o está mal escrito `/pos/staging/database-url` | Corrige el nombre en Parameter Store (parte 3) |
| La migración no conecta o *password authentication failed* | Cadena mal copiada | Vuelve a copiarla de Neon y actualiza el parámetro |
| `AccessDenied` o *explicit deny in a service control policy* al crear algo | La política de tu cuenta prohíbe ese recurso | Pega el mensaje completo: se cambia la plantilla |
| `ROLLBACK_COMPLETE` | El stack falló al crearse y se deshizo | En CloudFormation → `pos-staging` → **Events**, copia la primera fila roja. Borra el stack antes de reintentar |
| Humo: *cabeceras de seguridad* | CloudFront aún propaga | Reintenta en 5 minutos |

> Un stack en `ROLLBACK_COMPLETE` no se puede actualizar: **bórralo** (CloudFormation → seleccionar → Delete) y vuelve a ejecutar el despliegue.

### ✅ Comprobación de la parte 6

- [ ] El script terminó con `Aplicación: https://…`.
- [ ] `/api/health` de esa dirección responde `{"status":"ok"}`.
- [ ] Las pruebas de humo salieron en verde.
- [ ] Confirmaste el correo de SNS.

---

## Parte 7. Crear tu tienda y tu usuario

El inicio de sesión necesita dos cosas: una **cuenta en Cognito** (quién eres) y una **tienda en la base** (a qué datos accedes). Un script hace ambas; **tú fijas la contraseña**, así nunca queda en un archivo.

### 7.1 Crear la cuenta y la tienda

En CloudShell, en la carpeta `POS` (cambia el nombre y el correo):

```
ENVIRONMENT=staging ./infra/provision.sh "Nombre de mi tienda" tu-correo@ejemplo.com
```

Debe terminar con "Cuenta lista".

### 7.2 Fijar tu contraseña

La contraseña debe tener **al menos 12 caracteres, con mayúscula, minúscula y número**; puede llevar símbolos como `/` o `-`. No la escribas dentro de ningún comando ni la pegues en el chat.

> **Pega un comando a la vez.** Si pegas varias líneas juntas, el comando `read` toma como contraseña la línea que sigue y el comando que fija la contraseña no llega a ejecutarse. Entonces la cuenta sigue en `FORCE_CHANGE_PASSWORD` y el sitio dice "Correo o contraseña incorrectos".

1. Obtén el identificador del grupo de usuarios (cambia `pos-staging` por `pos-prod` en producción):

   ```
   POOL=$(aws cloudformation describe-stacks --stack-name pos-staging --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
   ```

2. Pega **solo esta línea**, pulsa Enter y, cuando quede esperando, escribe tu contraseña (no se ve) y pulsa Enter:

   ```
   read -rs -p "Contraseña: " PW; echo
   ```

   El texto entre comillas es solo el aviso: déjalo como está.
3. Pega **solo este comando** (cambia el correo) y pulsa Enter:

   ```
   aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username tu-correo@ejemplo.com --password "$PW" --permanent
   ```

   Si no imprime nada, funcionó. Si dice `InvalidPasswordException`, la contraseña no cumple; repite desde el paso 2.
4. Borra la contraseña de la memoria de la terminal:

   ```
   unset PW
   ```

5. Comprueba que quedó (debe decir `CONFIRMED`):

   ```
   aws cognito-idp admin-get-user --user-pool-id "$POOL" --username tu-correo@ejemplo.com --query '{estado:UserStatus,activo:Enabled}'
   ```

Si cometiste un error, repite los pasos 2 a 4 las veces que haga falta. Si la contraseña se mostró en pantalla o la compartiste, cámbiala.

### 7.3 Usuario para las pruebas de humo (recomendado)

Para que las pruebas automáticas no usen tus datos reales de producción, crea en **cada** entorno otra cuenta de prueba, repitiendo 7.1 y 7.2 con:

- Nombre de tienda: `Pruebas de humo`.
- Correo: una variante tuya, por ejemplo `tucorreo+humo@gmail.com`.

### ✅ Comprobación de la parte 7

- [ ] `provision.sh` terminó en "Cuenta lista".
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

### 8.1 Los 15 flujos automáticos contra staging (opcional, recomendado)

Además de tu prueba a mano, GitHub puede recorrer los 15 flujos del documento de requerimientos contra tu dirección de staging, en móvil y escritorio. No usa AWS ni llaves: solo la dirección pública y **dos tiendas de pruebas** propias para esto (distintas de las de las personas que prueban a mano, porque la prueba crea y cancela ventas).

1. En CloudShell, crea las dos tiendas, con un correo distinto cada una (por ejemplo `tucorreo+e2e1@gmail.com` y `tucorreo+e2e2@gmail.com`):

   ```
   ENVIRONMENT=staging ./infra/provision.sh "E2E 1" tucorreo+e2e1@gmail.com
   ENVIRONMENT=staging ./infra/provision.sh "E2E 2" tucorreo+e2e2@gmail.com
   ```

   Fija la contraseña de cada una como en la parte 7.2, **un comando a la vez**.
2. En GitHub → **Settings → Environments → New environment**: `staging`.
   - **Environment variables:** `E2E_BASE_URL` = la dirección de staging, sin `/` al final.
   - **Environment secrets:** `E2E_OWNER_EMAIL` y `E2E_OWNER_PASSWORD` (la primera tienda), `E2E_OTHER_EMAIL` y `E2E_OTHER_PASSWORD` (la segunda).
3. GitHub → **Actions → E2E staging → Run workflow**. Tarda unos 8 a 12 minutos.
4. Debe terminar en verde. Si falla, abre la ejecución: las trazas de los fallos quedan como archivo descargable durante 7 días.

La API de staging limita el ritmo (10 solicitudes por segundo) para acotar costos; la prueba reintenta una vez un flujo si coincide con esa limitación o con el despertar de la base.

### ✅ Comprobación de la parte 8

- [ ] Todo lo de la lista funciona en teléfono y computadora.
- [ ] Las pruebas de humo del último despliegue estaban en verde con sesión (si ya tienes la cuenta de humo, corre `SMOKE_EMAIL=… SMOKE_PASSWORD=… node infra/smoke.mjs <dirección>` escribiendo la contraseña en la terminal).

---

## Parte 9. Producción

Producción repite todo, pero con la base y el usuario reales, y solo desde una versión etiquetada.

### 9.1 Publicar el código en `main` y crear la versión

1. Abre el PR de `dev` a `main` y apruébalo cuando la CI esté en verde (como hiciste con el #17).
2. GitHub → **Releases** → **Draft a new release**.
3. **Choose a tag**: escribe `v0.1.0` y elige "Create new tag on publish". **Target:** `main`.
4. Título `v0.1.0`; en la descripción, un resumen breve. **Publish release**.

### 9.2 Desplegar

En CloudShell, en la carpeta `POS`:

```
git fetch --tags
git checkout v0.1.0
ENVIRONMENT=prod BUILD=1 ./infra/deploy.sh
```

Producción se despliega **siempre desde una etiqueta**, no desde una rama: así sabes exactamente qué versión está en línea. Al terminar anota la dirección de producción y corre las pruebas de humo:

```
node infra/smoke.mjs https://TU-DIRECCION-DE-PRODUCCION.cloudfront.net
```

### 9.3 Tienda, contraseña y humo

Repite la **parte 7** con `ENVIRONMENT=prod` y `--stack-name pos-prod`:

- [ ] `ENVIRONMENT=prod ./infra/provision.sh "Tu tienda real" tu-correo@ejemplo.com`
- [ ] Contraseña con el comando de 7.2 (cambia `pos-staging` por `pos-prod`).
- [ ] Usuario de pruebas de humo para producción.

### 9.4 Prueba de humo y uso

- [ ] Abre la dirección de producción, inicia sesión y haz **una** venta pequeña de verdad (o de prueba y cancélala).
- [ ] Revisa en CloudWatch que no hay errores.
- [ ] Guarda la dirección como acceso directo en tu teléfono.

### ✅ Comprobación de la parte 9

- [ ] El despliegue de `prod` terminó y las pruebas de humo salieron en verde.
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
2. En CloudShell: `git checkout dev && git pull && ENVIRONMENT=staging BUILD=1 ./infra/deploy.sh`. Probar.
3. PR de `dev` a `main` → crear etiqueta nueva (`v0.1.1`…) → `git fetch --tags && git checkout v0.1.1 && ENVIRONMENT=prod BUILD=1 ./infra/deploy.sh`.

### Volver atrás (reversión)

Vuelve a ejecutar `deploy.sh` con la etiqueta de la versión anterior (`git checkout v0.1.0`) y `ENVIRONMENT=prod`. Las migraciones **no** se revierten: por eso se escriben compatibles hacia atrás y se prueban primero en staging.

### Agregar a otra persona o tienda

`./infra/provision.sh` con el nombre de su tienda y su correo; luego fija su contraseña (parte 7.2).

### Cambiar una contraseña olvidada

CloudShell: el mismo comando `admin-set-user-password` de la parte 7.2 con la contraseña nueva.

### Si llegó la alerta de presupuesto al 100 %

1. Revisa **Billing → Cost Explorer** para ver qué servicio cobró.
2. En el Free plan no deberías ver cobros. Si pasaste al Paid plan, revisa también el tope de gasto del proyecto en <https://settings.aws.com>: al alcanzarlo AWS **pausa** los recursos hasta el mes siguiente, o hasta que lo subas.
3. Entiende el cobro antes de volver a desplegar.

### Respaldo y restauración (parte 9c)

**Qué hay.** Cada domingo a las 09:00 UTC (03:00 en la Ciudad de México) una función de AWS (`pos-<entorno>-backup`) exporta **toda la base** a un archivo comprimido y cifrado en un bucket de S3. Se conservan **30 días**; el bucket y la función se crean con el despliegue. Si la función falla, llega una alarma al correo.

**Hacer un respaldo ahora** (cambia `staging` por `prod` cuando toque):

```
aws lambda invoke --function-name pos-staging-backup --cli-binary-format raw-in-base64-out /tmp/respaldo.json
cat /tmp/respaldo.json
```

Debe mostrar la ruta del archivo (`key`), su tamaño y cuántas filas respaldó por tabla.

**Ver los respaldos guardados:**

```
BUCKET=$(aws cloudformation describe-stacks --stack-name pos-staging --query "Stacks[0].Outputs[?OutputKey=='BackupBucketName'].OutputValue" --output text)
aws s3 ls "s3://$BUCKET/staging/"
```

#### Probar la restauración (hazlo una vez antes de usar producción)

Un respaldo sirve solo si se sabe restaurar. Se prueba en una **rama nueva y vacía de Neon**, sin tocar tus datos. Un comando a la vez.

1. En Neon crea una rama `restauracion-prueba` a partir de la rama **principal** (la de producción, que todavía está vacía) y copia su cadena de conexión con "Connection pooling".
2. En CloudShell, descarga el respaldo más reciente (cambia el nombre del archivo por el que viste en `aws s3 ls`):

   ```
   aws s3 cp "s3://$BUCKET/staging/pos-AAAAMMDDTHHMMSSZ.ndjson.gz" /tmp/respaldo.ndjson.gz
   ```

3. Escribe la cadena de la rama de prueba sin que se vea (la línea sola, luego pulsa Enter, pega la cadena y Enter):

   ```
   read -rs -p "Cadena de la rama de prueba: " DATABASE_URL; echo
   ```

4. Prepara las tablas de esa rama (migraciones):

   ```
   export DATABASE_URL; npm run migrate -w @pos/api
   ```

5. Restaura:

   ```
   npm run restore -w @pos/api -- --file /tmp/respaldo.ndjson.gz
   ```

   Muestra cuántas filas restauró por tabla y termina con "Respaldo restaurado". **Compara esos números con los del paso de "Hacer un respaldo ahora"**: deben coincidir.
6. Limpia y borra la rama de prueba en Neon:

   ```
   unset DATABASE_URL
   ```

La restauración se niega si la base de destino **no está vacía** o si es de otra versión del esquema (otra migración), y si algo falla no deja nada a medias.

**Para recuperar de verdad** (desastre): crea una rama nueva y vacía en Neon, migra, restaura el respaldo que elijas y actualiza el parámetro `/pos/<entorno>/database-url` en Parameter Store con la cadena de esa rama. Avísame y lo hacemos juntos.

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
| Iniciar sesión dice "Correo o contraseña incorrectos" | Lo más probable: la contraseña nunca se fijó. Comprueba con el paso 5 de 7.2: si dice `FORCE_CHANGE_PASSWORD`, repite 7.2 pegando **un comando a la vez**. Si dice `CONFIRMED`: correo distinto al del alta o contraseña mal escrita. |
| Inicia sesión y pide algo de "tienda" o aparece "tu cuenta aún no tiene una tienda" | Falta ejecutar `provision.sh` para ese correo en ese entorno. |
| Cualquier guardado falla con 403 "origen no permitido" | La API no conoce su dirección: vuelve a ejecutar `deploy.sh` (el segundo paso la corrige). |
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
| Lambda y S3 del respaldo | 1 ejecución por semana, archivos de unos MB con borrado a los 30 días | $0 |
| Budgets | 2 presupuestos con 1 acción | $0 |
| Neon | proyecto gratuito | $0 |

Los números vienen de las páginas de precios al momento de escribir esto y pueden cambiar; por eso existen las alertas de la parte 4.

## Apéndice B. Qué tocó cada parte del repositorio

| Archivo | Para qué |
|---|---|
| `infra/bootstrap.yaml` | Parte 4 (bucket de despliegue y presupuestos) |
| `infra/template.yaml` | Partes 6 y 9 (todo el entorno) |
| `infra/deploy.sh` | Partes 6 y 9 (migraciones, despliegue, publicar la web) |
| `infra/smoke.mjs` | Pruebas de humo |
| `.github/workflows/e2e-staging.yml` y `apps/web/playwright.staging.config.ts` | Parte 8.1 (los 15 flujos contra staging) |
| `infra/cloudshell-prepare.sh` | Parte 5 (Node y dependencias en CloudShell) |
| `infra/provision.sh` | Parte 7 (tienda y usuario) |
| `.github/workflows/{deploy,provision}.yml` | **No se usan en tu cuenta** (requieren OIDC, prohibido por su política); quedan para una cuenta que lo permita |
| `apps/api/src/lambda.ts` | La API dentro de Lambda |
| `apps/api/src/modules/auth/cognito-identity-provider.ts` | Inicio de sesión con Cognito |

## Apéndice C. Glosario

| Palabra | Significa |
|---|---|
| **Región** | Ciudad (centro de datos) de AWS donde viven tus recursos. |
| **IAM / rol** | Permisos de AWS. Un rol es un conjunto de permisos que alguien (aquí GitHub) puede "ponerse" por un rato. |
| **OIDC** | Forma de que GitHub demuestre quién es ante AWS sin llaves guardadas. Tu cuenta no lo permite, por eso se despliega desde CloudShell. |
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
