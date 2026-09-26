#!/usr/bin/env bash

set -Eeuo pipefail

for name in DEPLOY_PATH PM2_APP_NAME APP_PORT READINESS_URL DEPLOY_REPOSITORY_URL EXPECTED_REPOSITORY_URL; do
  test -n "${!name:-}" || { echo "Missing required deployment value: $name" >&2; exit 1; }
done

[[ "$DEPLOY_PATH" = /* ]] || { echo "DEPLOY_PATH must be absolute." >&2; exit 1; }
case "${DEPLOY_PATH%/}" in
  ""|/|/var|/var/www|/root|/home|/opt|/usr|/var/www/project2)
    echo "DEPLOY_PATH is too broad or belongs to a legacy application." >&2
    exit 1
    ;;
esac

[[ "$PM2_APP_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$ ]] || {
  echo "PM2_APP_NAME is invalid." >&2
  exit 1
}
case "$PM2_APP_NAME" in
  akma-accounting|project1|project2)
    echo "PM2_APP_NAME belongs to a legacy application." >&2
    exit 1
    ;;
esac

[[ "$APP_PORT" =~ ^[0-9]+$ ]] && (( APP_PORT >= 1024 && APP_PORT <= 65535 )) || {
  echo "APP_PORT must be a numeric TCP port between 1024 and 65535." >&2
  exit 1
}

[[ "$READINESS_URL" =~ ^https?:// ]] || { echo "READINESS_URL must be an HTTP(S) URL." >&2; exit 1; }
test "$DEPLOY_REPOSITORY_URL" = "$EXPECTED_REPOSITORY_URL" || {
  echo "DEPLOY_REPOSITORY_URL must equal the expected Atelier repository URL." >&2
  exit 1
}
case "$DEPLOY_REPOSITORY_URL" in
  *Nima-Aini/hekmat.git*) echo "Legacy Hekmat repository is forbidden." >&2; exit 1 ;;
esac

echo "deployment.configuration=valid"
