#!/usr/bin/env bash
# Despliega un entorno completo (migraciones, API, web). Lo usa el flujo deploy.yml y también sirve a mano.
# Requiere: AWS CLI y SAM CLI con credenciales del rol de despliegue, y haber construido antes
#   npm run build -w @pos/web && npm run build:lambda -w @pos/api
# Variables: ENVIRONMENT (staging|prod), AWS_REGION, ARTIFACT_BUCKET, ALERT_EMAIL.
set -euo pipefail

: "${ENVIRONMENT:?Falta ENVIRONMENT (staging o prod)}"
: "${AWS_REGION:?Falta AWS_REGION}"
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
  sam deploy \
    --template-file infra/template.yaml \
    --stack-name "$STACK" \
    --region "$AWS_REGION" \
    --s3-bucket "$ARTIFACT_BUCKET" \
    --s3-prefix "$STACK" \
    --capabilities CAPABILITY_IAM \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
    "Environment=${ENVIRONMENT}" \
    "AppOrigin=$1" \
    "AlertEmail=${ALERT_EMAIL}" \
    "DatabaseUrlParam=${DB_PARAM}"
}

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
