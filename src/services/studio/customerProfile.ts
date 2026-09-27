import { and, asc, desc, eq, inArray, isNull, or, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts, customers, employeeProjectAssignments, employees, equipmentReservations, invoices, studioDailyVisitPersonnel,
  paymentAllocations, payments, rentalEquipment, studioCalendarEvents, studioContractItems, studioContracts,
  studioCustomers, studioDailyVisits, studioDeliverables, studioInstallments, studioPersonnel,
  studioPlanningPersonnel, studioProductionPlans, studioProductionSteps,
  studioProjects, studioProjectTimelines, studioProjectTypes, studioReservations, studioTasks, studioEquipment,
} from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/apiError";
import { atelierInstallmentState } from "@/lib/atelierInstallment";
import { getStartOfDayJalali } from "@/lib/dateUtils";
import type { EmployeeContext } from "@/services/access";
import { readPostedInstallmentAllocations } from "./installmentReadModel";

const n = (value: unknown) => Number(value || 0);
const oneOf = (column: AnyColumn, ids: string[]) => ids.length ? inArray(column, ids) : sql`false`;
const activeInvoice = (status: string) => status === "issued" || status === "corrected";
export type CustomerSchedule = {
  id: string; title: string; kind: string; date: Date | null; endDate: Date | null;
  status: string; completed: boolean; cancelled: boolean; overdue: boolean;
  projectTitle: string | null; location: string | null; notes: string | null;
  personnel: Array<{ name: string; start: Date | null; end: Date | null; notes: string | null }>;
  equipment: string[]; target: { section: "planning" | "contracts"; id: string } | null;
};

/** One read-only repeatable snapshot. Query count is bounded, not proportional to projects/items. */
export async function getAtelierCustomerProfile(actor: EmployeeContext, id: string) {
  assertUuid(id);
  if (!actor.permissions.has("*") && !actor.permissions.has("studio.customers.view") && !actor.permissions.has("studio.view")) {
    throw new ApiError(403, "دسترسی به پرونده مشتری مجاز نیست.", "PERMISSION_REQUIRED");
  }
  return db.transaction(async tx => {
    const [identity] = await tx.select({ customer: customers, studio: studioCustomers, employeeName: employees.name })
      .from(studioCustomers).innerJoin(customers, eq(customers.id, studioCustomers.customerId))
      .leftJoin(employees, eq(employees.id, customers.assignedEmployeeId)).where(eq(studioCustomers.id, id)).limit(1);
    if (!identity) throw new ApiError(404, "مشتری یافت نشد.");
    const rawProjects = await tx.select().from(studioProjects).where(eq(studioProjects.studioCustomerId, id)).orderBy(desc(studioProjects.eventDate));
    const coreIds = rawProjects.flatMap(p => p.projectId ? [p.projectId] : []);
    const assignments = actor.permissions.has("*") ? [] : await tx.select({ projectId: employeeProjectAssignments.projectId, permissionSet: employeeProjectAssignments.permissionSet })
      .from(employeeProjectAssignments).where(and(eq(employeeProjectAssignments.employeeId, actor.employeeId), eq(employeeProjectAssignments.status, "active"), oneOf(employeeProjectAssignments.projectId, coreIds)));
    const grants = new Map(assignments.map(a => [a.projectId, (a.permissionSet || {}) as Record<string, unknown>]));
    const globalAllows = (...codes: string[]) => actor.permissions.has("*") || codes.some(code => actor.permissions.has(code));
    const allows = (coreId: string | null, ...codes: string[]) => {
      if (actor.permissions.has("*")) return true;
      if (!coreId) return false; // Legacy projects without an owner remain admin-only.
      const grant = grants.get(coreId);
      return Boolean(grant && codes.some(code => grant[code] !== false && (grant[code] === true || actor.permissions.has(code))));
    };
    const visibleProjects = rawProjects.filter(p => allows(p.projectId, "studio.customers.view", "studio.view"));
    if (rawProjects.length && !visibleProjects.length) throw new ApiError(403, "دسترسی به مشتری خارج از محدوده پروژه مجاز نیست.", "PROJECT_SCOPE_FORBIDDEN");
    const scope = (...codes: string[]) => visibleProjects.filter(p => allows(p.projectId, ...codes)).map(p => p.id);
    const contractProjectIds = scope("studio.contract.view", "studio.view");
    const planningProjectIds = scope("studio.planning.view", "studio.planning.manage", "studio.view");
    const calendarProjectIds = scope("studio.calendar.view", "studio.view");
    const financialProjects = visibleProjects.filter(p => allows(p.projectId, "studio.finance.view"));
    const financeCoreIds = financialProjects.flatMap(p => p.projectId ? [p.projectId] : []);
    const financeUnassigned = globalAllows("studio.finance.view");
    const financeVisible = financeCoreIds.length > 0 || financeUnassigned;
    const financialScope = (column: AnyColumn) => actor.permissions.has("*") ? sql`true` : or(oneOf(column, financeCoreIds), financeUnassigned ? isNull(column) : sql`false`)!;
    const financialCoreVisible = (coreId: string | null) => actor.permissions.has("*") || (coreId ? financeCoreIds.includes(coreId) : financeUnassigned);
    const projectMap = new Map(visibleProjects.map(p => [p.id, p]));
    const [contractRows, invoiceRows, itemRows, events, tasks, steps, visits, reservations, history, deliverables, productionPlans] = await Promise.all([
      tx.select({ contract: studioContracts, typeTitle: studioProjectTypes.title }).from(studioContracts)
        .leftJoin(studioProjectTypes, eq(studioProjectTypes.id, studioContracts.projectTypeId))
        .where(oneOf(studioContracts.studioProjectId, [...new Set([...contractProjectIds, ...planningProjectIds, ...financialProjects.map(p => p.id)])])).orderBy(desc(studioContracts.contractDate)),
      tx.select().from(invoices).where(and(eq(invoices.customerId, identity.customer.id), financialScope(invoices.projectId))).orderBy(desc(invoices.invoiceDate)),
      tx.select({ item: studioContractItems, contract: studioContracts }).from(studioContractItems)
        .innerJoin(studioContracts, eq(studioContracts.id, studioContractItems.contractId))
        .where(and(oneOf(studioContracts.studioProjectId, planningProjectIds), inArray(studioContracts.status, ["signed", "in_progress", "completed"]))).orderBy(asc(studioContractItems.position)),
      tx.select().from(studioCalendarEvents).where(oneOf(studioCalendarEvents.studioProjectId, calendarProjectIds)).orderBy(asc(studioCalendarEvents.startTime)),
      tx.select({ task: studioTasks, personnelName: studioPersonnel.fullName }).from(studioTasks)
        .leftJoin(studioPersonnel, eq(studioPersonnel.id, studioTasks.assignedPersonnelId)).where(oneOf(studioTasks.studioProjectId, planningProjectIds)),
      tx.select({ step: studioProductionSteps, projectId: studioProductionPlans.studioProjectId, personnelName: studioPersonnel.fullName }).from(studioProductionSteps)
        .innerJoin(studioProductionPlans, eq(studioProductionPlans.id, studioProductionSteps.planId))
        .leftJoin(studioPersonnel, eq(studioPersonnel.id, studioProductionSteps.assignedPersonnelId)).where(oneOf(studioProductionPlans.studioProjectId, planningProjectIds)),
      globalAllows("studio.daily_visits.view", "studio.view") ? tx.select().from(studioDailyVisits).where(eq(studioDailyVisits.customerId, identity.customer.id)).orderBy(desc(studioDailyVisits.visitDate)) : [],
      // Older reservation records lack a customer FK. Exact current phone matches are labelled, never used as financial truth.
      globalAllows("studio.reservations.view", "studio.view") ? tx.select().from(studioReservations)
        .where(or(eq(studioReservations.customerId, identity.customer.id), and(isNull(studioReservations.customerId), eq(studioReservations.mobile, identity.customer.mobile)))).orderBy(asc(studioReservations.reservedAt)) : [],
      tx.select().from(studioProjectTimelines).where(oneOf(studioProjectTimelines.studioProjectId, visibleProjects.map(p => p.id))).orderBy(desc(studioProjectTimelines.createdAt)),
      tx.select().from(studioDeliverables).where(oneOf(studioDeliverables.studioProjectId, planningProjectIds)),
      tx.select().from(studioProductionPlans).where(oneOf(studioProductionPlans.studioProjectId, planningProjectIds)),
    ]);
    const itemIds = itemRows.map(r => r.item.id);
    const financialContractRows = contractRows.filter(r => financialProjects.some(p => p.id === r.contract.studioProjectId));
    const financialContractIds = financialContractRows.map(r => r.contract.id);
    const [people, equipment, rentals, calendarPeople, installmentRows, allocationRows, receiptRows] = await Promise.all([
      tx.select({ assignment: studioPlanningPersonnel, name: studioPersonnel.fullName }).from(studioPlanningPersonnel)
        .innerJoin(studioPersonnel, eq(studioPersonnel.id, studioPlanningPersonnel.personnelId)).where(oneOf(studioPlanningPersonnel.contractItemId, itemIds)),
      tx.select({ assignment: equipmentReservations, title: studioEquipment.title }).from(equipmentReservations)
        .innerJoin(studioEquipment, eq(studioEquipment.id, equipmentReservations.equipmentId)).where(oneOf(equipmentReservations.contractItemId, itemIds)),
      tx.select({ id: rentalEquipment.id, contractItemId: rentalEquipment.contractItemId, title: rentalEquipment.itemTitle, pickup: rentalEquipment.pickupDate, returned: rentalEquipment.returnDate, status: rentalEquipment.status })
        .from(rentalEquipment).where(oneOf(rentalEquipment.contractItemId, itemIds)),
      events.length ? tx.select({ id: studioPersonnel.id, name: studioPersonnel.fullName }).from(studioPersonnel).where(oneOf(studioPersonnel.id, events.flatMap(e => Array.isArray(e.assignedPersonnelIds) ? e.assignedPersonnelIds.filter((v): v is string => typeof v === "string") : []))) : [],
      tx.select().from(studioInstallments).where(oneOf(studioInstallments.contractId, financialContractIds)).orderBy(asc(studioInstallments.dueDate)),
      tx.select({ allocation: paymentAllocations }).from(paymentAllocations).where(oneOf(paymentAllocations.invoiceId, invoiceRows.map(i => i.id))),
      // One canonical receipt per id, even when allocated across several invoices.
      tx.select({ payment: payments, accountName: accounts.name }).from(payments).innerJoin(accounts, eq(accounts.id, payments.accountId))
        .where(and(or(eq(payments.customerId, identity.customer.id), and(isNull(payments.customerId), or(oneOf(payments.invoiceId, invoiceRows.map(i => i.id)), inArray(payments.id, tx.select({ id: paymentAllocations.paymentId }).from(paymentAllocations).where(oneOf(paymentAllocations.invoiceId, invoiceRows.map(i => i.id))))))), or(financialScope(payments.projectId), inArray(payments.id, tx.select({ id: paymentAllocations.paymentId }).from(paymentAllocations).where(oneOf(paymentAllocations.invoiceId, invoiceRows.map(i => i.id)))))))
        .orderBy(desc(payments.paymentDate)),
    ]);
    const receiptIds = receiptRows.map(r => r.payment.id);
    const [allReceiptAllocations, installmentPayments, dailyPeople] = await Promise.all([
      tx.select().from(paymentAllocations).where(oneOf(paymentAllocations.paymentId, receiptIds)),
      readPostedInstallmentAllocations(tx, installmentRows.map(i => i.id)),
      tx.select({ visitId: studioDailyVisitPersonnel.dailyVisitId, name: studioDailyVisitPersonnel.personnelNameSnapshot, work: studioDailyVisitPersonnel.workTitle })
        .from(studioDailyVisitPersonnel).where(and(oneOf(studioDailyVisitPersonnel.dailyVisitId, visits.map(v => v.id)), eq(studioDailyVisitPersonnel.status, "active"))),
    ]);
    const invoiceMap = new Map(invoiceRows.map(i => [i.id, i]));
    const contractMap = new Map(contractRows.map(r => [r.contract.id, r.contract]));
    const contractsByInvoice = new Map(financialContractRows.flatMap(r => r.contract.invoiceId ? [[r.contract.invoiceId, r.contract] as const] : []));
    const now = new Date();
    const installments = installmentRows.map(i => {
      const contract = contractMap.get(i.contractId)!;
      const linked = installmentPayments.filter(r => r.allocation.installmentId === i.id);
      const state = atelierInstallmentState(n(i.amount), linked.reduce((sum, r) => sum + n(r.allocation.amount), 0), i.dueDate, now);
      return { id: i.id, title: i.title, amount: n(i.amount), dueDate: i.dueDate, ...state, contractId: contract.id, contractNumber: contract.contractNumber,
        projectTitle: projectMap.get(contract.studioProjectId)?.title || "", active: Boolean(contract.invoiceId && activeInvoice(invoiceMap.get(contract.invoiceId)?.status || "")),
        payments: linked.map(r => ({ paymentId: r.payment.id, number: r.payment.paymentNumber, amount: n(r.allocation.amount), date: r.payment.paymentDate })) };
    });
    const receipts = receiptRows.flatMap(({ payment, accountName }) => {
      const visibleAllocations = allocationRows.filter(r => r.allocation.paymentId === payment.id).map(({ allocation: a }) => ({ invoiceId: a.invoiceId, invoiceNumber: invoiceMap.get(a.invoiceId)?.invoiceNumber || "", amount: n(a.allocatedAmount), contractId: contractsByInvoice.get(a.invoiceId)?.id || null }));
      const full = financialCoreVisible(payment.projectId);
      const amount = full ? n(payment.amount) : visibleAllocations.reduce((sum, a) => sum + a.amount, 0);
      if (!full && amount === 0) return [];
      const allocated = allReceiptAllocations.filter(a => a.paymentId === payment.id).reduce((sum, a) => sum + n(a.allocatedAmount), 0);
      const directInvoice = payment.invoiceId ? invoiceMap.get(payment.invoiceId) : null;
      return [{ id: payment.id, number: payment.paymentNumber, date: payment.paymentDate, amount, accountName, method: payment.paymentMethod,
        reference: full ? payment.referenceNumber : null, notes: full ? payment.notes : null, status: payment.status, type: payment.paymentType, scopeLimited: !full,
        unappliedAmount: full ? Math.max(0, n(payment.amount) - (allocated || (payment.invoiceId ? n(payment.amount) : 0))) : 0,
        allocations: visibleAllocations, directInvoiceNumber: directInvoice?.invoiceNumber || null,
        installments: installments.flatMap(i => i.payments.filter(p => p.paymentId === payment.id).map(p => ({ id: i.id, title: i.title, amount: p.amount }))) }];
    });
    const activeInvoices = invoiceRows.filter(i => activeInvoice(i.status));
    const sumInvoices = (field: "grandTotal" | "paidAmount" | "balanceDue" | "invoiceDiscount") => activeInvoices.reduce((sum, i) => sum + n(i[field]), 0);
    const remainingInstallments = installments.filter(i => i.active).reduce((sum, i) => sum + i.remainingAmount, 0);
    const overdue = activeInvoices.reduce((sum, i) => {
      const contract = contractsByInvoice.get(i.id);
      const installmentDebt = installments.filter(row => row.active && row.contractId === contract?.id && row.isOverdue).reduce((s, row) => s + row.remainingAmount, 0);
      return sum + (i.dueDate && i.dueDate < getStartOfDayJalali() ? n(i.balanceDue) : Math.min(n(i.balanceDue), installmentDebt));
    }, 0);
    const schedule: CustomerSchedule[] = [];
    const add = (entry: Omit<CustomerSchedule, "overdue">, warnPast = true) => schedule.push({ ...entry, overdue: Boolean(warnPast && entry.date && entry.date < now && !entry.completed && !entry.cancelled) });
    for (const { item, contract } of itemRows) {
      const assigned = people.filter(p => p.assignment.contractItemId === item.id);
      const gear = equipment.filter(e => e.assignment.contractItemId === item.id);
      const rented = rentals.filter(r => r.contractItemId === item.id);
      const dates = [...assigned.map(a => a.assignment.startsAt), ...gear.map(a => a.assignment.reservedFrom), ...rented.map(r => r.pickup)].sort((a, b) => +a - +b);
      add({ id: `item:${item.id}`, title: item.title, kind: "خدمت قرارداد", date: dates[0] || contract.programDate, endDate: contract.programEndDate,
        status: contract.status, completed: contract.status === "completed", cancelled: false, projectTitle: projectMap.get(contract.studioProjectId)?.title || null,
        location: contract.executionLocation, notes: [item.description, item.notes].filter(Boolean).join("\n") || null,
        personnel: assigned.map(a => ({ name: a.name, start: a.assignment.startsAt, end: a.assignment.endsAt, notes: a.assignment.notes })),
        equipment: [...gear.map(e => `${e.title} · ${e.assignment.status}`), ...rented.map(r => `${r.title} · رنتال`)], target: { section: "planning", id: item.id } });
    }
    for (const event of events) add({ id: `calendar:${event.id}`, title: event.title, kind: "تقویم", date: event.startTime, endDate: event.endTime,
      status: event.status, completed: event.status === "completed", cancelled: event.status === "cancelled", projectTitle: event.studioProjectId ? projectMap.get(event.studioProjectId)?.title || null : null,
      location: event.location, notes: event.notes, personnel: calendarPeople.filter(p => Array.isArray(event.assignedPersonnelIds) && event.assignedPersonnelIds.includes(p.id)).map(p => ({ name: p.name, start: event.startTime, end: event.endTime, notes: null })), equipment: [], target: null });
    for (const { task, personnelName } of tasks) add({ id: `task:${task.id}`, title: task.title, kind: "کار", date: task.dueDate, endDate: null, status: task.status,
      completed: task.status === "done", cancelled: task.status === "cancelled", projectTitle: projectMap.get(task.studioProjectId)?.title || null,
      location: null, notes: [task.description, task.blocker].filter(Boolean).join("\n") || null, personnel: personnelName ? [{ name: personnelName, start: null, end: null, notes: null }] : [], equipment: [], target: null });
    for (const { step, projectId, personnelName } of steps) add({ id: `step:${step.id}`, title: step.stepName, kind: "مرحله تولید", date: step.deadline, endDate: null,
      status: step.status, completed: ["completed", "approved"].includes(step.status), cancelled: false, projectTitle: projectMap.get(projectId)?.title || null,
      location: null, notes: step.feedbackNotes, personnel: personnelName ? [{ name: personnelName, start: null, end: null, notes: null }] : [], equipment: [], target: null });
    for (const plan of productionPlans) add({ id: `production:${plan.id}`, title: "برنامه تولید و تحویل", kind: "برنامه تولید", date: plan.targetDeliveryDate, endDate: null,
      status: plan.currentStage, completed: plan.currentStage === "delivered", cancelled: false, projectTitle: projectMap.get(plan.studioProjectId)?.title || null,
      location: null, notes: plan.notes, personnel: [], equipment: [], target: null });
    for (const delivery of deliverables) add({ id: `delivery:${delivery.id}`, title: delivery.title, kind: "تحویل", date: delivery.dueDate, endDate: delivery.deliveredAt,
      status: delivery.status, completed: Boolean(delivery.deliveredAt || delivery.confirmedAt || delivery.status === "delivered"), cancelled: delivery.status === "cancelled",
      projectTitle: projectMap.get(delivery.studioProjectId)?.title || null, location: delivery.storageLocation, notes: delivery.notes, personnel: [], equipment: [], target: null });
    for (const visit of visits) add({ id: `visit:${visit.id}`, title: visit.title, kind: "مراجعه روزانه", date: visit.visitDate, endDate: null, status: visit.status,
      completed: false, cancelled: visit.status === "cancelled", projectTitle: null, location: null, notes: visit.notes,
      personnel: dailyPeople.filter(p => p.visitId === visit.id).map(p => ({ name: `${p.name} · ${p.work}`, start: null, end: null, notes: null })), equipment: [], target: null }, false);
    for (const reservation of reservations) add({ id: `reservation:${reservation.id}`, title: reservation.title, kind: reservation.customerId ? "رزرو" : "رزرو با شماره تماس مشتری", date: reservation.reservedAt, endDate: null,
      status: reservation.status, completed: reservation.status === "completed", cancelled: reservation.status === "cancelled", projectTitle: null, location: null,
      notes: reservation.notes, personnel: [], equipment: [], target: null });
    schedule.sort((a, b) => (a.date ? +a.date : Infinity) - (b.date ? +b.date : Infinity));
    const canEdit = rawProjects.length ? rawProjects.every(p => allows(p.projectId, "studio.projects.manage")) : globalAllows("studio.projects.manage");
    return {
      customer: { ...identity.customer, creditLimit: financeVisible ? identity.customer.creditLimit : null, paymentTermsDays: financeVisible ? identity.customer.paymentTermsDays : null,
        assignedEmployeeName: identity.employeeName, studio: identity.studio },
      access: { canEdit, finance: financeVisible, planning: planningProjectIds.length > 0 || calendarProjectIds.length > 0 || globalAllows("studio.planning.view", "studio.calendar.view", "studio.view"), contracts: contractProjectIds.length > 0 },
      summary: { projects: visibleProjects.length, upcoming: schedule.filter(s => s.date && s.date >= now && !s.completed && !s.cancelled).length },
      projects: visibleProjects.map(p => ({ id: p.id, number: p.projectNumber, title: p.title, date: p.eventDate, status: p.status, location: p.mainLocation, archived: Boolean(p.archivedAt),
        contracts: contractRows.filter(r => r.contract.studioProjectId === p.id && contractProjectIds.includes(p.id)).map(({ contract: c, typeTitle }) => {
          const inv = c.invoiceId ? invoiceMap.get(c.invoiceId) : null;
          return { id: c.id, number: c.contractNumber, date: c.contractDate, programDate: c.programDate, deliveryDate: c.deliveryCommitmentDate, status: c.status, typeTitle,
            amount: financialCoreVisible(p.projectId) ? n(inv?.grandTotal ?? c.totalAmount) : null, paid: inv ? n(inv.paidAmount) : null, remaining: inv ? n(inv.balanceDue) : null };
        }) })),
      schedule,
      financial: financeVisible ? { summary: { total: sumInvoices("grandTotal"), paid: sumInvoices("paidAmount"), remaining: sumInvoices("balanceDue"), discount: sumInvoices("invoiceDiscount"), remainingInstallments, overdue,
        received: receipts.filter(r => r.status === "completed" && r.type === "customer_receipt").reduce((s, r) => s + r.amount, 0),
        unapplied: receipts.filter(r => r.status === "completed" && r.type === "customer_receipt").reduce((s, r) => s + r.unappliedAmount, 0) },
        invoices: invoiceRows.map(i => ({ id: i.id, number: i.invoiceNumber, date: i.invoiceDate, dueDate: i.dueDate, amount: n(i.grandTotal), discount: n(i.invoiceDiscount), paid: n(i.paidAmount), remaining: n(i.balanceDue), status: i.status,
          paymentStatus: i.paymentStatus, settlementDate: i.settlementDate, contractId: contractsByInvoice.get(i.id)?.id || null, projectTitle: financialProjects.find(p => p.projectId === i.projectId)?.title || (i.projectId ? "پروژه مرتبط" : "بدون پروژه"), active: activeInvoice(i.status) })),
        installments, receipts } : null,
      // Raw timeline metadata can include hidden money/personnel fields. Never return it.
      history: history.filter(h => {
        const coreId = projectMap.get(h.studioProjectId)?.projectId || null;
        if (/PAYMENT|EXPENSE|SALARY|INSTALLMENT|FINANC/.test(h.actionType)) return allows(coreId, "studio.finance.view");
        if (/PERSONNEL|EQUIPMENT|TASK|STAGE/.test(h.actionType)) return allows(coreId, "studio.planning.view", "studio.view");
        if (/CONTRACT/.test(h.actionType)) return allows(coreId, "studio.contract.view", "studio.view");
        return allows(coreId, "studio.finance.view") && allows(coreId, "studio.planning.view", "studio.view") && allows(coreId, "studio.contract.view", "studio.view");
      }).map(h => ({ id: h.id, title: h.title,
        // Existing personnel/planning descriptions can embed wages even when metadata is stripped.
        description: allows(projectMap.get(h.studioProjectId)?.projectId || null, "studio.finance.view") ? h.description : null,
        author: h.authorName, date: h.createdAt, projectTitle: projectMap.get(h.studioProjectId)?.title || "" })),
      generatedAt: now,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
