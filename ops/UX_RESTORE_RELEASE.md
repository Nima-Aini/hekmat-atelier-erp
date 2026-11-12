# Hekmat Atelier UX and recovery release

Starting point: `codex/phase2-hardening`, `9701086bca23773e2e8853708864bc2449d0fbec`.
Implementation branch: `codex/atelier-ux-safe-restore`.
The default branch `main` was older (`7375778`) and was not used as the implementation base. The checkout was clean before changes. No repository AGENTS.md was present. No live database or server credentials were used.

## Implemented

- Personal light/dark theme, custom or curated accent, accessible accent foreground, database persistence and a validated server cookie for first render. All authenticated users can use `/appearance`; the same controls are in settings. Tokens cover the shared shell, inputs, panels, modals, tables, calendar and semantic light-mode colors.
- App Router section paths and customer/contract detail paths. Authentication returns to the requested local URL; unknown paths return 404. Browser history uses the router. Search, tabs, calendar month and dashboard/daily-visit ranges are stored in validated URL parameters.
- Accessible, inline 24-hour hour/minute selector for contract time and custom time fields. Values remain civil Tehran times converted through the existing date functions. Historical records are not rewritten.
- One administrator-controlled reservation personnel checkbox list, sourced from the personnel module including inactive or unlinked people. Normalized unique assignments. Selected active personnel receive view/edit capabilities for their assigned reservations; they cannot delegate or gain deletion rights. Legacy view rules remain; legacy sharing mutations are rejected. Historical sharing is preserved as read policy, not migrated into edit authority.
- Customer services are administrator-created only, with title/notes/date/time editing and cancellation. One existing-style reminder per manual item is updated in the same transaction and resolved on cancellation/completion. Audit found no automatic inserts into `studio_customer_tasks`; the apparent automatic items were source projections. Customer services now return only manual items, while contracts, calendar, tasks and historical source records remain in their own workflows.
- Streaming `.dump` upload (128 MiB limit), native catalog/schema checks, validation/confirmation separation, restore history and protected safety-backup downloads. Current format and known migration-014 archives are supported; migration 015 is applied only to the isolated candidate. Unknown/newer schemas and JSON/SQL/other exports are rejected explicitly.
- Fresh verified, retention-protected safety backup before isolated restore and another immediately before activation. Concurrent restores are rejected. Uploaded archives are restored with a non-privileged database role outside explicitly disposable tests. Database activation uses a separate privileged control connection; uploaded SQL is never executed with that connection.
- Recoverable database-name cutover: block connections, terminate/roll back in-flight database work, rename both databases in one transaction, verify, invalidate sessions, then release maintenance. The old database is retained, closed to new connections. Failed cutover attempts roll back to the old database and verify recovery. If recovery cannot be verified, writes remain blocked and operator recovery is required. Operational journals are written in protected backup storage outside both databases. No environment, source or deployment configuration is restored from an archive.

## Database migration

`015_appearance_reservation_managers`: adds `user_appearance`, `reservation_managers`, a unique composite assignment key and personnel index. No business records are removed or rewritten. No historical access is silently upgraded to management.

## Local verification evidence

- Full PostgreSQL 16 regression suite: 251 passed, 4 skipped (native drill suites opt in). One earlier run hit a 5-second test deadline; the complete successful run used `--testTimeout=30000 --hookTimeout=60000`.
- Focused current appearance/customer/reservation/CSS suite: 29 passed.
- Both native PostgreSQL 16 recovery suites: 3 tests passed, including invalid/corrupt input, explicit confirmation, failed safety creation, concurrency, fresh safety snapshot, real restore, forced post-cutover failure, verified rollback and successful activation/session invalidation.
- Production build and dynamic-page CSS guard passed. Final production build, CSS guard and TypeScript checks passed.
- Lint: no errors; 19 existing hook-dependency warnings.
- Secret scan: clean.
- Local browser attempts were blocked by sandbox Unix socket/GPU restrictions before application interaction. `scripts/ux-browser-smoke.mjs` and a disposable GitHub Actions browser job cover desktop/mobile login return URLs, themes, deep links, time save/refresh and history. Do not count this as passed until the actual job passes.

## Server setup before enabling activation

1. Deploy through the existing **staging** workflow after review and required checks. Migration 015 is additive. Confirm readiness reports the exact deployed SHA and `015_appearance_reservation_managers`.
2. Keep a dedicated protected `BACKUP_LOCAL_PATH` outside the repository/public tree; provide sufficient space for the uploaded archive, a safety dump and a retained database. Use matching PostgreSQL server, `pg_dump` and `pg_restore` major versions.
3. `RESTORE_TARGET_DATABASE_URL` must use a separate role with login and ownership of a dedicated empty candidate database. This role must have no SUPERUSER, CREATEDB, CREATEROLE or REPLICATION privileges. Never point the candidate URL at the active database.
4. Set `POSTGRES_ADMIN_URL` to a separate control database on the same server, with a dedicated server-only operator account that can create/rename the active and candidate databases and terminate their connections. Do not reuse this credential as the candidate role or expose it to browsers.
5. Initially leave `RESTORE_ALLOW_ACTIVATION=false`. Run both native recovery suites against disposable databases, then verify the UI on staging. Only then enable activation explicitly. Later successful restores automatically provision a new empty candidate on the next activation request if its configured name no longer exists.
6. The app must be the only writer or every other worker/service must also honor maintenance. Cutover blocks database connections and terminates sessions; do not run independent write jobs that can reconnect outside the application's maintenance policy. Review external connection pools and separate schedulers before enabling this feature.
7. After activation every user signs in again using credentials contained in the selected snapshot. Snapshots without an active admin are rejected. For lost credentials, use the existing explicit administrator recovery/bootstrap procedure on the retained database or an isolated candidate; do not assume the current password survives a historical restore.

## Failure/operator recovery

- Safety archives and metadata remain in protected backup storage, with immutable per-event restore-operation journals.
- Before cutover the active database is unchanged. A failed candidate is retained for investigation; use a new empty candidate database rather than deleting business data.
- After cutover failure, automatic rename rollback is verified before writes resume. The original database name again identifies the original data. A failed candidate remains separate.
- If the process crashes or returns `RESTORE_RECOVERY_REQUIRED`, keep maintenance in place. Inspect the operation journal's retained database name and the control database catalog. Connect through the control database, verify which database contains the original state, stop app/workers, and restore the verified original name/connection state. Recheck migrations, administrator access and integrity before clearing maintenance/restarting. Never drop the retained database or safety files during investigation.
- Static/uploaded asset files are outside the existing database-only export format. Archives contain their references, not an independent asset bundle. Preserve those files separately.

## Release status

No production merge or production restore was performed. Staging deployment and browser verification must be reported from actual CI/server evidence, not inferred from local builds.
