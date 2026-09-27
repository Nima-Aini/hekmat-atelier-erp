# Dashboard date range and production-safety audit

Audit date: 2026-09-27. Baseline staging commit: `277df9d9ce814e1634776fd4a42223a676bf341e`.
Release scope: staging only (`codex/phase2-hardening`). No authorization to deploy `main` or production was inferred. The existing PR/check/merge workflow required the isolated `codex/dashboard-range-audit` branch.

## Architecture and audit coverage

Next.js App Router / React client views → authenticated route handlers → Atelier operational services → canonical invoice/payment/expense services → Drizzle / PostgreSQL. The schema has 11 ordered migrations; the current migration remains `011_atelier_finance_planning_polish`. The repository contains 148 API route files.

Reviewed the current shared BLACK shell, Dashboard, Financial, recent staging diffs, scripts/workflows, central date and amount utilities, schema/FKs, authentication/session/permission services, important collection/detail APIs, invoice/receipt/expense/obligation settlement services, forms and UI state handling. The existing automated suites cover customers/projects, personnel/equipment access, contracts/planning, installments, expenses/payments/invoices, permissions, session safety, migrations, reversals, deletion restrictions, backups and deployment safety. New regression tests cover real disposable database ranges/scopes, account atomicity, expense IDOR and reporting privacy.

This is a source review plus automated regression audit, not a claim that every possible role combination or every one of the 148 endpoints was manually penetration-tested. Browser mutation tests against business data are deliberately excluded.

## Dashboard date range

- UI: `src/components/atelier/DashboardRangeFilter.tsx`, `FinalDashboard.tsx`, `OverviewCharts.tsx`, `src/app/page.tsx`; reuses the existing `JalaliDatePicker`, `jalaali-js`, and BLACK design.
- Presets: امروز, این هفته, این ماه, ۳ ماه اخیر, ۶ ماه اخیر, سال جاری, بازه دلخواه. Week starts Saturday; month/year start at Jalali boundaries. Three/six months mean the current Jalali month plus the preceding two/five months, through today. Custom fields are شروع, پایان, اعمال بازه.
- API: existing `/api/atelier/dashboard?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&projectId=...`; no second financial ledger or competing reporting endpoint was introduced. Existing canonical Finance movements feed the shared range aggregator.
- API validates IDs, both date endpoints, civil calendar validity, reversed ranges, supported Jalali calendar and a maximum 3660-day range. Invalid typed custom dates cannot silently apply the previous valid date.
- Timezone: `Asia/Tehran` explicitly; DB instants remain Gregorian/UTC. Both selected days are inclusive. End is next Tehran midnight minus one millisecond, not host-local midnight. Historic DST comparisons shift civil calendar days, not fixed 24-hour assumptions.
- Comparison: preceding equal number of business calendar days. Zero previous receipts returns `null`, never a fabricated percentage, NaN or Infinity. UI does not invent percentage badges.
- Daily zero-filled chart buckets through 90 days; longer ranges use Jalali month buckets. Zero is an empty calendar bucket, not sample business data. Completed movements after the current instant and invalid/non-finite movements are excluded.
- Requests are cancelled when replaced/unmounted. Loading clears stale old-range data; errors have a retry action. Project filter and date filter are forwarded together.

| Dashboard value | Classification and date basis |
| --- | --- |
| دریافت بازه انتخابی / payment context / cash chart | Period: completed canonical payments by `paymentDate`; selected project's unassigned payments excluded |
| Customers of contracts / contract count / contract status distribution | Period: contracts registered by `createdAt`; includes completed/cancelled history |
| Recent contracts | Period: registration timestamp; filtered before latest five |
| Recent activities | Period: contract/visit/reservation registration and receipt payment timestamp; filtered before latest five |
| Active projects / pending contracts | Current state: signed / draft contracts, independent of range |
| Upcoming reservations / programs / workload | Current future schedule, independent of range; global reservations have no project ownership and are not attributed to a selected project |
| Account liquidity / receivables / payables | Current balances/obligations; not rewritten by selecting a past range |
| Quick actions / navigation | Not a reporting metric |

## Verified bugs and fixes

| Severity | Module | Cause / effect | Fix |
| --- | --- | --- | --- |
| P1 | accounts route | Clearing defaults and writing audit outside account creation/update could leave partial state on failure | Transaction + advisory serialization; audit in same transaction; account row lock for edits |
| P1 | accounts route | Direct balance edits raced canonical postings; accounts with adjustment history were not recognized as referenced | Lock account, reject direct edit of payment/adjustment history; archive financially referenced accounts; atomic archive/delete audit |
| P1 | expenses detail | View/edit/delete checked global permission but not actual project | Check actual and target project server-side; wrong-project direct calls return 403 |
| P1 | expenses detail | Draft checks, mutation and audit were separate; race with posting | `FOR UPDATE`, recheck under transaction, mutation and audit atomic; posted/paid records remain immutable |
| P1 | payments/invoices/expenses lists, access service | Unfiltered collections / per-project denies bypassed list queries and counts | Permission-specific allowed project IDs applied in SQL before sorting/pagination/counts |
| P1 | Dashboard / contract detail/list / calendar | Top-level redaction left item totals, discounts, project value and payment draft metadata visible | Shared nested financial redaction; per-project financial grants honored, including mixed-project dashboards |
| P1 | Atelier reports | Global financial/wage grant ignored project-specific denials | Independent report/finance/wage project scopes; prohibited profitability rows removed |
| P1 | legacy reports | Global reports could combine unrelated projects for an assigned-project actor; some report services do not support complete project scoping | Fail closed for scoped actors on unsupported global report types; supported reports require an authorized explicit project and financial permission |
| P2 | Dashboard/page/API | Selected project wasn't forwarded; range was absent | Real range/project request and scoped service; current-state metrics explicitly separated |
| P2 | finalWorkflow reporting | Interactive 300-row cap and draft/signed-only list silently truncated reporting history | Separate reporting mode includes all statuses, no cap; hydration batched instead of per-contract N+1 |
| P2 | dateUtils | Invalid Jalali input fell back to Gregorian; impossible Gregorian days normalized; last-month end was midnight | Strict civil validation, leap checks, end-of-day boundary; explicit Tehran conversion |
| P2 | Finance monthly summary | Host Gregorian month differed from visible Jalali month and chart | Shared Jalali month start; completed cash totals exclude future timestamps |
| P2 | Dashboard/global search | Older requests could overwrite newer results and stale data could survive a failed period load | Abort replaced requests and ignore aborted completions; retry/error/loading states maintained |
| P2 | custom Dashboard input | An invalid edit could leave an older valid parent date | Picker validity callback blocks applying invalid text while preserving typing |
| P3 | MoneyInput | Effect read stale display state / missing dependency warning | Functional state updater preserves user formatting without reset loops |
| P3 | API/audit diagnostics | PostgreSQL detail/raw audit failures could log sensitive values | Omit PG detail, avoid raw audit payload logging; retain correlation/constraint diagnostics |
| P3 | test harness | Unix shebang and Windows Bash path fixtures failed locally; invoice mock lacked new scoped-access helper | Explicit Windows test fixture executable/Bash overrides; normalized path; permission mock updated; no assertions suppressed |

## Security

Reviewed scrypt salted passwords, constant-time comparisons, signed sessions, 12-hour expiry/future timestamp rejection, disabled/offboarded users and session invalidation; database-backed login rate limiting; production secret requirement; write-origin checks and maintenance fail-closed proxy; server-side resource ownership and project grants. ORM parameters are used for query values; HTML text is React-escaped, and no new raw HTML sink/client secret was introduced. Direct API denial tests do not depend on hidden buttons.

Fixed verified scope/IDOR and nested financial response defects above. Existing shared accounts and truly unassigned/general finance records remain globally visible only to actors already granted the relevant global financial/list permission; accounts have no project owner. Changing that business policy would require a separate model/permission decision, not fictitious allocation of balances to projects.

Remaining review concerns: legacy customer profile endpoints return customer invoice/payment history under customer-view/ownership policy. A business decision is needed on whether customer-view should also grant that financial history or require separate invoice/payment permission. This is a P1 permission-policy concern, explicitly documented; no access was broadened. Nineteen pre-existing lint warnings remain in legacy maps/views; they warrant focused component-specific review, not blanket dependency changes that may cause fetch loops. This audit does not certify absence of all vulnerabilities.

## Financial integrity

Canonical receipt/expense/payment paths retain validated decimal amounts, request hashes/idempotency locks, invoice/expense/account row locks, SQL balance updates, overpayment/insufficient-funds rejection, payment allocations and audit records in transactions. Existing regression suites check duplicate submission, partial settlement, reversal, rollback and financial-reference deletion restrictions. New disposable tests prove account-default rollback after failed audit, direct-balance protection, valid unused-account creation/edit, expense project denial, and posted-expense immutability.

No alternative money ledger, historical settlement rewrite, recalculated stored balance, fake payment or production test transaction was added. Dashboard cash metrics use completed payment records, not lifetime invoice `paidAmount`. Recognition of expenses remains distinct from cash outflow. All fixture writes occur only in disposable test databases.

## Database and migration safety

Reviewed current relationships, financial allocation/source uniqueness, restrictive financial-history references, nullable links, transaction boundaries and migration inventory. No schema files or migrations changed. No production data repair/deletion, table reset/truncation/drop, column drop or historical financial mutation was performed. Existing backup/readiness/schema/integrity release gates remain enabled. A live historical-data integrity report cannot be inferred solely from passing disposable fixtures; staging readiness/integrity is verified separately during release.

## Responsive / UI review

Compact secondary header controls use wrapping, `min-w-0`, maximum-width constraints and a single-column custom date layout on narrow screens. Existing card/chart/table/sidebar/modal design and BLACK tokens are preserved. Only the authentication-loading navy canvas was changed to the existing `--app-bg` token. Chart/table scrolling remains contained. Modal dirty/backdrop policy was not changed.

Authenticated desktop/tablet/mobile browser results are recorded in the release handoff; they are not claimed here before they occur. The staging session expired during this audit and requires user sign-in. No business record mutation is performed in the browser verification.

## Validation

Baseline: TypeScript and build passed; lint 0 errors / 20 existing warnings. Windows baseline suite: 152 passed, three Unix fixture failures, one PostgreSQL-only recovery drill skipped.

Final local code gate: TypeScript passed; production build passed and `overview.css.build=verified`; lint 0 errors / 19 existing warnings; secret scan `secret.current=clean`; full suite **184 passed, 0 failed, 1 skipped (185 total), 23 passed test files + 1 skipped**. Local driver is disposable PGlite; the skipped native PostgreSQL recovery drill is mandatory in Linux CI, not waived.

Windows full-test setup uses the bundled Node runtime, existing Git Bash (`TEST_BASH_BIN`) and existing Git-for-Windows no-op executable (`TEST_PG_RESTORE_BIN`) plus its runtime in PATH. The no-op replaces only the two existing fake-archive metadata/checksum fixtures; it does not substitute for the real PostgreSQL recovery drill. No test assertion or error was disabled.

Release requires green Linux/PostgreSQL checks in UTC and Asia/Tehran, real PostgreSQL restore drill, final diff review, exact-SHA staging readiness and smoke/CSS verification. Final commit/merge/deployment evidence is supplied in the task handoff rather than guessed in this document.

## Git / changed files

Application changes are limited to Dashboard/range wiring, date/amount/UI state helpers, scoped finance/report/contract/calendar APIs, account/expense transaction safety, and safe audit diagnostics. New tests: `dashboard-range.test.ts`, `dashboard-range-api.test.ts`, `dashboard-audit-integration.test.ts`. Existing tests updated: `products.test.ts`, `deploy-safety.test.ts`, `backup-recovery.test.ts` for scoped mocks and portable fixtures. No `.env`, credentials, generated build output or database files are included.

Explicit confirmations: no production data deleted; no destructive database operation/migration introduced; no fake Dashboard/financial business values added; ranges use real backend records; canonical financial source-of-truth preserved; existing Dashboard/Financial composition and BLACK visual design not unnecessarily redesigned.
