# Hekmat Atelier ERP — Backup, Restore and Staging Operations

## Supported runtime

- Node.js 22 LTS and locked npm dependencies via `npm ci`
- PostgreSQL server 16
- `pg_dump` major version 16 or newer than the server major
- `pg_restore` from the same client package/version as `pg_dump`
- PM2, `curl`, `flock`, `ss`, Git and adequate local disk space
- Nginx or an equivalent reverse proxy for the configured staging URL

Run `npm run postgres:check` before backup/recovery operations. It prints version metadata only and never prints database credentials.

## Backup

Production backup is a PostgreSQL custom-format archive created with `pg_dump`. It captures the complete selected database, including Core ERP, Studio tables, sequences, indexes, constraints, and `app_migrations`. No application table allow-list is used.

Required server configuration:

- `DB_DRIVER=postgres`
- `DATABASE_URL`
- `BACKUP_STORAGE_DRIVER=local`
- `BACKUP_LOCAL_PATH` — absolute path outside the repository and `/public`
- optional `BACKUP_RETENTION_DAYS` and `BACKUP_MAX_COUNT`

The backup directory should belong to the application operator and be mode `0700`. Files are created with mode `0600`. Run from an external scheduler, not an in-process cron:

```bash
npm run backup:create
```

The command exits non-zero on failure. A backup is successful only after atomic rename, SHA-256 calculation, `pg_restore --list`, metadata write, and database status `verified`.
Before dumping, the service verifies that the directory can be created and written and that free space is at least 125% of the current PostgreSQL database size (with a 64 MiB minimum headroom).

## Verify

Use the administrative UI/API to recalculate checksum and read the archive catalog. For database link verification run:

```bash
npm run integrity:check
```

This command is read-only and never repairs records.

## Restore

Restore never targets the active database and never uses `TRUNCATE` or row-by-row inserts.

1. Create a new, empty PostgreSQL database on isolated storage.
2. Configure `RESTORE_TARGET_DATABASE_URL` for that empty database. It must differ from `DATABASE_URL`.
3. Select a verified backup in the admin UI.
4. Run restore validation and review checksum, format, schema, Git SHA, and warnings.
5. Enter `RESTORE` explicitly.
6. The backend enters maintenance mode and blocks writes/readiness.
7. `pg_restore --single-transaction --exit-on-error` restores the archive to the empty target.
8. Migration state and Studio/Core integrity are verified.
9. Maintenance mode exits after success or failure.
10. Only an infrastructure administrator may switch the application connection after reviewing the verified target.

If the process dies during restore, the centralized database maintenance flag remains intentionally. Investigate the target, confirm the active database was not changed, then clear the flag only through an approved recovery procedure.

## Disaster recovery

If the primary database is unavailable, keep the application unready, provision a clean target, validate and restore the latest verified archive, run `npm run integrity:check` against the target, and switch connection configuration only after review. Never auto-restore during startup, deploy, migration failure, or health checks.

## Staging

Staging requires a dedicated PostgreSQL database and must not share production storage or credentials.

GitHub staging secrets:

- `STAGING_SSH_HOST`
- `STAGING_SSH_USER`
- `STAGING_SSH_PRIVATE_KEY`
- optional `STAGING_SSH_PORT`

GitHub staging variables:

- `STAGING_DEPLOY_PATH`
- `STAGING_PM2_APP_NAME`
- `STAGING_APP_PORT`
- `STAGING_READINESS_URL`
- `STAGING_BASE_URL`
- `STAGING_DEPLOY_REPOSITORY_URL` (must be this repository)

Staging server `.env` must include its dedicated `DATABASE_URL`, `AUTH_SECRET`, `APP_ENV=staging`, backup storage values, and all required application secrets. Do not copy the production database URL.

Server requirements also include a dedicated, sufficiently specific deploy directory, a dedicated PM2 name and an unoccupied configured port. `/var/www/project2`, `akma-accounting`, `project1`, `project2`, broad paths such as `/var/www`, and the legacy `Nima-Aini/hekmat.git` repository are rejected. The first intentional deployment may create the configured PM2 process; subsequent releases reload only that exact process.

### Environment matrix

| Environment | Database | Backup/restore | Required configuration |
| --- | --- | --- | --- |
| Local development | PostgreSQL or explicit PGlite | Native recovery unavailable with PGlite | `DB_DRIVER`; PostgreSQL URL only when selected |
| CI | Ephemeral PostgreSQL 16 | Mandatory isolated source/target drill | `DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_ADMIN_URL`, `ALLOW_TEST_DATABASE=true` |
| Staging | Dedicated PostgreSQL 16 | Dedicated backup directory and disposable restore target | `APP_ENV=staging`, `AUTH_SECRET`, `DATABASE_URL`, `BACKUP_*`; restore target only during drill |
| Production | Dedicated PostgreSQL 16 | Scheduled verified backups; restore only by explicit recovery operation | `APP_ENV=production`, production secrets and explicit PostgreSQL/backup configuration |

PGlite is never permitted when `NODE_ENV=production`.

### Staging recovery proof

Create a backup from the dedicated staging database, configure a new disposable database as `RESTORE_TARGET_DATABASE_URL`, validate/restore it, run `npm run integrity:check` against that target, and reconcile the canonical fixture. Never point the active staging application at the target automatically and never restore over the source.

The guarded operator command is:

```bash
APP_ENV=staging ALLOW_STAGING_RESTORE_DRILL=true npm run staging:recovery-drill
```

It refuses non-staging environments, requires an explicit target URL, never switches databases, exits non-zero on any failure, and logs only safe backup/checksum/schema identifiers. Disable the flag again immediately after the drill.

## Rollback

Code rollback selects and rebuilds a previous Git SHA. It does not restore the database. Database restore is a separate disaster-recovery operation and always uses a clean target plus validation.

Deploys are exact-SHA and additive migrations run before PM2 reload. The previously running standalone build remains in service while install/build/migration/backup execute. If application validation fails, the deploy script rebuilds the previous SHA; it never restores a database. A previous code version is rollback-compatible only while new migrations remain additive/backward-compatible.
