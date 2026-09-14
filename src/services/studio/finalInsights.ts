import { toBusinessGregorianDateString, toJalaliDate } from "@/lib/dateUtils";
import {
  getAtelierConfig,
  getPlanning,
  listContracts,
  listDailyVisits,
  listReservations,
} from "@/services/studio/finalWorkflow";

type ContractRecord = Awaited<ReturnType<typeof listContracts>>[number];

const numeric = (value: unknown) => Number(value || 0);
const dayKey = (value: Date | string | null | undefined) =>
  value ? toBusinessGregorianDateString(value) : "";

export async function getFinalDashboard(
  allowedCoreProjectIds: string[] | null,
  includeFinance: boolean,
) {
  const [contracts, visits] = await Promise.all([
    listContracts(undefined, allowedCoreProjectIds),
    listDailyVisits(),
  ]);
  const pending = contracts
    .filter((contract) => contract.status === "draft")
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const nowForSort = Date.now();
  const approved = contracts.filter((contract) => contract.status === "signed").sort((a, b) => {
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
  const finance = contracts.reduce(
    (result, contract) => ({
      total: result.total + numeric(contract.totalAmount),
      received: result.received + numeric(contract.paidAmount),
      remaining: result.remaining + numeric(contract.remainingAmount),
    }),
    { total: 0, received: 0, remaining: 0 },
  );
  const redact = (contract: ContractRecord) =>
    includeFinance
      ? contract
      : {
          ...contract,
          totalAmount: null,
          depositAmount: null,
          paidAmount: null,
          remainingAmount: null,
        };
  return {
    pendingContracts: pending.slice(0, 6).map(redact),
    approvedContracts: approved.slice(0, 6).map(redact),
    recentDailyVisits: visits
      .slice(0, 3)
      .map((visit) =>
        includeFinance
          ? visit
          : { ...visit, price: null, paidAmount: null, remainingAmount: null },
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
    };
    current.contractCount += 1;
    current.total += numeric(contract.totalAmount);
    current.remaining += numeric(contract.remainingAmount);
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
  return [...grouped.values()].map((customer) => includeFinance ? customer : { ...customer, total: null, remaining: null });
}

export async function getFinalCalendar(allowedCoreProjectIds: string[] | null) {
  const [contracts, config] = await Promise.all([
    listContracts("approved", allowedCoreProjectIds),
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
      contracts: items,
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
) {
  const [contracts, reservations, visits, planning, config] = await Promise.all([
    listContracts(undefined, allowedCoreProjectIds),
    listReservations(),
    listDailyVisits(),
    getPlanning(allowedCoreProjectIds),
    getAtelierConfig(),
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
        "قرارداد در انتظار قدیمی",
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
      if (numeric(contract.remainingAmount) > 0)
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
    if (numeric(reservation.remainingAmount) > 0)
      push(
        `reservation-due:${reservation.id}`,
        "normal",
        "مانده رزرو",
        `رزرو ${reservation.customerName} دارای مانده پرداخت است.`,
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
  const order = { critical: 0, warning: 1, normal: 2 } as const;
  return result
    .sort(
      (a, b) =>
        order[a.priority as keyof typeof order] -
        order[b.priority as keyof typeof order],
    )
    .slice(0, 100);
}
