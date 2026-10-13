#!/usr/bin/env bash
# Da de alta una tienda y su usuario en un entorno ya desplegado: crea la cuenta en Cognito (sin
# contraseña) y la tienda en la base con el `sub` de esa cuenta. Se ejecuta en AWS CloudShell; la
# contraseña se fija aparte (docs/manual-despliegue.md) para que nunca quede en un archivo ni en GitHub.
# Uso: ENVIRONMENT=staging ./infra/provision.sh "Nombre de la tienda" correo@ejemplo.com
set -euo pipefail

: "${ENVIRONMENT:?Falta ENVIRONMENT (staging o prod)}"
: "${AWS_REGION:=${AWS_DEFAULT_REGION:-}}"
: "${AWS_REGION:?Falta AWS_REGION}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
STORE_NAME="${1:?Uso: provision.sh \"Nombre de la tienda\" correo}"
EMAIL="$(echo "${2:?Uso: provision.sh \"Nombre de la tienda\" correo}" | tr '[:upper:]' '[:lower:]' | xargs)"
case "$ENVIRONMENT" in staging | prod) ;; *) echo "ENVIRONMENT debe ser staging o prod" >&2; exit 1 ;; esac

STACK="pos-${ENVIRONMENT}"
POOL="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)"

if ! aws cognito-idp admin-get-user --user-pool-id "$POOL" --username "$EMAIL" >/dev/null 2>&1; then
  aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
    --user-attributes "Name=email,Value=$EMAIL" "Name=email_verified,Value=true" \
    --message-action SUPPRESS >/dev/null
fi
SUB="$(aws cognito-idp admin-get-user --user-pool-id "$POOL" --username "$EMAIL" \
  --query "UserAttributes[?Name=='sub'].Value" --output text)"

DATABASE_URL="$(aws ssm get-parameter --name "/pos/${ENVIRONMENT}/database-url" \
  --with-decryption --query Parameter.Value --output text)"
export DATABASE_URL
npm run provision -w @pos/api -- --name "$STORE_NAME" --email "$EMAIL" --subject "$SUB"
unset DATABASE_URL
echo "Cuenta lista. Falta fijar la contraseña (manual de despliegue, parte 7)."
