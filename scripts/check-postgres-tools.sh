#!/usr/bin/env bash

set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required for PostgreSQL compatibility checks}"

for command_name in psql pg_dump pg_restore; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required PostgreSQL tool is missing: $command_name" >&2
    exit 127
  }
done

server_version_num="$(psql "$DATABASE_URL" -Atqc 'SHOW server_version_num')"
server_version="$(psql "$DATABASE_URL" -Atqc 'SHOW server_version')"
server_major="$((server_version_num / 10000))"
dump_version="$(pg_dump --version)"
restore_version="$(pg_restore --version)"
dump_major="$(sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/' <<<"$dump_version")"
restore_major="$(sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/' <<<"$restore_version")"

[[ "$server_major" =~ ^[0-9]+$ && "$dump_major" =~ ^[0-9]+$ && "$restore_major" =~ ^[0-9]+$ ]] || {
  echo "Unable to determine PostgreSQL tool compatibility." >&2
  exit 1
}

if (( dump_major < server_major )); then
  echo "pg_dump major version $dump_major is older than PostgreSQL server major version $server_major." >&2
  exit 1
fi
if (( restore_major != dump_major )); then
  echo "pg_restore major version $restore_major must match pg_dump major version $dump_major." >&2
  exit 1
fi

echo "postgres.server_major=$server_major"
echo "postgres.server_version=$server_version"
echo "postgres.psql=$(psql --version)"
echo "postgres.pg_dump=$dump_version"
echo "postgres.pg_restore=$restore_version"
