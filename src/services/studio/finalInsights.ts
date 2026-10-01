import { toBusinessGregorianDateString, toJalaliDate } from "@/lib/dateUtils";
import { db } from "@/db";
import { studioNotifications, studioNotificationReads } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ApiError, assertUuid } from "@/lib/apiError";
import type { EmployeeContext } from "@/services/access";
import { canAccessPermission } from "@/services/access";
import { logAuditEvent } from "@/services/audit";
import {
  getAtelierConfig,
  getPlanning,
  listContracts,
  listDailyVisits,
  listReservations,
} from "@/services/studio/finalWorkflow";
import { getAtelierFinanceCenter } from "@/services/studio/financeCenter";
import { buildRangeAnalytics } from "./overviewAnalytics";
import { inDashboardRange, type DashboardRange } from "@/lib/dashboardRange";
import { redactContractFinance } from "./financialPrivacy";
import { equipmentMaintenanceAlerts } from "./equipmentCalendar";
import { notificationCategory } from "@/lib/atelierNotifications";

type ContractRecord = Awaited<ReturnType<typeof listContracts>>[number];

const numeric = (value: unknown) => Number(value || 0);
const dayKey = (value: Date | string | null | undefined) =>
  value ? toBusinessGregorianDateString(value) : "";

export async function getFinalDashboard(
  allowedCoreProjectIds: string[] | null,
  includeFinance: boolean,
  options: { range?: DashboardRange; projectId?: string; financeProjectIds?: string[] | null; actor?: EmployeeContext } = {},
) {
  const [allContracts, visits, reservations, center] = await Promise.all([
    listContracts(undefined, allowedCoreProjectIds, true),
    listDailyVisits({ createdFrom: options.range?.start, createdTo: options.range?.end, projectId: options.projectId, allowedCoreProjectIds }),
    options.projectId ? Promise.resolve([]) : listReservations(true, options.actor),
    includeFinance ? getAtelierFinanceCenter(options.projectId ? [options.projectId] : options.financeProjectIds === undefined ? allowedCoreProjectIds : options.financeProjectIds, !options.projectId) : Promise.resolve(null),
  ]);
  const currentContracts = options.projectId ? allContracts.filter((row) => row.project.projectId === options.projectId) : allContracts;
  const contracts = options.range ? currentContracts.filter((row) => inDashboardRange(row.createdAt, options.range!)) : currentContracts;
  const availableProjects = [...new Map(allContracts.filter((row) => row.project.projectId).map((row) => [row.project.projectId!, { id: row.project.projectId!, name: row.project.title }])).values()];
  const rangeAnalytics = center && options.range ? buildRangeAnalytics(center.receipts, center.payments, options.range) : null;
  const pending = currentContracts
    .filter((contract) => contract.status === "draft")
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const nowForSort = Date.now();
  const approved = currentContracts.filter((contract) => contract.status === "signed").sort((a, b) => {
    const aTime = a.programDate ? +new Date(a.programDate) : Number.MAX_SAFE_INTEGER;
    const bTime = b.programDate ? +new Date(b.programDate) : Number.MAX_SAFE_INTEGER;
    const aFuture = aTime >= nowForSort;
    const bFuture = bTime >= nowForSort;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return aFuture ? aTime - bTime : bTime - aTime;
  });
  const projectTypes = new Map<string, number>();
  for (const contract of approved)
    projectTypes.set(
      contract.projectType.title,
      (projectTypes.get(contract.projectType.title) || 0) + 1,
    );
  const monthFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "short",
  });
  const trend = new Map<string, number>();
  for (const contract of contracts) {
    const key = monthFormatter.format(new Date(contract.createdAt));
    trend.set(key, (trend.get(key) || 0) + 1);
  }
  const workload = new Map<string, number>();
  const now = Date.now(),
    horizon = now + 30 * 86400000;
  for (const contract of approved) {
    const timestamp = contract.programDate
      ? +new Date(contract.programDate)
      : 0;
    if (timestamp >= now - 86400000 && timestamp <= horizon) {
      const key = dayKey(contract.programDate);
      workload.set(key, (workload.get(key) || 0) + 1);
    }
  }
  const canReadContractFinance = (contract: ContractRecord) => includeFinance && (options.financeProjectIds == null || !contract.project.projectId || options.financeProjectIds.includes(contract.project.projectId));
  const finance = contracts.filter(canReadContractFinance).reduce(
    (result, contract) => ({
      total: result.total + numeric(contract.totalAmount),
      received: result.received + numeric(contract.paidAmount),
      remaining: result.remaining + numeric(contract.remainingAmount),
    }),
    { total: 0, received: 0, remaining: 0 },
  );
  const redact = (contract: ContractRecord) =>
    canReadContractFinance(contract)
      ? contract
      : redactContractFinance(contract);
  const upcoming = approved.filter((row) => row.programDate && +new Date(row.programDate) >= now && +new Date(row.programDate) <= horizon);
  const upcomingReservations = reservations.filter((row) => row.status === "pending" && +new Date(row.reservedAt) >= now && +new Date(row.reservedAt) <= horizon);
  const statusLabels: Record<string, string> = { draft: "در انتظار تأیید", signed: "تأیید شده", completed: "تکمیل شده", cancelled: "لغو شده" };
  const statuses = [...new Set(contracts.map((row) => row.status))].map((status) => ({ id: status, name: statusLabels[status] || status, value: contracts.filter((row) => row.status === status).length }));
  const activities = [
    ...contracts.map((row) => ({ id: `contract:${row.id}`, title: "قرارداد ثبت شد", detail: `${row.customer.name} · ${row.projectType.title}`, date: row.createdAt, tab: "contracts", tone: "blue" })),
    ...visits.map((row) => ({ id: `visit:${row.id}`, title: "مراجعه روزانه ثبت شد", detail: `${row.customerName} · ${row.title}`, date: row.createdAt, tab: "daily_visits", tone: "purple" })),
    ...reservations.map((row) => ({ id: `reservation:${row.id}`, title: "رزرو ثبت شد", detail: `${row.customerName} · ${row.title}`, date: row.createdAt, tab: "reservations", tone: "amber" })),
    ...(center?.receipts || []).map((row) => ({ id: `receipt:${row.id}`, title: "دریافت ثبت شد", detail: `${row.source?.title || "دریافت مشتری"} · ${row.accountName}`, date: row.paymentDate, tab: "finance", tone: "green" })),
  ].filter((row) => !options.range || inDashboardRange(row.date, options.range)).sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5);
  return {
    overview: {
      generatedAt: new Date(),
      range: options.range || null,
      availableProjects,
      activeProjects: approved.length,
      pendingContracts: pending.length,
      upcomingReservations: upcomingReservations.length,
      upcomingPrograms: upcoming.length,
      customerCount: new Set(contracts.map((row) => row.customer.studioCustomerId)).size,
      contractCount: contracts.length,
      statuses,
      activities,
      upcoming: upcoming.slice(0, 5).map(redact),
      recentContracts: [...contracts].sort((a,b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5).map(redact),
      finance: center ? { summary: center.summary, analytics: center.analytics, rangeAnalytics } : null,
    },
    pendingContracts: pending.slice(0, 6).map(redact),
    approvedContracts: approved.slice(0, 6).map(redact),
    recentDailyVisits: visits
      .slice(0, 3)
      .map((visit) =>
        includeFinance && (options.financeProjectIds == null || !visit.coreProjectId || options.financeProjectIds.includes(visit.coreProjectId))
          ? visit
          : { ...visit, price: null, paidAmount: null, remainingAmount: null, personnelCost: null, preliminaryProfit: null, paymentHistory: [], personnelAssignments: visit.personnelAssignments.map((assignment) => ({ ...assignment, wageSnapshot: null })) },
      ),
    charts: {
      projectTypes: [...projectTypes].map(([name, value]) => ({ name, value })),
      contractTrend: [...trend]
        .slice(-6)
        .map(([name, value]) => ({ name, value })),
      finance: includeFinance
        ? [
            { name: "دریافتی", value: finance.received },
            { name: "مانده", value: finance.remaining },
          ]
        : [],
      workload: [...workload]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 14)
        .map(([date, value]) => ({
          date,
          label: toJalaliDate(new Date(`${date}T12:00:00+03:30`), {
            format: "short",
          }),
          value,
        })),
    },
    finance: includeFinance ? finance : null,
  };
}

export async function listContractCustomers(
  allowedCoreProjectIds: string[] | null,
  includeFinance = true,
  financeProjectIds: string[] | null = null,
  editableProjectIds?: string[] | null,
) {
  const contracts = await listContracts(undefined, allowedCoreProjectIds);
  const grouped = new Map<
    string,
    {
      id: string;
      customerId: string;
      name: string;
      mobile: string;
      contractCount: number;
      lastContract: Date | null;
      nextProgram: Date | null;
      total: number;
      remaining: number;
      hasFinance: boolean;
      canEdit: boolean;
    }
  >();
  const now = Date.now();
  for (const contract of contracts) {
    const current = grouped.get(contract.customer.studioCustomerId) || {
      id: contract.customer.studioCustomerId,
      customerId: contract.customer.id,
      name: contract.customer.name,
      mobile: contract.customer.mobile,
      contractCount: 0,
      lastContract: null,
      nextProgram: null,
      total: 0,
      remaining: 0,
      hasFinance: false,
      canEdit: false,
    };
    current.contractCount += 1;
    if (editableProjectIds !== undefined && (editableProjectIds === null || (contract.project.projectId && editableProjectIds.includes(contract.project.projectId)))) current.canEdit = true;
    if (includeFinance && (financeProjectIds === null || (contract.project.projectId && financeProjectIds.includes(contract.project.projectId)))) {
      current.total += numeric(contract.totalAmount);
      current.remaining += numeric(contract.remainingAmount);
      current.hasFinance = true;
    }
    const contractDate = new Date(contract.contractDate);
    if (!current.lastContract || contractDate > current.lastContract)
      current.lastContract = contractDate;
    if (contract.programDate) {
      const programDate = new Date(contract.programDate);
      if (
        +programDate >= now &&
        (!current.nextProgram || programDate < current.nextProgram)
      )
        current.nextProgram = programDate;
    }
    grouped.set(current.id, current);
  }
  return [...grouped.values()].map(({ hasFinance, ...customer }) => hasFinance ? customer : { ...customer, total: null, remaining: null });
}

export async function getFinalCalendar(allowedCoreProjectIds: string[] | null, financeIds?: string[] | null) {
  const [contracts, config] = await Promise.all([
    listContracts("approved", allowedCoreProjectIds, true),
    getAtelierConfig(),
  ]);
  const days = new Map<string, ContractRecord[]>();
  for (const contract of contracts) {
    const key = dayKey(contract.programDate);
    if (key) days.set(key, [...(days.get(key) || []), contract]);
  }
  const calendar = (config.calendar || {}) as Record<string, unknown>;
  return {
    days: [...days].map(([date, items]) => ({
      date,
      count: items.length,
      contracts: items.map(contract => financeIds == null || (contract.project.projectId && financeIds.includes(contract.project.projectId)) ? contract : redactContractFinance(contract)),
    })),
    thresholds: {
      light: Number(calendar.light || 1),
      medium: Number(calendar.medium || 2),
      heavy: Number(calendar.heavy || 3),
    },
  };
}

export async function getFinalNotifications(
  allowedCoreProjectIds: string[] | null,
  includeArchived = false,
  actor?: EmployeeContext,
) {
  const permits = (permission: string) => !actor || actor.permissions.has("*") || actor.permissions.has(permission);
  const permissionScope = async (permission: string) => {
    if (!actor || actor.permissions.has("*")) return allowedCoreProjectIds;
    const decisions = await Promise.all((allowedCoreProjectIds || []).map(async id => await canAccessPermission(actor, permission, id) ? id : null));
    return decisions.filter((id): id is string => id !== null);
  };
  const [contractScope, planningScope, financeScope, equipmentScope] = await Promise.all([permissionScope("studio.contract.view"), permissionScope("studio.planning.view"), permissionScope("studio.finance.view"), permissionScope("studio.equipment.view")]);
  const [contracts, reservations, visits, planning, config, finance] = await Promise.all([
    permits("studio.contract.view") ? listContracts(undefined, contractScope, true) : [],
    permits("studio.reservations.view") ? listReservations(true, actor) : [],
    permits("studio.finance.view") ? listDailyVisits({ allowedCoreProjectIds: financeScope }) : [],
    permits("studio.planning.view") ? getPlanning(planningScope) : { contracts: [] },
    getAtelierConfig(),
    permits("studio.finance.view") ? getAtelierFinanceCenter(financeScope) : { installments: [] },
  ]);
  const now = Date.now();
  const reminder = (config.notifications || {}) as Record<string, unknown>;
  const reservationDays = Math.max(1, Number(reminder.reservationDays || 2));
  const contractDays = Math.max(1, Number(reminder.contractDays || 7));
  const rentalDays = Math.max(1, Number(reminder.rentalDays || 5));
  const result: Array<Record<string, unknown>> = [];
  const push = (
    id: string,
    priority: "critical" | "warning" | "normal",
    title: string,
    message: string,
    tab: string,
    entityId: string,
    date?: Date | string | null,
  ) =>
    result.push({
      id,
      priority,
      severity: priority === "normal" ? "info" : priority,
      category: notificationCategory(id),
      entityType: tab,
      title,
      message,
      tab,
      entityId,
      date: date || null,
    });
  for (const contract of contracts) {
    const age = (now - +new Date(contract.createdAt)) / 86400000;
    if (contract.status === "draft" && age >= 3)
      push(
        `pending:${contract.id}`,
        "warning",
        "پیش‌قرارداد قدیمی",
        `قرارداد ${contract.contractNumber} برای ${contract.customer.name} هنوز تأیید نشده است.`,
        "contracts",
        contract.id,
        contract.createdAt,
      );
    if (contract.status === "signed" && contract.programDate) {
      const days = (+new Date(contract.programDate) - now) / 86400000;
      if (days >= 0 && days <= contractDays)
        push(
          `contract:${contract.id}`,
          days <= 1 ? "critical" : "warning",
          "اجرای قرارداد نزدیک است",
          `${contract.projectType.title} ${contract.customer.name} در ${toJalaliDate(contract.programDate)} اجرا می‌شود.`,
          "planning",
          contract.id,
          contract.programDate,
        );
      if (permits("studio.finance.view") && (financeScope === null || Boolean(contract.project.projectId && financeScope.includes(contract.project.projectId))) && numeric(contract.remainingAmount) > 0)
        push(
          `contract-due:${contract.id}`,
          "normal",
          "مانده قرارداد",
          `قرارداد ${contract.customer.name} دارای مانده پرداخت است.`,
          "contracts",
          contract.id,
          contract.programDate,
        );
    }
  }
  for (const reservation of reservations) {
    if (reservation.status !== "pending") continue;
    const days = (+new Date(reservation.reservedAt) - now) / 86400000;
    if (days >= -0.5 && days <= reservationDays)
      push(
        `reservation:${reservation.id}`,
        days <= 1 ? "critical" : "warning",
        days < 0.5 ? "رزرو امروز" : days < 1.5 ? "رزرو فردا" : "رزرو نزدیک است",
        `${reservation.title} برای ${reservation.customerName} نزدیک است.`,
        "reservations",
        reservation.id,
        reservation.reservedAt,
      );
  }
  for (const visit of visits) {
    const age = (now - +new Date(visit.visitDate)) / 86400000;
    if (numeric(visit.remainingAmount) > 0 && age <= 30)
      push(
        `visit-due:${visit.id}`,
        "normal",
        "مانده مراجعه روزانه",
        `مراجعه ${visit.customerName} دارای مانده پرداخت است.`,
        "daily_visits",
        visit.id,
        visit.visitDate,
      );
  }
  for (const contract of planning.contracts)
    for (const item of contract.items) {
      if (!item.personnelAssignments.length)
        push(
          `person:${item.id}`,
          "warning",
          "پرسنل تخصیص داده نشده",
          `برای «${item.title}» در قرارداد ${contract.customer.name} پرسنل تعیین نشده است.`,
          "planning",
          item.id,
          contract.programDate,
        );
      if (!item.equipmentAssignments.length && !item.rentalRequirements.length)
        push(
          `equipment:${item.id}`,
          "warning",
          "تجهیزات تخصیص داده نشده",
          `برای «${item.title}» تجهیزات تعیین نشده است.`,
          "planning",
          item.id,
          contract.programDate,
        );
      for (const rental of item.rentalRequirements) {
        const days = (+new Date(rental.pickupDate) - now) / 86400000;
        if (rental.status === "planned" && days <= rentalDays && days >= -1)
          push(
            `rental:${rental.id}`,
            "critical",
            "تجهیزات اجاره‌ای ضروری",
            `باید ${rental.itemTitle} را برای ${toJalaliDate(rental.pickupDate)} اجاره بگیرید.`,
            "planning",
            rental.id,
            rental.pickupDate,
          );
      }
    }
  for (const installment of finance.installments) {
    if (installment.remainingAmount <= 0) continue;
    const days = installment.daysToDue;
    if (days > 7) continue;
    const timing = days < 0 ? "سررسید گذشته" : days === 0 ? "امروز سررسید دارد" : `${days.toLocaleString("fa-IR")} روز تا سررسید`;
    push(
      `installment-due:${installment.id}`,
      days <= 0 ? "critical" : "warning",
      days < 0 ? "قسط سررسید گذشته" : days === 0 ? "سررسید قسط امروز" : "سررسید قسط نزدیک است",
      `قسط «${installment.title}» قرارداد ${installment.customerName || installment.contractNumber} ${timing}؛ مانده ${Number(installment.remainingAmount).toLocaleString("fa-IR")} تومان.`,
      "finance",
      installment.id,
      installment.dueDate,
    );
  }
  if (permits("studio.equipment.view")) result.push(...await equipmentMaintenanceAlerts(equipmentScope));
  const order = { critical: 0, warning: 1, normal: 2 } as const;
  const sorted = result
    .sort(
      (a, b) =>
        order[a.priority as keyof typeof order] -
        order[b.priority as keyof typeof order],
    );
  const existing = await db.select().from(studioNotifications).orderBy(desc(studioNotifications.createdAt));
  const currentKeys = new Set(sorted.map((item) => String(item.id)));
  for (const row of existing.filter((item) => allowedCoreProjectIds === null && (!actor || actor.permissions.has("*")) && item.notificationType === "operational_alert" && item.conditionKey && !item.resolvedAt && !currentKeys.has(item.conditionKey))) {
    await db.update(studioNotifications).set({ resolvedAt: new Date(), updatedAt: new Date() }).where(eq(studioNotifications.id, row.id));
  }
  const active: Array<Record<string, unknown>> = [];
  for (const item of sorted) {
    const conditionKey = String(item.id);
    const rows = existing.filter((row) => row.conditionKey === conditionKey);
    const open = rows.find((row) => !row.archivedAt && !row.resolvedAt);
    const archivedCurrent = rows.find((row) => row.archivedAt && !row.resolvedAt);
    if (archivedCurrent && !open) continue;
    let record = open;
    if (!record) {
      const [created] = await db.insert(studioNotifications).values({
        conditionKey,
        recipientType: "management",
        recipientName: "مدیریت آتلیه",
        recipientMobile: "system",
        notificationType: "operational_alert",
        messageText: String(item.message),
        scheduledFor: item.date ? new Date(String(item.date)) : new Date(),
        status: "pending",
        payload: item,
      }).onConflictDoNothing().returning();
      record = created || (await db.select().from(studioNotifications).where(eq(studioNotifications.conditionKey, conditionKey)).orderBy(desc(studioNotifications.createdAt)).limit(1))[0];
    }
    if (record) active.push({ ...item, severity: item.priority === "normal" ? "info" : item.priority, id: record.id, conditionKey, archivedAt: record.archivedAt, createdAt: record.createdAt, resolvedAt: record.resolvedAt });
  }
  const visibleEntityIds = new Set([...contracts.map(row => row.id), ...reservations.map(row => row.id), ...visits.map(row => row.id), ...finance.installments.map(row => row.id), ...planning.contracts.flatMap(row => row.items.flatMap(item => [item.id, ...item.rentalRequirements.map(rental => rental.id)])), ...result.map(item => String(item.entityId))]);
  const security = existing.filter(row => row.notificationType === "security_alert" && (!actor || actor.permissions.has("*") || actor.permissions.has("admin.settings")) && !row.resolvedAt && Boolean(row.archivedAt) === includeArchived);
  const financeEntities = new Set([...visits.map(row => row.id), ...finance.installments.map(row => row.id), ...contracts.filter(row => financeScope === null || Boolean(row.project.projectId && financeScope.includes(row.project.projectId))).map(row => row.id)]);
  const selected: Array<Record<string, unknown>> = includeArchived ? existing.filter(row => row.notificationType === "operational_alert" && row.archivedAt && visibleEntityIds.has(String((row.payload as Record<string, unknown>)?.entityId)) && (notificationCategory(row.conditionKey || "") !== "finance" || (permits("studio.finance.view") && financeEntities.has(String((row.payload as Record<string, unknown>)?.entityId))))).map((row) => ({
    ...((row.payload || {}) as Record<string, unknown>),
    id: row.id,
    conditionKey: row.conditionKey,
    message: row.messageText,
    date: row.scheduledFor,
    archivedAt: row.archivedAt,
    archivedById: row.archivedById,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    category: (row.payload as Record<string, unknown>)?.category || notificationCategory(row.conditionKey || ""),
  })) : active;
  selected.push(...security.map(row => ({ ...((row.payload || {}) as Record<string, unknown>), id: row.id, conditionKey: row.conditionKey, message: row.messageText, date: row.scheduledFor, createdAt: row.createdAt, archivedAt: row.archivedAt, resolvedAt: row.resolvedAt })));
  const reads = actor ? await db.select().from(studioNotificationReads).where(eq(studioNotificationReads.employeeId, actor.employeeId)) : [];
  return selected.map((row): Record<string, unknown> => ({ ...row, readAt: reads.find(read => read.notificationId === row.id)?.readAt || null }));
}

export async function setNotificationRead(actor: EmployeeContext, id: string) {
  assertUuid(id);
  await db.insert(studioNotificationReads).values({ notificationId: id, employeeId: actor.employeeId }).onConflictDoNothing();
}

export async function setNotificationArchived(actor: EmployeeContext, id: string, archived: boolean) {
  assertUuid(id);
  const [current] = await db.select().from(studioNotifications).where(eq(studioNotifications.id, id)).limit(1);
  if (!current) throw new ApiError(404, "اعلان یافت نشد.");
  const [row] = await db.update(studioNotifications).set({ archivedAt: archived ? new Date() : null, archivedById: archived ? actor.employeeId : null, updatedAt: new Date() }).where(eq(studioNotifications.id, id)).returning();
  await logAuditEvent(archived ? "ATELIER_NOTIFICATION_ARCHIVED" : "ATELIER_NOTIFICATION_RESTORED", "studio_notification", id, { conditionKey: current.conditionKey }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName });
  return row;
}
