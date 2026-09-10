#!/usr/bin/env bash

set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"

PORT_NUMBER="${MAINTENANCE_DRILL_PORT:-4317}"
BASE_URL="http://127.0.0.1:${PORT_NUMBER}"
LOG_FILE="$(mktemp /tmp/hekmat-atelier-maintenance-http.XXXXXX.log)"
SERVER_PID=""
READINESS_BODY=""

cleanup() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAtc "UPDATE application_runtime_state SET maintenance_mode=false, operation=NULL, backup_id=NULL, started_at=NULL, updated_at=NOW() WHERE id='global'" >/dev/null 2>&1 || true
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" >/dev/null 2>&1 || true; wait "$SERVER_PID" >/dev/null 2>&1 || true; fi
  if [ -n "$READINESS_BODY" ]; then rm -f "$READINESS_BODY"; fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

NODE_ENV=production APP_ENV=staging GIT_SHA="$GITHUB_SHA" AUTH_SECRET=ci-maintenance-drill-secret npm run build
NODE_ENV=production APP_ENV=staging GIT_SHA="$GITHUB_SHA" AUTH_SECRET=ci-maintenance-drill-secret npx next start -H 127.0.0.1 -p "$PORT_NUMBER" >"$LOG_FILE" 2>&1 &
SERVER_PID="$!"

for _attempt in $(seq 1 30); do
  curl -fsS --max-time 2 "$BASE_URL/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS --max-time 3 "$BASE_URL/api/health" | grep -q '"process":"alive"' || { tail -50 "$LOG_FILE" >&2; exit 1; }

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAtc "UPDATE application_runtime_state SET maintenance_mode=true, operation='restore_http_drill', started_at=NOW(), updated_at=NOW() WHERE id='global'" >/dev/null

health_status="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/health")"
test "$health_status" = "200" || { echo "Health must remain live during maintenance." >&2; exit 1; }

READINESS_BODY="$(mktemp /tmp/hekmat-atelier-readiness.XXXXXX.json)"
readiness_status="$(curl -sS -o "$READINESS_BODY" -w '%{http_code}' "$BASE_URL/api/readiness")"
test "$readiness_status" = "503" && grep -q '"reason":"maintenance"' "$READINESS_BODY" || { echo "Readiness must report maintenance." >&2; exit 1; }
rm -f "$READINESS_BODY"
READINESS_BODY=""

for request_path in \
  /api/studio/projects \
  /api/studio/projects/00000000-0000-4000-8000-000000000001/contracts \
  /api/studio/projects/00000000-0000-4000-8000-000000000001/payments \
  /api/studio/projects/00000000-0000-4000-8000-000000000001/expenses \
  /api/studio/personnel/00000000-0000-4000-8000-000000000001/salary/00000000-0000-4000-8000-000000000002 \
  /api/studio/equipment/reservations \
  /api/studio/projects/00000000-0000-4000-8000-000000000001/execution; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "$BASE_URL$request_path")"
  test "$status" = "503" || { echo "Maintenance write gate failed for $request_path with status $status." >&2; exit 1; }
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAtc "UPDATE application_runtime_state SET maintenance_mode=false, operation=NULL, backup_id=NULL, started_at=NULL, updated_at=NOW() WHERE id='global'" >/dev/null
curl -fsS --max-time 3 "$BASE_URL/api/readiness" | grep -q '"status":"ready"' || { echo "Readiness did not recover after maintenance drill." >&2; exit 1; }

echo "maintenance.http_drill=pass"
