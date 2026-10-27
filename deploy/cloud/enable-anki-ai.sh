#!/usr/bin/env bash
# Explicit operations fix for an already deployed AI-capable release. Never rotates keys.
set -euo pipefail
[[ $(id -u) == 0 ]] || { printf '%s\n' 'Run this server operation as root.' >&2; exit 1; }
exec 9>/opt/dblog/shared/deploy.lock
flock -n 9 || { printf '%s\n' 'Another deployment is running.' >&2; exit 1; }
release=$(readlink -f /opt/dblog/current)
env_file=/opt/dblog/shared/cloud.env
initializer=/opt/dblog-tools/initialize-anki-ai-key.py
[[ -f "$initializer" && -f "$env_file" && -f "$release/deploy/cloud/compose.yml" ]] || exit 1
base=(docker compose --env-file "$env_file" -f "$release/deploy/cloud/compose.yml" -f "$release/deploy/cloud/compose.ip.yml")
db=$("${base[@]}" ps -q db)
count=$(docker exec "$db" psql -U dblog -d dblog -Atc 'SELECT count(*) FROM anki_ai_settings WHERE api_key_ciphertext IS NOT NULL;')
[[ "$count" =~ ^[0-9]+$ ]] || exit 1
python3 "$initializer" --env-file "$env_file" --existing-key-count "$count"
# Keep the existing immutable release untouched; values come only from private cloud.env.
override=$(mktemp /opt/dblog/shared/.anki-ai-compose-XXXXXX.yml)
trap 'rm -f "$override"' EXIT
chmod 600 "$override"
printf '%s\n' 'services:' '  api:' '    environment:' '      ANKI_AI_ENCRYPTION_KEY: ${ANKI_AI_ENCRYPTION_KEY:-}' '      ANKI_AI_ENCRYPTION_KEY_ID: ${ANKI_AI_ENCRYPTION_KEY_ID:-v1}' '      ANKI_AI_MODEL: ${ANKI_AI_MODEL:-deepseek-flash}' > "$override"
updated=("${base[@]}" -f "$override")
"${updated[@]}" config --quiet
if ! "${updated[@]}" up -d --no-deps --no-build --wait --wait-timeout 120 api; then
  printf '%s\n' 'AI activation failed; restoring the existing API configuration.' >&2
  "${base[@]}" up -d --no-deps --no-build --wait --wait-timeout 120 api
  exit 1
fi
if ! curl --fail --silent --show-error --max-time 20 https://43.138.216.53/api/v1/health; then
  "${base[@]}" up -d --no-deps --no-build --wait --wait-timeout 120 api
  exit 1
fi
printf '\n%s\n' 'AI server encryption enabled; database, web and historical releases unchanged.'
