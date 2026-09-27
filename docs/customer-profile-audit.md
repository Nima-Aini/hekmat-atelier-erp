# Dashboard cleanup and complete customer profile

## Scope and release boundary

Focused changes to Dashboard and Customers, based on staging `1446cc75e931b23b82b4513f521a61e9f412dabe`. No unrelated redesign. Release target is `codex/phase2-hardening` (staging), not `main`.

## 1. Files changed

- `src/app/page.tsx`: existing single-page navigation plus stable customer hash navigation.
- `src/components/atelier/FinalDashboard.tsx`: remove Dashboard-only project selector/state/query dependency.
- `src/components/atelier/ContractCustomersView.tsx`: View action, profile entry and reuse existing customer-edit modal.
- `src/components/atelier/CustomerProfileView.tsx`: responsive four-tab detail view.
- `src/lib/customerProfile.ts`: shared DTO and existing-code Persian labels.
- `src/app/api/atelier/customers/[id]/route.ts`: authenticated read-only profile endpoint.
- `src/services/studio/customerProfile.ts`: permission-scoped aggregate snapshot.
- `src/lib/atelierInstallment.ts`, `src/services/studio/installmentReadModel.ts`: shared existing installment state and posted canonical allocation eligibility.
- `src/services/studio/financeCenter.ts`: reuse these helpers; no parallel installment formula.
- `src/services/studio/finalInsights.ts`, `src/app/api/atelier/customers/route.ts`, `src/app/api/studio/customers/[id]/route.ts`: prevent customer list/legacy detail money from bypassing financial project scope.
- `tests/customer-profile.test.ts`: disposable-database integration and regression tests.
- This report.

## 2. Dashboard

The frontend no longer loads projects, renders a project selector, receives selectedProjectId, or sends projectId. Date selection and charts remain unchanged. Shared global project state, project APIs and other modules are preserved. Existing Dashboard API support for optional projectId remains backward-compatible; the Dashboard itself never supplies it. "Overall atelier" is still bounded by the authenticated user's permissions, not an authorization bypass.

## 3. Profile architecture

List View action opens `#customers/<studio-customer-id>`. Direct entry and reload read that hash; browser Back/Forward is supported. Back to Customers returns to the list without a full page reload. One no-store endpoint returns identity, projects, schedule, financial summary/documents and actual history. The service uses a read-only repeatable-read transaction with a bounded batch query count; there is no per-record database query loop. UI requests are abortable; different customer's stale data is not displayed. Existing edit, contract, item-planning and contract-finance flows are reused.

## 4. Stored customer fields

Name, code, mobile, secondary phone, email, store/company, city, region, postal code, address, stored coordinates, assigned employee, status, health score/status, base/studio notes and timestamps. Studio fields: customer type, groom/bride, contact role, anniversary, social media, referrer, VIP level, social consent and stored preferences. Credit limit and payment terms require finance access. Empty optional values are hidden. No invented national ID, birthday, gender or tags.

## 5. Planning sources

Approved contract items and their real personnel/time/notes, reserved equipment and rentals; project calendar and its assigned personnel; project tasks; production plans and steps; deliverables; explicitly customer-linked daily visits and their personnel snapshots; reservations. Legacy reservations without a customer FK may match the exact current mobile and are explicitly labelled; they never establish a financial relationship. Items are date-sorted and grouped as future/past/no-date with completion and follow-up warnings. Wage/cost snapshots are not returned as planning data. A parent production plan is shown even without child steps.

## 6. Work and reliable history

Existing studioProjects linked by studioCustomerId; existing contracts by studioProjectId, including archived/historical work. Project type titles come from stored dynamic project types. Contract dates, program and delivery commitments and permitted financial values are shown. Timeline uses only actual studioProjectTimelines records, never inferred/fabricated events. Metadata is stripped, financial actions are finance-gated, and free-text descriptions that can embed wages are hidden without finance access.

## 7. Financial sources

Canonical invoices, payments, paymentAllocations and accounts, existing studioContracts/studioInstallments, and posted installment allocations backed by completed canonical receipts. Cancelled/reversed invoices and cancelled payment documents remain visible as history but are excluded from active totals. Draft quotes do not become debt. Raw mirror payments are never counted as a second receipt. Payment allocations and unapplied amounts are explicit. The model has no dedicated customer-refund entity; no unsupported refund metric is invented.

## 8. Installments

Shared existing status calculation: paid when remaining is zero; partial when any valid payment exists; otherwise overdue / due-soon within seven days / pending using the Finance Center's existing ceil-days logic. An independent overdue warning also identifies partial-overdue installments. Payment eligibility requires a posted studio mirror plus a completed customer_receipt linked to the same customer and canonical invoice. Voided/pending mirrors cannot settle installments. Installments tied to inactive invoices are historical and excluded from remaining-installment totals.

## 9. Aggregation formulas

- Active invoice statuses: issued, corrected.
- Total / paid / remaining / discount = sums of canonical grandTotal / paidAmount / balanceDue / invoiceDiscount over unique visible active customer invoices.
- Received = sum of completed canonical customer_receipt documents once per payment ID, not once per allocation.
- Unapplied = receipt amount minus all its allocations, with existing direct-invoice fallback for legacy unallocated records; only completed receipts affect this metric.
- Remaining installments = sum of valid active installment remainders. This is a subset of debt and is NOT added to invoice balance.
- Overdue = invoice balance once when invoice due date has passed; otherwise min(invoice balance, overdue installment remainder). Never both.
- A cross-project receipt visible only via allowed allocations exposes only those allocations' sum, not its hidden reference, notes or total. Unapplied is not inferred from hidden scope.

## 10. Authorization / IDOR

UUID validation; authenticated customers.view/studio.view gate; actual customer ownership and active project assignments; explicit project permission false overrides role grants. Customer, contracts, planning/calendar and finance scope are independent. Finance always requires finance.view, never general studio.view. Customers owned entirely by inaccessible projects return 403; unknown IDs return 404; unauthenticated access returns 401. Customer-only actors receive no financial summary, credit/terms, contract money or planning records. Edit is allowed only when the existing manage permission covers every customer project. Response is private/no-store. No sensitive raw metadata is returned.

## 11. Responsive and states

Existing black/red Overview cards and Vazirmatn/RTL/Jalali/toman formatting. Desktop 4-column KPI layout; tablet wraps; mobile single-column data cards and locally scrollable tab strip, long content wraps. Loading, retry/error, not-found, denied and each empty section have explicit states. Existing profile remains visible during same-ID refresh with an update indicator.

## 12. Validation

Local: TypeScript and production build pass; compiled Overview CSS verified; lint passes with 19 pre-existing warnings in unrelated components; full suite 198 passed / 1 native PostgreSQL drill skipped on Windows; secret scan and diff whitespace check pass. Updated focused profile suite: 7 passed. CI must additionally execute the native PostgreSQL restore and timezone checks before staging merge. Live responsive/navigation and real-customer trace must be verified after the exact staging SHA is deployed; local tests alone do not prove live behavior.

Disposable integration trace uses real contract approval/installment/payment services: active totals 3,200; invoice-applied paid 350; debt 2,850; received 400; unapplied 50; installment remainder 700; overdue 300. Includes split legacy receipt, partial overdue installment, corrected and cancelled invoices, voided mirror, draft quote, personnel, equipment and production. Limited project-finance scope reduces totals to 1,200 / 350 / 850 and hides forbidden money/history. Fixture amounts exist only in an isolated test database.

## Safety confirmations

No production data deleted. No destructive migration or schema change. No mock customer or financial data added to live data. Customer financial truth comes from existing canonical records, not frontend lists. Project functionality outside Dashboard is preserved. Browser verification is read-only.
