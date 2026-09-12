# Hekmat Atelier product architecture

Baseline: `ba0d193a2535924d5c71d83df0c089e344e4bae5`, branch `codex/phase2-hardening`.
Implementation is isolated on `codex/atelier-productization`. This document describes the target; completion requires the acceptance story, tests, CI and staging evidence, not this document alone.

## Current product and audit

`AppLayout.tsx` and `app/page.tsx` expose 24 mixed navigation entries and statically import manufacturing, sales and Studio views. The default dashboard calls manufacturing/product/sales reports. The employee dashboard is a separate wholesale visitor application. Global search returns raw materials and BOM products, but misses Studio tasks, equipment and personnel. AI receives generic ERP context and has visually dominant navigation. Tax and notes are standalone operational entries.

`StudioCRMView.tsx` combines pipeline, customer management, projects, calendar, execution, contracts, payments, expenses, timeline and print forms in 3,778 lines. It fetches eight collections regardless of the current activity. Equipment (1,216 lines) and personnel (1,457 lines) already expose substantial functionality, including scheduling and wages. Generic employees additionally mix identity/access administration with field-sales compensation. Suppliers are coupled to raw material purchasing.

Studio APIs already implement canonical invoice/payment/expense links, scoped project authorization, transaction-bound audit, concurrent resource reservations and wage settlement. Project GET computes financial summaries from issued invoices, completed receipts and posted expenses, and redacts financial fields by permission. Client GET filters associated projects by authorization. These protections are part of the product, not replaceable scaffolding.

Existing `studio_tasks`, `studio_notifications`, `studio_production_plans`, `studio_production_steps` and `studio_calendar_events` are underexposed. Project creation currently installs the same six production steps for every job. Pipeline leads currently require an existing customer and project/event date, so inquiries are prematurely represented as jobs. Package is free text; there is no reusable priced catalog, immutable package snapshot or dated installment schedule. Links exist on production plans/steps but do not describe individual deliverables or customer acceptance. Reports and alerts mostly concern wholesale/manufacturing. Responsive shell and Vazirmatn/Jalali utilities are reusable; several large modal forms use native date inputs and browser alerts.

## Keep / merge / retire matrix

| Current entry | Decision | Atelier destination / retained dependency |
|---|---|---|
| Generic dashboard | Replace | Studio command center, actionable queues |
| Customers + Studio customers | Merge visible identity | Client profile; canonical `customers` identity and `studio_customers.customer_id` |
| Generic projects + Studio projects | Merge visible identity | Atelier jobs; unique `studio_projects.project_id` financial scope |
| Employees / visitors + personnel | Merge operational UI | Team; employee remains login/access identity, linked by `employee_id` |
| Products / BOM | Retire primary UX | Services, packages and add-ons; retain products/invoice item history |
| Manufacturing batches | Retire primary UX | Workflow and post-production; retain financial references |
| Raw materials / inventory | Retire primary UX | Owned equipment, reservations, checkout and rentals |
| Wholesale orders | Retire primary UX | Lead → booking → project; retain historical orders |
| Suppliers / purchases | Reframe | Partners, rentals and external project costs; preserve suppliers/payables |
| Invoices / payments / expenses | Keep canonical backend | Contract and project finance, financial center |
| Notes | Contextualize | Client notes and project timeline |
| Tax | Reframe | Financial preparation subpage; no official filing claim |
| Reports / alerts | Replace primary UX | Atelier reports and operational notifications |
| Accounts, audit, backup, settings, authentication | Keep | Financial or secondary system tools |
| AI | Secondary | Read-only, scoped atelier analysis; all direct mutation proposals are rejected |

No historical table is dropped, truncated or repurposed as a new financial ledger. Legacy APIs remain compatibility boundaries; normal navigation never initiates a manufacturing flow.

## Target domains and user journey

Inquiry is an independent CRM record with owner, source, service, desired date, budget, follow-up and lost reason. Conversion locks the inquiry and contact identity, reuses a client and creates exactly one linked job in one transaction. A project selects a catalog package and optional add-ons. Contract pricing is captured as an immutable snapshot; only the existing invoice service posts revenue. Installments describe due dates and allocation of the existing canonical collections, not a second payment ledger.

A service or package selects a workflow template. Instantiation snapshots stages into existing project plans, steps and tasks; later template edits cannot mutate active jobs. Portrait jobs need no video or album stage. Tasks carry assignee, deadline, priority, dependency and blocker. Workflow progression checks dependencies and records timeline/audit events. Deliverables track backup, selection, gallery, video and print links/status/acceptance; binary photo hosting is outside this task.

Project 360 is the operational hub: overview, client, package/contract, schedule, crew, equipment, workflow, deliverables, finance and timeline. Client 360 aggregates only authorized projects and financially permitted information. Team operational identity stays in Studio personnel; access identity stays in employees. Equipment continues using existing reservation locks and canonical rental expenses.

## Information architecture

Primary: داشبورد · سرنخ‌ها و CRM · پروژه‌ها · تقویم و برنامه · کارها و گردش‌کار · مشتریان · خدمات و پکیج‌ها · تیم و عوامل · تجهیزات · مالی · همکاران و تأمین‌کنندگان · گزارش‌ها · اعلانات.

Secondary: تنظیمات · حسابرسی · پشتیبان‌گیری · دستیار. Tax preparation is within finance. One responsive shell serves all authenticated roles; backend permission checks remain authoritative. Global search prioritizes clients, jobs, contracts/invoices, crew, equipment and tasks. Dates are Jalali in display; APIs retain canonical timestamps and business timezone utilities.

## Data and migration strategy

Reuse every existing Studio domain table before extending it. Add only missing catalog, inquiry, workflow-template, installment and deliverable concepts; extend existing task/plan/project metadata additively. New migrations are versioned, transactional and idempotent. Existing customer and project links are reused without guessing historical duplicates. Ambiguous historical identities remain reviewable rather than silently merged. New contact creation serializes on normalized mobile to avoid introducing duplicates.

Permissions retain existing specific contract, finance, wage and profitability gates. New domains map explicitly from corresponding existing permissions, with admin `*` unchanged. A global view permission must never erase project membership restrictions. Reports aggregate canonical accounting on the server and respect the same scopes and financial permissions.

## Verification and rollout

Phases: A identity/navigation and extraction; B domain mappings; C project workflow/tasks/calendar; D inquiries/catalog/contract snapshots; E personnel/equipment/vendors/delivery/notifications; F dashboard/reports; G search/permissions/responsive cleanup.

Each coherent phase is committed on the product branch after relevant checks. Full UTC/Tehran, authorization, concurrency, migration, accounting reconciliation, native PostgreSQL recovery, typecheck, lint, build and secret scan gates remain blocking. PR verification must include PRs targeting the staging branch. Integration to staging only follows a green reviewed exact SHA; automatic deployment retains isolated PM2, PostgreSQL 16, verified pre-migration backup, migration failure abort, rollback preservation and exact-SHA readiness. No automatic database restore or database switching. No production rollout.

## Implemented product state

Migration `006_atelier_product` additively introduces the missing inquiry, catalog, workflow-template, installment-allocation and deliverable models. It extends projects, plans, tasks, calendar events, personnel and partners without removing historical tables. The migration updates the product name only when the stored value is one of the known legacy defaults; a customized business name is never overwritten.

The authenticated product now opens in one responsive Studio-first shell. The primary routes are command center, lead pipeline, jobs, calendar, workboard, clients, services/packages, team, equipment, finance, partners, reports and notifications. Manufacturing, raw-material, wholesale-order and visitor-sales views remain source-compatible but have no active primary route or navigation import. Employee login and Studio personnel are joined through the optional unique `employee_id`; customers and projects retain their canonical accounting links.

The implemented journey is inquiry → consultation → package → transactional conversion → project → contract/invoice → dated installments → canonical receipt allocation → configurable workflow → crew/equipment/rental → tasks/deliverables → delivery/archive. Package and workflow snapshots protect historical jobs from later catalog/template edits. Project 360 surfaces overview, client, schedule, workflow, tasks, deliverables, crew, equipment, contract, payments, expenses, profitability and timeline. Portrait and commercial projects instantiate different workflows instead of inheriting wedding-only stages.

Operational reports are calculated server-side from issued invoices, completed customer receipts and posted expenses. They cover CRM source/conversion/lost reason, project delay/turnaround/stage, monthly cashflow, project profitability, personnel task/wage activity, equipment utilization/damage and catalog performance. The AI assistant consumes only the same scoped dashboard/report context and has no mutation service or execution UI.

Intentionally deferred: proprietary binary photo hosting, a full external SMS provider and production rollout. Deliverables use safe external/storage links with explicit readiness, delivery and customer-confirmation state. Notification delivery remains explicit and never claims an SMS was sent without a provider.
