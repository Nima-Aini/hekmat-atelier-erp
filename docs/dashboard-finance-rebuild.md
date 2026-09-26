# Dashboard and Finance overview

The approved image references define composition and styling only. All widgets use live API responses. There is no demonstration-data fallback.

## KPI sources

| Widget | Authoritative source and definition |
| --- | --- |
| Active projects | Scoped `listContracts`: signed contracts currently available to Planning. This is a workflow count, not a financial amount. |
| Upcoming reservations | `listReservations`: pending reservations from now through the next 30 days. |
| Pending contracts | Scoped `listContracts`: draft contracts, counted before pagination. |
| Contract customers | Distinct studio customer IDs in scoped contracts. Not the total CRM directory. |
| Current month receipts | Completed canonical `payments`, `paymentType=customer_receipt`, grouped into the current Jalali month in Asia/Tehran. |
| Current month payments | Completed canonical non-receipt payments in the same Jalali month. Posted expense documents are not added again. |
| Net cashflow | Current Jalali month's receipts minus payments; distinct from accrual profit. |
| Liquidity | Sum of balances of active `accounts`, provided by Finance Center. |
| Receivables | Existing Finance Center `summary.receivable` from invoice balances and daily visits. Installments are not added on top of invoice debt. |
| Personnel/rental debt | Existing Finance Center expense-source links and unpaid expense balances. These are subsets of total payable, not extra liabilities. |
| Total payable | Existing Finance Center unpaid posted expense balances. |

## Analytics and history

`buildOverviewAnalytics` adds read-only `analytics` to the existing finance response. It zero-fills the real 12-month/30-day reporting calendar and aggregates each completed canonical payment once. Future-dated payments do not count as actuals before their payment date. Legacy summary and cashflow fields remain unchanged for compatibility. The new overview explicitly uses Jalali current-month analytics rather than the legacy Gregorian-month summary fields.

Dashboard status distribution counts actual contract statuses. Account distribution uses actual positive balances for slice geometry; the center shows authoritative net liquidity. If negative balances exist, the chart explains this distinction and lists their values.

Recent transactions merge canonical receipts and payments, without adding duplicate expense rows. The financial ledger supports query, account, type and Jalali date filters. Expenses additionally support category and project filters. Scoped contract finance metadata includes studio/core project identifiers to reuse the existing project expense service. Dashboard recent activity is derived from contract, reservation, daily-visit creation times and completed receipts; it is not a fabricated activity feed or audit-log reconstruction.

Finance data remains redacted on the dashboard without financial permission. Existing API authorization, project scoping, idempotency and mutation validation remain in force. Account cards reuse `/api/accounts` CRUD, default and archival rules; editing account metadata never changes balances. Adjustments use the existing audited adjustment route. Project expenses use the existing scoped project expense service.

## Compatibility and limitations

No schema migration, financial write-service change or new dependency is required. The legacy `FinancialView.tsx` is inactive in the current application and remains untouched. Existing installment, receipt, payroll, rental, account adjustment and contract-finance modals remain connected to their existing routes. Posted expense edits/deletes remain prohibited by the server; this rebuild does not bypass those guards. There is no existing inter-account transfer API or reversal-document UI, so neither is represented by a nonfunctional button.

Desktop uses aligned KPI cards and a roughly 2:1 analytics grid. Tablet uses two KPI columns and stacked secondary content; mobile uses one KPI column, full-width charts, scrollable tabs and contained table scrolling. Shared surfaces are scoped to Dashboard and Finance to avoid restyling unrelated views.

## Changed surfaces

- `FinalDashboard.tsx`, `AtelierFinanceView.tsx`, `FinanceOverview.tsx`, `FinanceAccounts.tsx`: page composition and preserved workflows.
- `OverviewUi.tsx`, `OverviewCharts.tsx`, `globals.css`: shared design and existing Recharts integration.
- `AppLayout.tsx`, `page.tsx`: scoped shell integration and actual user/permissions.
- `financeCenter.ts`, `finalInsights.ts`, `overviewAnalytics.ts`: additive read-only reporting; existing write services and API contracts remain compatible.
- `overview-analytics.test.ts`, `final-atelier-workflow.test.ts`: reporting calendar, canonical totals and financial redaction coverage.

## Verification

Browser QA uses an isolated local PGlite database through the actual application APIs, not mocked frontend responses. Both pages were inspected at 1536px desktop, 820px tablet and 390px mobile. Document width stays within viewport; tables and tabs scroll internally. Chart period switching, account editing, receipt/expense form fields, expense filters, empty results, mobile sidebar navigation and backdrop non-dismissal were checked. No browser errors were observed. Form inspection does not constitute a real-money transaction; financial mutation behavior is covered by integration tests.

Typecheck and lint pass (20 pre-existing warnings in unrelated files). The production build passes. Windows cannot execute the existing Unix fake PostgreSQL tools and deployment shell fixtures; Linux PostgreSQL CI remains the release gate for those platform-specific tests. No production database was accessed or modified during local QA. No migration, destructive data change, demonstration UI fallback or new dependency is included.
