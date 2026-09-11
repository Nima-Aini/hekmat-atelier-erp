#!/usr/bin/env bash

set -Eeuo pipefail

# Production identity is deliberately external configuration. Never infer an
# Atelier target from values that belonged to another deployment.
PROJECT_DIR="${PROJECT_DIR:?PROJECT_DIR is required}"
APP_NAME="${APP_NAME:?APP_NAME is required}"
PORT="${PORT:?PORT is required}"
READINESS_URL="${READINESS_URL:?READINESS_URL is required}"
APP_ENV="${APP_ENV:?APP_ENV is required}"
EXPECTED_REPOSITORY_URL="${EXPECTED_REPOSITORY_URL:?EXPECTED_REPOSITORY_URL is required}"
TARGET_SHA="${1:?An exact target SHA is required}"
LOCK_FILE="${LOCK_FILE:-/tmp/${APP_NAME}.deploy.lock}"
PREVIOUS_SHA=""
ROLLING_BACK=0

validate_runtime_target() {
  [[ "$PROJECT_DIR" = /* ]] || { echo "PROJECT_DIR must be absolute." >&2; exit 1; }
  case "${PROJECT_DIR%/}" in
    ""|/|/var|/var/www|/root|/home|/opt|/usr|/var/www/project2)
      echo "PROJECT_DIR is too broad or belongs to a legacy application." >&2
      exit 1
      ;;
  esac
  [[ "$APP_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$ ]] || { echo "APP_NAME is invalid." >&2; exit 1; }
  case "$APP_NAME" in akma-accounting|project1|project2) echo "Legacy PM2 application name is forbidden." >&2; exit 1 ;; esac
  [[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1024 && PORT <= 65535 )) || { echo "PORT must be between 1024 and 65535." >&2; exit 1; }
  [[ "$READINESS_URL" =~ ^https?:// ]] || { echo "READINESS_URL must be HTTP(S)." >&2; exit 1; }
  case "$EXPECTED_REPOSITORY_URL" in *Nima-Aini/hekmat.git*) echo "Legacy repository is forbidden." >&2; exit 1 ;; esac
}

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

start_application() {
  local running_sha
  running_sha="$(git rev-parse HEAD)"
  mkdir -p .next/standalone/.next

  if [ -d public ]; then
    rm -rf .next/standalone/public
    cp -a public .next/standalone/public
  fi

  rm -rf .next/standalone/.next/static
  cp -a .next/static .next/standalone/.next/static
  cp .env .next/standalone/.env

  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    PORT="$PORT" HOSTNAME="0.0.0.0" NODE_ENV="production" APP_ENV="$APP_ENV" GIT_SHA="$running_sha" \
      pm2 reload "$APP_NAME" --update-env
  else
    PORT="$PORT" HOSTNAME="0.0.0.0" NODE_ENV="production" APP_ENV="$APP_ENV" GIT_SHA="$running_sha" \
      pm2 start .next/standalone/server.js --name "$APP_NAME"
  fi
}

install_build_dependencies() {
  # A Next.js build needs devDependencies (Tailwind/PostCSS/TypeScript), even
  # when the server's .env has NODE_ENV=production.
  if [ -f package-lock.json ]; then
    npm ci --include=dev --no-audit --no-fund
  else
    # Old revisions predate package-lock.json; keep rollback functional.
    npm install --include=dev --no-audit --no-fund
  fi
}

wait_until_healthy() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 4 "$READINESS_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  local exit_code="$1"
  local line_number="$2"
  local failed_command="$3"

  if [ "$ROLLING_BACK" -eq 1 ]; then
    exit "$exit_code"
  fi
  ROLLING_BACK=1
  trap - ERR

  log "Deployment failed at line $line_number: $failed_command (exit $exit_code)"
  log "Starting application rollback"
  if [ -n "$PREVIOUS_SHA" ]; then
    cd "$PROJECT_DIR"
    git checkout --detach "$PREVIOUS_SHA"
    install_build_dependencies
    npm run build
    start_application
    if wait_until_healthy; then
      pm2 save
      log "Application restored to $PREVIOUS_SHA"
    else
      log "Rollback failed. Check: pm2 logs $APP_NAME --lines 100"
    fi
  fi

  log "Database restoration is intentionally manual and never part of rollback."
  exit "$exit_code"
}

on_error() {
  local exit_code="$1"
  local line_number="$2"
  local failed_command="$3"
  trap - ERR
  rollback "$exit_code" "$line_number" "$failed_command"
}

trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR

validate_runtime_target

for required_command in git node npm pm2 curl pg_dump pg_restore psql flock ss; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required server command is missing: $required_command"
    exit 127
  fi
done

log "Selected application port: $PORT"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deployment is already running."
  exit 1
fi

cd "$PROJECT_DIR"

ACTUAL_REPOSITORY_URL="$(git remote get-url origin)"
if [ "$ACTUAL_REPOSITORY_URL" != "$EXPECTED_REPOSITORY_URL" ]; then
  echo "Repository remote does not match the configured Atelier repository." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env file not found in $PROJECT_DIR"
  exit 1
fi

if ! grep -q '^DATABASE_URL=' .env; then
  echo "DATABASE_URL is missing from .env"
  exit 1
fi

# Refuse to erase manual tracked-file edits made directly on the server.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked files have local changes. Commit or remove them before deployment."
  git status --short
  exit 1
fi

PREVIOUS_SHA="$(git rev-parse HEAD)"

# Deployment identity cannot be overridden by values sourced from the app .env.
DEPLOY_PROJECT_DIR="$PROJECT_DIR"
DEPLOY_APP_NAME="$APP_NAME"
DEPLOY_PORT="$PORT"
DEPLOY_READINESS_URL="$READINESS_URL"
DEPLOY_APP_ENV="$APP_ENV"
DEPLOY_REPOSITORY_URL="$EXPECTED_REPOSITORY_URL"
DEPLOY_TARGET_SHA="$TARGET_SHA"
DEPLOY_PREVIOUS_SHA="$PREVIOUS_SHA"

set -a
# shellcheck disable=SC1091
source .env
set +a
PROJECT_DIR="$DEPLOY_PROJECT_DIR"
APP_NAME="$DEPLOY_APP_NAME"
PORT="$DEPLOY_PORT"
READINESS_URL="$DEPLOY_READINESS_URL"
APP_ENV="$DEPLOY_APP_ENV"
EXPECTED_REPOSITORY_URL="$DEPLOY_REPOSITORY_URL"
TARGET_SHA="$DEPLOY_TARGET_SHA"
PREVIOUS_SHA="$DEPLOY_PREVIOUS_SHA"

log "Deployment metadata: repository=$EXPECTED_REPOSITORY_URL sha=$TARGET_SHA path=$PROJECT_DIR pm2=$APP_NAME port=$PORT readiness=$READINESS_URL environment=$APP_ENV"

if ! pm2 describe "$APP_NAME" >/dev/null 2>&1 && ss -H -ltn "sport = :$PORT" | grep -q .; then
  echo "Configured port is already owned by another process; deployment will not terminate it." >&2
  exit 1
fi

log "Selecting the exact verified revision"
if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Target must be a full 40-character commit SHA: $TARGET_SHA"
  exit 1
fi
if ! git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null; then
  echo "Requested commit does not exist: $TARGET_SHA"
  exit 1
fi
git checkout --detach "$TARGET_SHA"
test "$(git rev-parse HEAD)" = "$TARGET_SHA"

log "Installing dependencies and building production frontend/server"
install_build_dependencies
npm run postgres:check
npm run build

log "Creating and verifying a pre-migration native PostgreSQL backup"
BACKUP_NOTES="Pre-deploy backup for ${TARGET_SHA}" npm run backup:create

log "Applying lock-safe additive migrations"
npm run db:migrate

log "Reloading PM2 application on port $PORT"
start_application

log "Checking application and database health"
wait_until_healthy
pm2 save

trap - ERR
log "Deployment successful: $(git rev-parse HEAD)"
log "Readiness check passed: $READINESS_URL"
log "Verified database backup created through the application backup service"
