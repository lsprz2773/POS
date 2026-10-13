#!/usr/bin/env bash
# Despliega un entorno completo (migraciones, API, web). Se ejecuta en AWS CloudShell (el flujo
# deploy.yml requiere un proveedor OIDC que la cuenta de la nueva experiencia no permite).
# Requiere: AWS CLI (viene en CloudShell) y Node 22 con las dependencias instaladas (`npm ci`).
# Variables: ENVIRONMENT (staging|prod), ARTIFACT_BUCKET, ALERT_EMAIL; AWS_REGION (CloudShell la define).
# BUILD=1 construye la API y la web antes de desplegar.
set -euo pipefail

: "${ENVIRONMENT:?Falta ENVIRONMENT (staging o prod)}"
: "${AWS_REGION:=${AWS_DEFAULT_REGION:-}}"
: "${AWS_REGION:?Falta AWS_REGION}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
: "${ARTIFACT_BUCKET:?Falta ARTIFACT_BUCKET}"
: "${ALERT_EMAIL:?Falta ALERT_EMAIL}"
case "$ENVIRONMENT" in staging | prod) ;; *) echo "ENVIRONMENT debe ser staging o prod" >&2; exit 1 ;; esac

STACK="pos-${ENVIRONMENT}"
DB_PARAM="/pos/${ENVIRONMENT}/database-url"
PLACEHOLDER="https://pending.invalid"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null || true
}

deploy() {
  # `package` sube el código de la Lambda al bucket y `deploy` aplica la plantilla (con la
  # transformación SAM): no hace falta instalar SAM CLI.
  aws cloudformation package \
    --template-file infra/template.yaml \
    --s3-bucket "$ARTIFACT_BUCKET" \
    --s3-prefix "$STACK" \
    --output-template-file "/tmp/${STACK}-packaged.yaml" >/dev/null
  aws cloudformation deploy \
    --template-file "/tmp/${STACK}-packaged.yaml" \
    --stack-name "$STACK" \
    --region "$AWS_REGION" \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
    "Environment=${ENVIRONMENT}" \
    "AppOrigin=$1" \
    "AlertEmail=${ALERT_EMAIL}" \
    "DatabaseUrlParam=${DB_PARAM}"
}

if [ "${BUILD:-0}" = "1" ]; then
  echo "== 0/5 Construir"
  npm run build:lambda -w @pos/api
  npm run build -w @pos/web
fi

echo "== 1/5 Migraciones (${ENVIRONMENT})"
# Primero el esquema: las migraciones son compatibles hacia atrás, así que el código anterior sigue
# funcionando mientras se despliega el nuevo. Nunca se ejecutan al arrancar la Lambda.
DATABASE_URL="$(aws ssm get-parameter --name "$DB_PARAM" --with-decryption --region "$AWS_REGION" \
  --query Parameter.Value --output text)"
export DATABASE_URL
npm run migrate -w @pos/api
unset DATABASE_URL

echo "== 2/5 API, identidad y distribución"
CURRENT="$(output WebUrl)"
if [ -z "$CURRENT" ] || [ "$CURRENT" = "None" ]; then CURRENT="$PLACEHOLDER"; fi
deploy "$CURRENT"

echo "== 3/5 Dirección pública"
WEB_URL="$(output WebUrl)"
if [ "$WEB_URL" != "$CURRENT" ]; then
  # Primer despliegue (o cambió la distribución): la API debe conocer su propia dirección.
  echo "La dirección es $WEB_URL; se actualiza la API."
  deploy "$WEB_URL"
fi

echo "== 4/5 Publicar la web"
BUCKET="$(output WebBucketName)"
DISTRIBUTION="$(output DistributionId)"
aws s3 sync apps/web/dist/assets "s3://${BUCKET}/assets" --delete \
  --cache-control "public,max-age=31536000,immutable"
aws s3 sync apps/web/dist "s3://${BUCKET}" --delete --exclude "assets/*" \
  --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/index.html" >/dev/null

echo "== 5/5 Listo"
echo "Aplicación: ${WEB_URL}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "web_url=${WEB_URL}" >>"$GITHUB_OUTPUT"; fi
