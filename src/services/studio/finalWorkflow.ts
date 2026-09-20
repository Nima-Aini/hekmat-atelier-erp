import crypto from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  atelierExpenseSources,
  customers,
  employeeProjectAssignments,
  equipmentReservations,
  invoiceItems,
  invoices,
  expenses,
  payments,
  personnelSalaryRecords,
  rentalEquipment,
  studioEquipment,
  studioCalendarEvents,
  studioContractItems,
  studioContracts,
  studioCustomers,
  studioDailyVisits,
  studioDailyVisitPersonnel,
  studioDailyVisitTitles,
  studioPersonnel,
  studioPlanningPersonnel,
  studioProjectTypes,
  studioProjects,
  studioReservations,
  systemSettings,
} from "@/db/schema";
import { ApiError, assertUuid, decimal } from "@/lib/apiError";
import { toLatinDigits } from "@/lib/dateUtils";
import { canAccessPermission, type EmployeeContext } from "@/services/access";
import { logAuditEvent } from "@/services/audit";
import { createInvoice } from "@/services/invoice";
import { postCanonicalExpense, postCanonicalReceipt } from "@/services/financial";
import type { Transaction } from "@/services/product";
import { getNextSequenceCode } from "@/services/sequence";
import { createStudioCustomer } from "@/services/studio/customerService";
import {
  createStudioProject,
  logProjectTimeline,
} from "@/services/studio/projectService";
import {
  assertEquipmentScheduleAvailable,
  lockScheduleResources,
} from "@/services/studio/scheduling";

export const CONTRACT_PENDING = "draft";
export const CONTRACT_APPROVED = "signed";

async function recognizePlanningObligation(
  tx: Transaction,
  actor: EmployeeContext,
  input: { sourceType: "personnel_wage" | "rental"; sourceId: string; projectId: string | null; title: string; category: string; amount: number; dueDate: Date | null },
) {
  const [link] = await tx.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, input.sourceType), eq(atelierExpenseSources.sourceId, input.sourceId))).limit(1);
  if (!link) return postCanonicalExpense(tx, {
    requestKey: `atelier-planning-obligation:${input.sourceType}:${input.sourceId}`,
    requestHash: requestHash({ sourceType: input.sourceType, sourceId: input.sourceId, projectId: input.projectId, amount: input.amount }),
    projectId: input.projectId, title: input.title, category: input.category, amount: input.amount,
    expenseDate: new Date(), dueDate: input.dueDate, paid: false, sourceType: input.sourceType, sourceId: input.sourceId,
  }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName });
  const [expense] = await tx.select().from(expenses).where(eq(expenses.id, link.expenseId)).for("update").limit(1);
  if (!expense) throw new ApiError(409, "سند هزینه مرتبط یافت نشد.");
  if (Number(expense.paidAmount) > 0 && Number(expense.amount) !== input.amount) throw new ApiError(409, "مبلغ تعهدی که پرداخت دارد قابل تغییر نیست.");
  const [updated] = await tx.update(expenses).set({ title: input.title, amount: input.amount.toFixed(2), dueDate: input.dueDate }).where(eq(expenses.id, expense.id)).returning();
  return { expense: updated, payment: null };
}

type ContractItemInput = {
  id?: string;
  title?: unknown;
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  notes?: unknown;
};
type ContractInput = {
  idempotencyKey?: unknown;
  projectTypeId?: unknown;
  customerName?: unknown;
  mobile?: unknown;
  contractDate?: unknown;
  programDate?: unknown;
  programEndDate?: unknown;
  executionLocation?: unknown;
  typeMetadata?: unknown;
  notes?: unknown;
  termsAndConditions?: unknown;
  items?: unknown;
  paidAmount?: unknown;
  discountAmount?: unknown;
  paymentAccountId?: unknown;
  paymentMethod?: unknown;
};

const cleanText = (
  value: unknown,
  label: string,
  required = false,
  max = 4000,
) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new ApiError(400, `${label} الزامی است.`);
  if (text.length > max)
    throw new ApiError(400, `${label} بیش از حد طولانی است.`);
  return text || null;
};
const cleanPhone = (value: unknown) => {
  const phone = toLatinDigits(String(value || "")).replace(/[\s()+-]/g, "");
  const normalized = phone.startsWith("98") ? `0${phone.slice(2)}` : phone;
  if (!/^09\d{9}$/.test(normalized))
    throw new ApiError(400, "شماره تماس معتبر نیست؛ نمونه: 09121234567");
  return normalized;
};
const validDate = (value: unknown, label: string, fallback?: Date) => {
  const date = value ? new Date(String(value)) : fallback;
  if (!date || Number.isNaN(date.getTime()))
    throw new ApiError(400, `${label} معتبر نیست.`);
  return date;
};
const money = (value: unknown, label: string) =>
  Number(decimal(value ?? 0, label, 2));
const requestHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function parseItems(
  value: unknown,
): Array<{
  title: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  position: number;
}> {
  if (!Array.isArray(value) || !value.length)
    throw new ApiError(400, "حداقل یک آیتم قرارداد الزامی است.");
  if (value.length > 50)
    throw new ApiError(400, "حداکثر ۵۰ آیتم برای هر قرارداد مجاز است.");
  return value.map((raw: ContractItemInput, position) => {
    const title = cleanText(raw?.title, "عنوان آیتم", true, 160)!;
    const quantity = Number(raw?.quantity ?? 1);
    const unitPrice = money(raw?.unitPrice, "قیمت آیتم");
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000)
      throw new ApiError(400, "تعداد آیتم معتبر نیست.");
    return {
      title,
      description: cleanText(raw?.description, "توضیحات آیتم"),
      quantity,
      unitPrice,
      notes: cleanText(raw?.notes, "یادداشت آیتم"),
      position,
    };
  });
}

export async function listProjectTypes(includeInactive = false) {
  return db
    .select()
    .from(studioProjectTypes)
    .where(includeInactive ? undefined : eq(studioProjectTypes.active, true))
    .orderBy(asc(studioProjectTypes.sortOrder), asc(studioProjectTypes.title));
}

export async function listDailyVisitTitles(includeInactive = false) {
  return db.select().from(studioDailyVisitTitles).where(includeInactive ? undefined : eq(studioDailyVisitTitles.active, true)).orderBy(asc(studioDailyVisitTitles.sortOrder), asc(studioDailyVisitTitles.title));
}

export async function saveDailyVisitTitle(actor: EmployeeContext, value: Record<string, unknown>, id?: string) {
  const title = cleanText(value.title, "عنوان مراجعه", true, 120)!;
  return db.transaction(async (tx) => {
    const values = { title, active: value.active !== false, sortOrder: Number(value.sortOrder || 0), updatedAt: new Date() };
    const [row] = id ? (assertUuid(id), await tx.update(studioDailyVisitTitles).set(values).where(eq(studioDailyVisitTitles.id, id)).returning()) : await tx.insert(studioDailyVisitTitles).values(values).onConflictDoUpdate({ target: studioDailyVisitTitles.title, set: values }).returning();
    if (!row) throw new ApiError(404, "عنوان مراجعه یافت نشد.");
    await logAuditEvent(id ? "DAILY_VISIT_TITLE_UPDATED" : "DAILY_VISIT_TITLE_CREATED", "studio_daily_visit_title", row.id, { title: row.title, active: row.active, sortOrder: row.sortOrder }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return row;
  });
}

export async function saveProjectType(
  actor: EmployeeContext,
  value: Record<string, unknown>,
  id?: string,
) {
  const title = cleanText(value.title, "عنوان نوع پروژه", true, 80)!;
  const code =
    String(value.code || title)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_|_$/g, "") || `type_${crypto.randomUUID().slice(0, 8)}`;
  const fieldSchema = Array.isArray(value.fieldSchema)
    ? value.fieldSchema.slice(0, 30)
    : [];
  return db.transaction(async (tx) => {
    const row = id
      ? (assertUuid(id),
        (
          await tx
            .update(studioProjectTypes)
            .set({
              title,
              active: value.active !== false,
              sortOrder: Number(value.sortOrder || 0),
              fieldSchema,
              updatedAt: new Date(),
            })
            .where(eq(studioProjectTypes.id, id))
            .returning()
        )[0])
      : (
          await tx
            .insert(studioProjectTypes)
            .values({
              code,
              title,
              active: value.active !== false,
              sortOrder: Number(value.sortOrder || 0),
              fieldSchema,
            })
            .returning()
        )[0];
    if (!row) throw new ApiError(404, "نوع پروژه یافت نشد.");
    await logAuditEvent(
      id ? "ATELIER_PROJECT_TYPE_UPDATED" : "ATELIER_PROJECT_TYPE_CREATED",
      "studio_project_type",
      row.id,
      { title: row.title, active: row.active },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return row;
  });
}

export async function createPendingContract(
  actor: EmployeeContext,
  value: ContractInput,
) {
  const atelierConfig = await getAtelierConfig();
  const configuredPrefix = String(
    (atelierConfig.contract as Record<string, unknown> | undefined)
      ?.numberPrefix || "CTR",
  )
    .trim()
    .replace(/[^A-Za-z0-9_\u0600-\u06ff-]/g, "")
    .slice(0, 16);
  const idempotencyKey =
    cleanText(value.idempotencyKey, "کلید درخواست", false, 200) ||
    crypto.randomUUID();
  const projectTypeId = String(value.projectTypeId || "");
  assertUuid(projectTypeId);
  const customerName = cleanText(value.customerName, "نام مشتری", true, 180)!;
  const mobile = cleanPhone(value.mobile);
  const contractDate = validDate(
    value.contractDate,
    "تاریخ ثبت قرارداد",
    new Date(),
  );
  const programDate = validDate(value.programDate, "تاریخ برنامه");
  const programEndDate = validDate(
    value.programEndDate,
    "زمان پایان برنامه",
    new Date(programDate.getTime() + 4 * 60 * 60 * 1000),
  );
  if (programEndDate <= programDate)
    throw new ApiError(400, "زمان پایان برنامه باید بعد از شروع باشد.");
  const items = parseItems(value.items);
  const itemsTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const discountAmount = money(value.discountAmount, "مبلغ تخفیف");
  if (discountAmount > itemsTotal)
    throw new ApiError(400, "مبلغ تخفیف نمی‌تواند بیشتر از جمع آیتم‌ها باشد.");
  const total = itemsTotal - discountAmount;
  const paidAmount = money(value.paidAmount, "مبلغ پرداخت‌شده");
  if (paidAmount > total)
    throw new ApiError(
      400,
      "مبلغ پرداخت‌شده نمی‌تواند بیشتر از مبلغ قرارداد باشد.",
    );
  const paymentAccountId = value.paymentAccountId
    ? String(value.paymentAccountId)
    : null;
  if (paidAmount > 0 && !paymentAccountId)
    throw new ApiError(
      400,
      "برای مبلغ پرداخت‌شده، حساب دریافت را انتخاب کنید.",
    );
  if (paymentAccountId) assertUuid(paymentAccountId);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`final-contract:${idempotencyKey}`}, 0))`,
    );
    const [prior] = await tx
      .select()
      .from(studioContracts)
      .where(eq(studioContracts.idempotencyKey, idempotencyKey))
      .limit(1);
    if (prior) return getContractById(prior.id, tx);
    const [type] = await tx
      .select()
      .from(studioProjectTypes)
      .where(
        and(
          eq(studioProjectTypes.id, projectTypeId),
          eq(studioProjectTypes.active, true),
        ),
      )
      .limit(1);
    if (!type) throw new ApiError(404, "نوع پروژه انتخاب‌شده یافت نشد.");
    if (paymentAccountId) {
      const [account] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(eq(accounts.id, paymentAccountId), eq(accounts.status, "active")),
        )
        .limit(1);
      if (!account) throw new ApiError(404, "حساب دریافت فعال یافت نشد.");
    }
    const customerType = (
      [
        "wedding",
        "portrait",
        "commercial",
        "family",
        "industrial",
        "event",
        "child",
        "modeling",
      ] as const
    ).includes(type.code as never)
      ? (type.code as
          | "wedding"
          | "portrait"
          | "commercial"
          | "family"
          | "industrial"
          | "event"
          | "child"
          | "modeling")
      : "portrait";
    const customer = await createStudioCustomer(
      { name: customerName, mobile, customerType },
      tx,
      true,
    );
    const projectTitle =
      type.code === "wedding"
        ? `${type.title} ${cleanText((value.typeMetadata as Record<string, unknown>)?.groomName, "نام داماد") || customerName}`
        : `${type.title} ${customerName}`;
    const project = await createStudioProject(
      {
        studioCustomerId: customer.id,
        title: projectTitle,
        eventType: type.code,
        eventDate: programDate,
        mainLocation: cleanText(value.executionLocation, "محل اجرا"),
        status: "contract",
        totalContractValue: total,
        notes: cleanText(value.notes, "توضیحات"),
        actorId: actor.employeeId,
        authorName: actor.employeeName,
      },
      tx,
    );
    const sequenceNumber = await getNextSequenceCode("studio_contract", tx);
    const contractNumber = `${configuredPrefix || "CTR"}-${sequenceNumber.replace(/^CTR-/, "")}`;
    const metadata =
      typeof value.typeMetadata === "object" &&
      value.typeMetadata &&
      !Array.isArray(value.typeMetadata)
        ? (value.typeMetadata as Record<string, unknown>)
        : {};
    const [contract] = await tx
      .insert(studioContracts)
      .values({
        contractNumber,
        studioProjectId: project.id,
        idempotencyKey,
        projectTypeId,
        typeMetadata: {
          ...metadata,
          paymentDraft:
            paidAmount > 0
              ? {
                  accountId: paymentAccountId,
                  method:
                    cleanText(value.paymentMethod, "روش پرداخت", false, 50) ||
                    "card_transfer",
                }
              : null,
        },
        totalAmount: total.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        depositAmount: paidAmount.toFixed(2),
        contractDate,
        deliveryCommitmentDate: programDate,
        programDate,
        programEndDate,
        executionLocation: cleanText(value.executionLocation, "محل اجرا"),
        notes: cleanText(value.notes, "توضیحات"),
        termsAndConditions: cleanText(
          value.termsAndConditions,
          "شرایط قرارداد",
        ),
        status: CONTRACT_PENDING,
        financialStatus: "draft",
      })
      .returning();
    await tx
      .insert(studioContractItems)
      .values(
        items.map((item) => ({
          ...item,
          quantity: item.quantity.toFixed(2),
          unitPrice: item.unitPrice.toFixed(2),
          contractId: contract.id,
        })),
      );
    await logProjectTimeline(
      project.id,
      {
        actionType: "CONTRACT_CREATED",
        title: `ثبت قرارداد در انتظار ${contractNumber}`,
        description: `قرارداد ${type.title} برای ${customerName} ثبت شد.`,
        authorName: actor.employeeName,
        actorEmployeeId: actor.employeeId,
        metadata: { contractId: contract.id, status: CONTRACT_PENDING, total },
      },
      tx,
    );
    await logAuditEvent(
      "ATELIER_CONTRACT_CREATED",
      "studio_contract",
      contract.id,
      {
        studioProjectId: project.id,
        status: CONTRACT_PENDING,
        total,
        items: items.length,
      },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return getContractById(contract.id, tx);
  });
}

export async function approveContract(
  actor: EmployeeContext,
  contractId: string,
) {
  assertUuid(contractId);
  return db.transaction(async (tx) => {
    const [contract] = await tx
      .select()
      .from(studioContracts)
      .where(eq(studioContracts.id, contractId))
      .for("update")
      .limit(1);
    if (!contract) throw new ApiError(404, "قرارداد یافت نشد.");
    if (contract.status === CONTRACT_APPROVED && contract.invoiceId)
      return getContractById(contractId, tx);
    if (contract.status !== CONTRACT_PENDING)
      throw new ApiError(409, "فقط قرارداد در انتظار قابل تأیید است.");
    const [project] = await tx
      .select({
        id: studioProjects.id,
        title: studioProjects.title,
        coreProjectId: studioProjects.projectId,
        customerId: customers.id,
      })
      .from(studioProjects)
      .innerJoin(
        studioCustomers,
        eq(studioCustomers.id, studioProjects.studioCustomerId),
      )
      .innerJoin(customers, eq(customers.id, studioCustomers.customerId))
      .where(eq(studioProjects.id, contract.studioProjectId))
      .limit(1);
    if (!project?.coreProjectId)
      throw new ApiError(422, "اتصال مالی قرارداد کامل نیست.");
    const items = await tx
      .select()
      .from(studioContractItems)
      .where(eq(studioContractItems.contractId, contractId))
      .orderBy(asc(studioContractItems.position));
    if (!items.length)
      throw new ApiError(422, "قرارداد بدون آیتم قابل تأیید نیست.");
    const metadata = (contract.typeMetadata || {}) as Record<string, any>;
    const paymentDraft = metadata.paymentDraft as {
      accountId?: string;
      method?: string;
    } | null;
    if (Number(contract.depositAmount) > 0 && !paymentDraft?.accountId)
      throw new ApiError(422, "حساب دریافت بیعانه مشخص نشده است.");
    const invoice = await createInvoice(
      {
        requestKey: `final-contract:${contract.id}`,
        requestHash: requestHash({
          contractId: contract.id,
          total: contract.totalAmount,
          discountAmount: contract.discountAmount,
          items: items.map((item) => [
            item.title,
            item.quantity,
            item.unitPrice,
          ]),
        }),
        customerId: project.customerId,
        projectId: project.coreProjectId,
        invoiceDate: contract.contractDate,
        dueDate: contract.programDate || contract.deliveryCommitmentDate,
        items: items.map((item) => ({
          productType: "custom",
          isCustom: true,
          productName: item.title,
          customNotes: item.description || item.notes || undefined,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          unitCost: 0,
        })),
        invoiceDiscount: Number(contract.discountAmount),
        initialPayment:
          Number(contract.depositAmount) > 0
            ? {
                amount: Number(contract.depositAmount),
                accountId: paymentDraft!.accountId!,
                paymentMethod: paymentDraft?.method || "card_transfer",
                paymentDate: contract.contractDate,
              }
            : undefined,
        notes:
          contract.termsAndConditions || `قرارداد ${contract.contractNumber}`,
        auditContext: {
          userId: actor.employeeId,
          employeeId: actor.employeeId,
          userName: actor.employeeName,
        },
      },
      tx,
    );
    const approvedAt = new Date();
    await tx
      .update(studioContracts)
      .set({
        invoiceId: invoice.id,
        status: CONTRACT_APPROVED,
        financialStatus: "posted",
        approvedAt,
        approvedById: actor.employeeId,
        updatedAt: approvedAt,
      })
      .where(eq(studioContracts.id, contractId));
    await tx
      .update(studioProjects)
      .set({
        status: "booked",
        totalContractValue: contract.totalAmount,
        eventDate: contract.programDate || contract.deliveryCommitmentDate,
        updatedAt: approvedAt,
      })
      .where(eq(studioProjects.id, contract.studioProjectId));
    const [calendar] = await tx
      .select({ id: studioCalendarEvents.id })
      .from(studioCalendarEvents)
      .where(eq(studioCalendarEvents.contractId, contractId))
      .limit(1);
    const eventValues = {
      contractId,
      studioProjectId: contract.studioProjectId,
      ownerEmployeeId: actor.employeeId,
      title: project.title,
      eventType: "shooting",
      startTime: contract.programDate || contract.deliveryCommitmentDate,
      endTime:
        contract.programEndDate ||
        new Date(
          (contract.programDate || contract.deliveryCommitmentDate).getTime() +
            4 * 60 * 60 * 1000,
        ),
      location: contract.executionLocation,
      status: "confirmed",
      notes: contract.notes,
      updatedAt: approvedAt,
    };
    if (calendar)
      await tx
        .update(studioCalendarEvents)
        .set(eventValues)
        .where(eq(studioCalendarEvents.id, calendar.id));
    else await tx.insert(studioCalendarEvents).values(eventValues);
    await logProjectTimeline(
      contract.studioProjectId,
      {
        actionType: "CONTRACT_APPROVED",
        title: `تأیید قرارداد ${contract.contractNumber}`,
        description: "قرارداد تأیید و سند مالی رسمی صادر شد.",
        authorName: actor.employeeName,
        actorEmployeeId: actor.employeeId,
        metadata: { contractId, invoiceId: invoice.id },
      },
      tx,
    );
    await logAuditEvent(
      "ATELIER_CONTRACT_APPROVED",
      "studio_contract",
      contractId,
      {
        invoiceId: invoice.id,
        studioProjectId: contract.studioProjectId,
        total: contract.totalAmount,
      },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return getContractById(contractId, tx);
  });
}

export async function getContractById(
  contractId: string,
  client: typeof db | Transaction = db,
) {
  assertUuid(contractId);
  const [row] = await client
    .select({
      contract: studioContracts,
      project: studioProjects,
      studioCustomerId: studioCustomers.id,
      customerId: customers.id,
      customerName: customers.name,
      mobile: customers.mobile,
      projectTypeTitle: studioProjectTypes.title,
      projectTypeCode: studioProjectTypes.code,
      invoicePaid: invoices.paidAmount,
      invoiceBalance: invoices.balanceDue,
    })
    .from(studioContracts)
    .innerJoin(
      studioProjects,
      eq(studioProjects.id, studioContracts.studioProjectId),
    )
    .innerJoin(
      studioCustomers,
      eq(studioCustomers.id, studioProjects.studioCustomerId),
    )
    .innerJoin(customers, eq(customers.id, studioCustomers.customerId))
    .leftJoin(
      studioProjectTypes,
      eq(studioProjectTypes.id, studioContracts.projectTypeId),
    )
    .leftJoin(invoices, eq(invoices.id, studioContracts.invoiceId))
    .where(eq(studioContracts.id, contractId))
    .limit(1);
  if (!row) throw new ApiError(404, "قرارداد یافت نشد.");
  const items = await client
    .select()
    .from(studioContractItems)
    .where(eq(studioContractItems.contractId, contractId))
    .orderBy(asc(studioContractItems.position));
  return {
    ...row.contract,
    project: row.project,
    customer: {
      id: row.customerId,
      studioCustomerId: row.studioCustomerId,
      name: row.customerName,
      mobile: row.mobile,
    },
    projectType: {
      id: row.contract.projectTypeId,
      code: row.projectTypeCode || row.project.eventType,
      title: row.projectTypeTitle || row.project.eventType,
    },
    items,
    itemsTotal: items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0),
    paidAmount: Number(row.invoicePaid ?? row.contract.depositAmount),
    remainingAmount: Number(
      row.invoiceBalance ??
        Math.max(
          0,
          Number(row.contract.totalAmount) - Number(row.contract.depositAmount),
        ),
    ),
  };
}

export async function listContracts(
  status?: "pending" | "approved",
  allowedCoreProjectIds: string[] | null = null,
) {
  const statusCondition =
    status === "pending"
      ? eq(studioContracts.status, CONTRACT_PENDING)
      : status === "approved"
        ? eq(studioContracts.status, CONTRACT_APPROVED)
        : inArray(studioContracts.status, [
            CONTRACT_PENDING,
            CONTRACT_APPROVED,
          ]);
  const scopeCondition =
    allowedCoreProjectIds === null
      ? undefined
      : allowedCoreProjectIds.length
        ? inArray(studioProjects.projectId, allowedCoreProjectIds)
        : sql`false`;
  const rows = await db
    .select({
      id: studioContracts.id,
      status: studioContracts.status,
      createdAt: studioContracts.createdAt,
      programDate: studioContracts.programDate,
    })
    .from(studioContracts)
    .innerJoin(
      studioProjects,
      eq(studioProjects.id, studioContracts.studioProjectId),
    )
    .where(and(statusCondition, scopeCondition))
    .orderBy(
      status === "approved"
        ? asc(studioContracts.programDate)
        : desc(studioContracts.createdAt),
    )
    .limit(300);
  const contracts = await Promise.all(rows.map((row) => getContractById(row.id)));
  if (status === "approved") {
    const now = Date.now();
    contracts.sort((a, b) => {
      const aTime = a.programDate ? +new Date(a.programDate) : Number.MAX_SAFE_INTEGER;
      const bTime = b.programDate ? +new Date(b.programDate) : Number.MAX_SAFE_INTEGER;
      const aFuture = aTime >= now;
      const bFuture = bTime >= now;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      return aFuture ? aTime - bTime : bTime - aTime;
    });
  }
  return contracts;
}

export async function updateContract(
  actor: EmployeeContext,
  contractId: string,
  value: ContractInput,
) {
  assertUuid(contractId);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(studioContracts)
      .where(eq(studioContracts.id, contractId))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError(404, "قرارداد یافت نشد.");
    const approved =
      current.status === CONTRACT_APPROVED || Boolean(current.invoiceId);
    if (approved && (value.items !== undefined || value.discountAmount !== undefined))
      throw new ApiError(
        409,
        "آیتم مالی قرارداد تأییدشده از این مسیر قابل تغییر نیست.",
      );
    const patch: Partial<typeof studioContracts.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (value.customerName !== undefined || value.mobile !== undefined) {
      const [identity] = await tx
        .select({ customerId: customers.id })
        .from(studioProjects)
        .innerJoin(studioCustomers, eq(studioCustomers.id, studioProjects.studioCustomerId))
        .innerJoin(customers, eq(customers.id, studioCustomers.customerId))
        .where(eq(studioProjects.id, current.studioProjectId))
        .limit(1);
      if (!identity) throw new ApiError(422, "اتصال مشتری قرارداد کامل نیست.");
      const customerPatch: Partial<typeof customers.$inferInsert> = { updatedAt: new Date() };
      if (value.customerName !== undefined) customerPatch.name = cleanText(value.customerName, "نام مشتری", true, 180)!;
      if (value.mobile !== undefined) {
        const mobile = cleanPhone(value.mobile);
        const [duplicate] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.mobile, mobile), ne(customers.id, identity.customerId))).limit(1);
        if (duplicate) throw new ApiError(409, "این شماره تماس متعلق به مشتری دیگری است.", "CUSTOMER_MOBILE_EXISTS");
        customerPatch.mobile = mobile;
      }
      await tx.update(customers).set(customerPatch).where(eq(customers.id, identity.customerId));
    }
    if (value.programDate !== undefined)
      patch.programDate = validDate(value.programDate, "تاریخ برنامه");
    if (value.programEndDate !== undefined)
      patch.programEndDate = validDate(value.programEndDate, "زمان پایان");
    if (value.executionLocation !== undefined)
      patch.executionLocation = cleanText(value.executionLocation, "محل اجرا");
    if (value.notes !== undefined)
      patch.notes = cleanText(value.notes, "توضیحات");
    if (value.termsAndConditions !== undefined)
      patch.termsAndConditions = cleanText(
        value.termsAndConditions,
        "شرایط قرارداد",
      );
    if (value.typeMetadata !== undefined) {
      const nextMetadata =
        typeof value.typeMetadata === "object" &&
        value.typeMetadata &&
        !Array.isArray(value.typeMetadata)
          ? (value.typeMetadata as Record<string, unknown>)
          : {};
      patch.typeMetadata = {
        ...((current.typeMetadata || {}) as Record<string, unknown>),
        ...nextMetadata,
      };
    }
    if (!approved && value.items !== undefined) {
      const items = parseItems(value.items),
        itemsTotal = items.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );
      const discountAmount = value.discountAmount === undefined ? Number(current.discountAmount) : money(value.discountAmount, "مبلغ تخفیف");
      if (discountAmount > itemsTotal) throw new ApiError(400, "مبلغ تخفیف نمی‌تواند بیشتر از جمع آیتم‌ها باشد.");
      const total = itemsTotal - discountAmount;
      const paid =
        value.paidAmount === undefined
          ? Number(current.depositAmount)
          : money(value.paidAmount, "مبلغ پرداخت‌شده");
      if (paid > total)
        throw new ApiError(400, "مبلغ پرداخت‌شده بیشتر از مبلغ قرارداد است.");
      patch.totalAmount = total.toFixed(2);
      patch.discountAmount = discountAmount.toFixed(2);
      patch.depositAmount = paid.toFixed(2);
      await tx
        .delete(studioContractItems)
        .where(eq(studioContractItems.contractId, contractId));
      await tx
        .insert(studioContractItems)
        .values(
          items.map((item) => ({
            ...item,
            quantity: item.quantity.toFixed(2),
            unitPrice: item.unitPrice.toFixed(2),
            contractId,
          })),
        );
      await tx
        .update(studioProjects)
        .set({ totalContractValue: total.toFixed(2), updatedAt: new Date() })
        .where(eq(studioProjects.id, current.studioProjectId));
    }
    await tx
      .update(studioContracts)
      .set(patch)
      .where(eq(studioContracts.id, contractId));
    if (approved && patch.programDate)
      await tx
        .update(studioCalendarEvents)
        .set({
          startTime: patch.programDate,
          endTime:
            patch.programEndDate ||
            new Date(patch.programDate.getTime() + 4 * 60 * 60 * 1000),
          location: patch.executionLocation,
          updatedAt: new Date(),
        })
        .where(eq(studioCalendarEvents.contractId, contractId));
    await logAuditEvent(
      "ATELIER_CONTRACT_UPDATED",
      "studio_contract",
      contractId,
      { before: current, fields: Object.keys(patch) },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return getContractById(contractId, tx);
  });
}

type SimpleMoneyInput = {
  title?: unknown;
  date?: unknown;
  price?: unknown;
  paidAmount?: unknown;
  customerName?: unknown;
  mobile?: unknown;
  notes?: unknown;
  accountId?: unknown;
  paymentMethod?: unknown;
  idempotencyKey?: unknown;
  personnelAssignments?: unknown;
};
function simpleValues(value: SimpleMoneyInput, dateKey: string) {
  const price = money(value.price, "قیمت"),
    paidAmount = money(value.paidAmount, "مبلغ پرداخت‌شده");
  if (paidAmount > price)
    throw new ApiError(400, "مبلغ پرداخت‌شده نمی‌تواند بیشتر از قیمت باشد.");
  return {
    title: cleanText(value.title, "عنوان", true, 180)!,
    [dateKey]: validDate(value.date, "تاریخ"),
    price: price.toFixed(2),
    paidAmount: paidAmount.toFixed(2),
    customerName: cleanText(value.customerName, "اسم مشتری", true, 180)!,
    mobile: cleanPhone(value.mobile),
    notes: cleanText(value.notes, "توضیحات"),
  };
}
export async function listDailyVisits(
  filters: { search?: string; from?: Date; to?: Date; payment?: string } = {},
) {
  const conditions = [];
  if (filters.search)
    conditions.push(
      or(
        ilike(studioDailyVisits.title, `%${filters.search}%`),
        ilike(studioDailyVisits.customerName, `%${filters.search}%`),
        ilike(studioDailyVisits.mobile, `%${filters.search}%`),
      )!,
    );
  if (filters.from)
    conditions.push(gte(studioDailyVisits.visitDate, filters.from));
  if (filters.to) conditions.push(lte(studioDailyVisits.visitDate, filters.to));
  if (filters.payment === "paid")
    conditions.push(eq(studioDailyVisits.price, studioDailyVisits.paidAmount));
  if (filters.payment === "due")
    conditions.push(gt(studioDailyVisits.price, studioDailyVisits.paidAmount));
  const rows = await db
    .select({ record: studioDailyVisits, invoicePaid: invoices.paidAmount, invoiceBalance: invoices.balanceDue })
    .from(studioDailyVisits)
    .leftJoin(invoices, eq(invoices.id, studioDailyVisits.invoiceId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(studioDailyVisits.visitDate))
    .limit(300);
  const visitIds = rows.map(({ record }) => record.id);
  const invoiceIds = rows.map(({ record }) => record.invoiceId).filter((id): id is string => Boolean(id));
  const assignments = visitIds.length ? await db.select().from(studioDailyVisitPersonnel).where(and(inArray(studioDailyVisitPersonnel.dailyVisitId, visitIds), eq(studioDailyVisitPersonnel.status, "active"))).orderBy(asc(studioDailyVisitPersonnel.createdAt)) : [];
  const paymentHistory = invoiceIds.length ? await db.select({ payment: payments, accountName: accounts.name }).from(payments).innerJoin(accounts, eq(accounts.id, payments.accountId)).where(and(inArray(payments.invoiceId, invoiceIds), eq(payments.status, "completed"))).orderBy(asc(payments.paymentDate)) : [];
  return rows.map(({ record: row, invoicePaid, invoiceBalance }) => ({
    ...row,
    paidAmount: Number(invoicePaid ?? row.paidAmount),
    remainingAmount: Number(invoiceBalance ?? (Number(row.price) - Number(row.paidAmount))),
    personnelAssignments: assignments.filter((assignment) => assignment.dailyVisitId === row.id),
    personnelCost: assignments.filter((assignment) => assignment.dailyVisitId === row.id).reduce((sum, assignment) => sum + Number(assignment.wageSnapshot), 0),
    preliminaryProfit: Number(row.price) - assignments.filter((assignment) => assignment.dailyVisitId === row.id).reduce((sum, assignment) => sum + Number(assignment.wageSnapshot), 0),
    paymentHistory: paymentHistory.filter(({ payment }) => payment.invoiceId === row.invoiceId).map(({ payment, accountName }) => ({ ...payment, accountName, amount: Number(payment.amount) })),
  }));
}

async function syncDailyVisitPersonnel(tx: Transaction, actor: EmployeeContext, visit: typeof studioDailyVisits.$inferSelect, raw: unknown) {
  if (raw === undefined) {
    const active = await tx.select().from(studioDailyVisitPersonnel).where(and(eq(studioDailyVisitPersonnel.dailyVisitId, visit.id), eq(studioDailyVisitPersonnel.status, "active"))).orderBy(asc(studioDailyVisitPersonnel.createdAt));
    const personnelCost = active.reduce((sum, row) => sum + Number(row.wageSnapshot), 0);
    return { personnelAssignments: active, personnelCost, preliminaryProfit: Number(visit.price) - personnelCost };
  }
  if (!Array.isArray(raw)) throw new ApiError(400, "فهرست پرسنل مراجعه معتبر نیست.");
  if (raw.length > 20) throw new ApiError(400, "حداکثر ۲۰ تخصیص پرسنل مجاز است.");
  const parsed = raw.map((value) => {
    const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const personnelId = String(row.personnelId || ""); assertUuid(personnelId);
    return { id: row.id ? String(row.id) : null, personnelId, workTitle: cleanText(row.workTitle, "عنوان کار", true, 120)!, wage: money(row.wageAmount, "دستمزد") };
  });
  if (new Set(parsed.map((row) => `${row.personnelId}:${row.workTitle}`)).size !== parsed.length) throw new ApiError(400, "تخصیص تکراری پرسنل مجاز نیست.");
  const existing = await tx.select().from(studioDailyVisitPersonnel).where(and(eq(studioDailyVisitPersonnel.dailyVisitId, visit.id), eq(studioDailyVisitPersonnel.status, "active"))).for("update");
  const retained = new Set(parsed.map((row) => row.id).filter(Boolean));
  for (const old of existing.filter((row) => !retained.has(row.id))) {
    if (old.salaryRecordId) {
      const [link] = await tx.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, "personnel_wage"), eq(atelierExpenseSources.sourceId, old.salaryRecordId))).limit(1);
      if (link) {
        const [expense] = await tx.select().from(expenses).where(eq(expenses.id, link.expenseId)).for("update").limit(1);
        if (expense && Number(expense.paidAmount) > 0) throw new ApiError(409, "تخصیص دارای پرداخت مالی است و برای حذف به اصلاح مالی نیاز دارد.");
        if (expense) await tx.update(expenses).set({ status: "reversed", paymentStatus: "reversed", reversalReason: "حذف تخصیص پرسنل مراجعه روزانه", reversedAt: new Date() }).where(eq(expenses.id, expense.id));
      }
      await tx.update(personnelSalaryRecords).set({ financialStatus: "voided", voidReason: "حذف از مراجعه روزانه", voidedAt: new Date(), updatedAt: new Date() }).where(eq(personnelSalaryRecords.id, old.salaryRecordId));
    }
    await tx.update(studioDailyVisitPersonnel).set({ status: "removed", removedAt: new Date(), updatedAt: new Date() }).where(eq(studioDailyVisitPersonnel.id, old.id));
  }
  for (const assignment of parsed) {
    const [person] = await tx.select().from(studioPersonnel).where(and(eq(studioPersonnel.id, assignment.personnelId), eq(studioPersonnel.status, "active"))).limit(1);
    if (!person) throw new ApiError(404, "پرسنل فعال انتخاب‌شده یافت نشد.");
    const old = assignment.id ? existing.find((row) => row.id === assignment.id) : undefined;
    if (assignment.id && !old) throw new ApiError(404, "تخصیص مراجعه یافت نشد.");
    let salaryRecordId = old?.salaryRecordId || null;
    if (!salaryRecordId) {
      const [salary] = await tx.insert(personnelSalaryRecords).values({ personnelId: assignment.personnelId, salaryType: "per_project", rateAmount: assignment.wage.toFixed(2), unitsCount: "1", totalCalculated: assignment.wage.toFixed(2), paymentStatus: "pending", financialStatus: "draft", notes: `مراجعه روزانه: ${visit.title}` }).returning();
      salaryRecordId = salary.id;
    } else {
      const [link] = await tx.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, "personnel_wage"), eq(atelierExpenseSources.sourceId, salaryRecordId))).limit(1);
      if (link) {
        const [expense] = await tx.select().from(expenses).where(eq(expenses.id, link.expenseId)).for("update").limit(1);
        if (expense && Number(expense.paidAmount) > 0 && Number(expense.amount) !== assignment.wage) throw new ApiError(409, "دستمزد دارای پرداخت قابل تغییر نیست.");
      }
      await tx.update(personnelSalaryRecords).set({ personnelId: assignment.personnelId, rateAmount: assignment.wage.toFixed(2), totalCalculated: assignment.wage.toFixed(2), updatedAt: new Date() }).where(eq(personnelSalaryRecords.id, salaryRecordId));
    }
    await recognizePlanningObligation(tx, actor, { sourceType: "personnel_wage", sourceId: salaryRecordId, projectId: null, title: `دستمزد ${person.fullName} برای مراجعه ${visit.title}`, category: "salary", amount: assignment.wage, dueDate: visit.visitDate });
    const values = { personnelId: assignment.personnelId, personnelNameSnapshot: person.fullName, workTitle: assignment.workTitle, wageSnapshot: assignment.wage.toFixed(2), salaryRecordId, status: "active", removedAt: null, updatedAt: new Date() };
    if (old) await tx.update(studioDailyVisitPersonnel).set(values).where(eq(studioDailyVisitPersonnel.id, old.id));
    else await tx.insert(studioDailyVisitPersonnel).values({ dailyVisitId: visit.id, ...values }).onConflictDoUpdate({ target: [studioDailyVisitPersonnel.dailyVisitId, studioDailyVisitPersonnel.personnelId, studioDailyVisitPersonnel.workTitle], set: values });
  }
  const active = await tx.select().from(studioDailyVisitPersonnel).where(and(eq(studioDailyVisitPersonnel.dailyVisitId, visit.id), eq(studioDailyVisitPersonnel.status, "active"))).orderBy(asc(studioDailyVisitPersonnel.createdAt));
  const personnelCost = active.reduce((sum, row) => sum + Number(row.wageSnapshot), 0);
  return { personnelAssignments: active, personnelCost, preliminaryProfit: Number(visit.price) - personnelCost };
}

async function ensureSimpleCustomer(tx: Transaction, name: string, mobile: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`atelier-simple-customer:${mobile}`}, 0))`);
  const [existing] = await tx.select().from(customers).where(eq(customers.mobile, mobile)).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(customers).values({ code: `AT-SIMPLE-${crypto.randomUUID()}`, name, mobile, notes: "طرف حساب مالی مراجعه/رزرو؛ مشتری رسمی قرارداد نیست" }).returning();
  return created;
}

async function createSimpleInvoice(tx: Transaction, actor: EmployeeContext, kind: "daily_visit" | "reservation", sourceKey: string, values: ReturnType<typeof simpleValues>, accountId?: string | null, paymentMethod?: string | null) {
  const customer = await ensureSimpleCustomer(tx, values.customerName, values.mobile);
  const paid = Number(values.paidAmount);
  if (paid > 0 && !accountId) throw new ApiError(400, "برای ثبت دریافت، حساب مقصد الزامی است.");
  const documentDate = new Date(String(values.visitDate || values.reservedAt));
  if (Number.isNaN(documentDate.getTime())) throw new ApiError(400, "تاریخ سند نامعتبر است.");
  const invoice = await createInvoice({
    requestKey: `atelier-${kind}:${sourceKey}`,
    requestHash: requestHash({ kind, sourceKey, title: values.title, price: values.price, customerId: customer.id }),
    customerId: customer.id,
    invoiceDate: documentDate,
    dueDate: documentDate,
    items: [{ productType: "custom", isCustom: true, productName: values.title, quantity: 1, unitPrice: Number(values.price), unitCost: 0 }],
    initialPayment: paid > 0 ? { amount: paid, accountId: accountId!, paymentMethod: paymentMethod || "card_transfer", paymentDate: documentDate } : undefined,
    notes: kind === "daily_visit" ? "مراجعه روزانه آتلیه" : "رزرو آتلیه",
    auditContext: { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName },
  }, tx);
  return { customer, invoice };
}

async function updateSimpleInvoice(tx: Transaction, invoiceId: string, values: ReturnType<typeof simpleValues>) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update").limit(1);
  if (!invoice || invoice.status !== "issued") throw new ApiError(409, "سند مالی این رکورد قابل ویرایش نیست.");
  const total = Number(values.price), paid = Number(invoice.paidAmount);
  if (total < paid) throw new ApiError(422, "قیمت جدید نمی‌تواند از مبلغ دریافت‌شده کمتر باشد.");
  const dueDate = new Date(String(values.visitDate || values.reservedAt));
  if (Number.isNaN(dueDate.getTime())) throw new ApiError(400, "تاریخ سند نامعتبر است.");
  await tx.update(invoices).set({ subtotal: total.toFixed(2), grandTotal: total.toFixed(2), grossProfitTotal: total.toFixed(2), balanceDue: (total - paid).toFixed(2), paymentStatus: total === paid ? "paid" : paid > 0 ? "partial" : "unpaid", dueDate, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
  await tx.update(invoiceItems).set({ productNameSnapshot: values.title, unitPrice: total.toFixed(2), lineTotal: total.toFixed(2), lineProfit: total.toFixed(2) }).where(eq(invoiceItems.invoiceId, invoice.id));
  return { paid, remaining: total - paid };
}
export async function saveDailyVisit(
  actor: EmployeeContext,
  value: SimpleMoneyInput,
  id?: string,
) {
  const vals = simpleValues(
    value,
    "visitDate",
  ) as typeof studioDailyVisits.$inferInsert;
  return db.transaction(async (tx) => {
    let row;
    if (id) {
      assertUuid(id);
      const [existing] = await tx.select().from(studioDailyVisits).where(eq(studioDailyVisits.id, id)).for("update").limit(1);
      if (!existing || existing.status !== "active") throw new ApiError(404, "مراجعه روزانه یافت نشد.");
      if (!existing.invoiceId) throw new ApiError(409, "اتصال مالی مراجعه کامل نیست.");
      const financial = await updateSimpleInvoice(tx, existing.invoiceId, vals as ReturnType<typeof simpleValues>);
      [row] = await tx
        .update(studioDailyVisits)
        .set({ ...vals, paidAmount: financial.paid.toFixed(2), updatedAt: new Date() })
        .where(eq(studioDailyVisits.id, id))
        .returning();
    } else {
      const key = cleanText(value.idempotencyKey, "کلید درخواست", false, 160) || crypto.randomUUID();
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`daily-visit:${key}`}, 0))`);
      const [prior] = await tx.select().from(studioDailyVisits).where(eq(studioDailyVisits.idempotencyKey, key)).limit(1);
      if (prior) {
        const personnel = await syncDailyVisitPersonnel(tx, actor, prior, undefined);
        return { ...prior, remainingAmount: Number(prior.price) - Number(prior.paidAmount), ...personnel };
      }
      const canonical = await createSimpleInvoice(tx, actor, "daily_visit", key, vals as ReturnType<typeof simpleValues>, cleanText(value.accountId, "حساب", false, 80), cleanText(value.paymentMethod, "روش پرداخت", false, 50));
      [row] = await tx
        .insert(studioDailyVisits)
        .values({ ...vals, customerId: canonical.customer.id, invoiceId: canonical.invoice.id, idempotencyKey: key, financialStatus: "posted", status: "active", createdById: actor.employeeId })
        .returning();
    }
    if (!row) throw new ApiError(404, "مراجعه روزانه یافت نشد.");
    const personnel = await syncDailyVisitPersonnel(tx, actor, row, value.personnelAssignments);
    await logAuditEvent(
      id ? "DAILY_VISIT_UPDATED" : "DAILY_VISIT_CREATED",
      "studio_daily_visit",
      row.id,
      { title: row.title, price: row.price, paidAmount: row.paidAmount },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return {
      ...row,
      remainingAmount: Number(row.price) - Number(row.paidAmount),
      ...personnel,
    };
  });
}
export async function deleteDailyVisit(actor: EmployeeContext, id: string) {
  assertUuid(id);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(studioDailyVisits).where(eq(studioDailyVisits.id, id)).for("update").limit(1);
    if (!current) throw new ApiError(404, "مراجعه روزانه یافت نشد.");
    if (Number(current.paidAmount) > 0) throw new ApiError(409, "مراجعه دارای دریافت مالی است و باید از فرآیند برگشت وجه ابطال شود.");
    await syncDailyVisitPersonnel(tx, actor, current, []);
    if (current.invoiceId) await tx.update(invoices).set({ status: "cancelled", reversalReason: "ابطال مراجعه روزانه", updatedAt: new Date() }).where(eq(invoices.id, current.invoiceId));
    const [row] = await tx.update(studioDailyVisits).set({ status: "cancelled", financialStatus: "voided", updatedAt: new Date() }).where(eq(studioDailyVisits.id, id)).returning();
    if (!row) throw new ApiError(404, "مراجعه روزانه یافت نشد.");
    await logAuditEvent(
      "DAILY_VISIT_DELETED",
      "studio_daily_visit",
      id,
      { title: row.title },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return row;
  });
}

export async function listReservations() {
  return db.select().from(studioReservations).orderBy(asc(studioReservations.reservedAt)).limit(300);
}
export async function saveReservation(
  actor: EmployeeContext,
  value: SimpleMoneyInput & { status?: unknown },
  id?: string,
) {
  const vals = {
    title: cleanText(value.title, "عنوان", true, 180)!,
    reservedAt: validDate(value.date, "تاریخ رزرو"),
    customerName: cleanText(value.customerName, "اسم مشتری", true, 180)!,
    mobile: cleanPhone(value.mobile),
    notes: cleanText(value.notes, "توضیحات"),
  };
  return db.transaction(async (tx) => {
    let row;
    if (id) {
      assertUuid(id);
      const [existing] = await tx.select().from(studioReservations).where(eq(studioReservations.id, id)).for("update").limit(1);
      if (!existing || existing.status === "cancelled") throw new ApiError(404, "رزرو یافت نشد.");
      [row] = await tx
        .update(studioReservations)
        .set({ ...vals, updatedAt: new Date() })
        .where(eq(studioReservations.id, id))
        .returning();
    } else {
      const key = cleanText(value.idempotencyKey, "کلید درخواست", false, 160) || crypto.randomUUID();
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`reservation:${key}`}, 0))`);
      const [prior] = await tx.select().from(studioReservations).where(eq(studioReservations.idempotencyKey, key)).limit(1);
      if (prior) return { ...prior, remainingAmount: Number(prior.price) - Number(prior.paidAmount) };
      [row] = await tx
        .insert(studioReservations)
        .values({ ...vals, price: "0", paidAmount: "0", idempotencyKey: key, financialStatus: "not_applicable", status: "pending", createdById: actor.employeeId })
        .returning();
    }
    if (!row) throw new ApiError(404, "رزرو یافت نشد.");
    await logAuditEvent(
      id ? "RESERVATION_UPDATED" : "RESERVATION_CREATED",
      "studio_reservation",
      row.id,
      { title: row.title, reservedAt: row.reservedAt },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return {
      ...row,
      remainingAmount: 0,
    };
  });
}
export async function completeReservation(actor: EmployeeContext, id: string) {
  return hardDeleteReservation(actor, id, "RESERVATION_COMPLETED_AND_DELETED");
}
async function hardDeleteReservation(actor: EmployeeContext, id: string, action: string) {
  assertUuid(id);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(studioReservations).where(eq(studioReservations.id, id)).for("update").limit(1);
    if (!current) throw new ApiError(404, "رزرو یافت نشد.");
    await logAuditEvent(
      action,
      "studio_reservation",
      id,
      { before: current, permanentDelete: true, historicalInvoicePreserved: Boolean(current.invoiceId) },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    const [row] = await tx.delete(studioReservations).where(eq(studioReservations.id, id)).returning();
    return row;
  });
}
export async function deleteReservation(actor: EmployeeContext, id: string) {
  return hardDeleteReservation(actor, id, "RESERVATION_CANCELLED_AND_DELETED");
}

export async function convertReservationToDailyVisit(actor: EmployeeContext, id: string, value: SimpleMoneyInput) {
  assertUuid(id);
  const [reservation] = await db.select().from(studioReservations).where(eq(studioReservations.id, id)).limit(1);
  if (!reservation) {
    const converted = (await listDailyVisits()).find(
      (visit) => visit.idempotencyKey === `reservation-conversion:${id}`,
    );
    if (converted) return converted;
    throw new ApiError(404, "رزرو یافت نشد.");
  }
  const visit = await saveDailyVisit(actor, {
    ...value,
    title: value.title ?? reservation.title,
    date: value.date ?? reservation.reservedAt,
    customerName: value.customerName ?? reservation.customerName,
    mobile: value.mobile ?? reservation.mobile,
    notes: value.notes ?? reservation.notes,
    idempotencyKey: `reservation-conversion:${id}`,
  });
  await hardDeleteReservation(actor, id, "RESERVATION_CONVERTED_TO_DAILY_VISIT");
  return visit;
}

async function approvedItem(tx: Transaction, itemId: string) {
  assertUuid(itemId);
  const [row] = await tx
    .select({
      item: studioContractItems,
      contract: studioContracts,
      project: studioProjects,
    })
    .from(studioContractItems)
    .innerJoin(
      studioContracts,
      eq(studioContracts.id, studioContractItems.contractId),
    )
    .innerJoin(
      studioProjects,
      eq(studioProjects.id, studioContracts.studioProjectId),
    )
    .where(eq(studioContractItems.id, itemId))
    .limit(1);
  if (!row) throw new ApiError(404, "آیتم قرارداد یافت نشد.");
  if (row.contract.status !== CONTRACT_APPROVED)
    throw new ApiError(409, "فقط قرارداد تأییدشده قابل برنامه‌ریزی است.");
  return row;
}

async function assertPlanningScope(actor: EmployeeContext, project: typeof studioProjects.$inferSelect) {
  if (actor.permissions.has("*")) return;
  if (!project.projectId || !(await canAccessPermission(actor, "studio.planning.manage", project.projectId))) {
    throw new ApiError(403, "دسترسی به برنامه‌ریزی این قرارداد مجاز نیست.", "PROJECT_SCOPE_FORBIDDEN");
  }
}
export async function getPlanning(
  allowedCoreProjectIds: string[] | null = null,
) {
  const contracts = await listContracts("approved", allowedCoreProjectIds);
  const itemIds = contracts.flatMap((contract) =>
    contract.items.map(
      (item: typeof studioContractItems.$inferSelect) => item.id,
    ),
  );
  const [people, equipment, rentals] = itemIds.length
    ? await Promise.all([
        db
          .select({
            assignment: studioPlanningPersonnel,
            personnelName: studioPersonnel.fullName,
          })
          .from(studioPlanningPersonnel)
          .innerJoin(
            studioPersonnel,
            eq(studioPersonnel.id, studioPlanningPersonnel.personnelId),
          )
          .where(inArray(studioPlanningPersonnel.contractItemId, itemIds)),
        db
          .select()
          .from(equipmentReservations)
          .where(inArray(equipmentReservations.contractItemId, itemIds)),
        db
          .select()
          .from(rentalEquipment)
          .where(inArray(rentalEquipment.contractItemId, itemIds)),
      ])
    : [[], [], []];
  const [personnelOptions, equipmentOptions] = await Promise.all([
    db
      .select()
      .from(studioPersonnel)
      .where(eq(studioPersonnel.status, "active"))
      .orderBy(asc(studioPersonnel.fullName)),
    db
      .select()
      .from(studioEquipment)
      .where(ne(studioEquipment.currentHealthStatus, "retired"))
      .orderBy(asc(studioEquipment.title)),
  ]);
  return {
    contracts: contracts.map((contract) => ({
      ...contract,
      items: contract.items.map(
        (item: typeof studioContractItems.$inferSelect) => ({
          ...item,
          personnelAssignments: people
            .filter((row) => row.assignment.contractItemId === item.id)
            .map((row) => ({
              ...row.assignment,
              personnelName: row.personnelName,
            })),
          equipmentAssignments: equipment.filter(
            (row) => row.contractItemId === item.id,
          ),
          rentalRequirements: rentals.filter(
            (row) => row.contractItemId === item.id,
          ),
        }),
      ),
    })),
    personnelOptions,
    equipmentOptions,
  };
}

export async function assignPersonnelToItem(
  actor: EmployeeContext,
  itemId: string,
  value: Record<string, unknown>,
) {
  const personnelId = String(value.personnelId || "");
  assertUuid(personnelId);
  const start = validDate(value.startsAt, "زمان شروع"),
    end = validDate(value.endsAt, "زمان پایان");
  if (end <= start)
    throw new ApiError(400, "زمان پایان باید بعد از شروع باشد.");
  return db.transaction(async (tx) => {
    await lockScheduleResources(tx, [], [personnelId]);
      const info = await approvedItem(tx, itemId);
      await assertPlanningScope(actor, info.project);
    const [person] = await tx
      .select()
      .from(studioPersonnel)
      .where(
        and(
          eq(studioPersonnel.id, personnelId),
          eq(studioPersonnel.status, "active"),
        ),
      )
      .limit(1);
    if (!person) throw new ApiError(404, "پرسنل فعال یافت نشد.");
    if (person.employeeId && info.project.projectId) {
      await tx.insert(employeeProjectAssignments).values({
        employeeId: person.employeeId,
        projectId: info.project.projectId,
        role: "atelier_personnel",
        status: "active",
        permissionSet: {},
      }).onConflictDoUpdate({
        target: [employeeProjectAssignments.employeeId, employeeProjectAssignments.projectId],
        set: { status: "active", endedAt: null },
      });
    }
    const conflict = await tx
      .select({ id: studioPlanningPersonnel.id })
      .from(studioPlanningPersonnel)
      .innerJoin(studioContractItems, eq(studioContractItems.id, studioPlanningPersonnel.contractItemId))
      .where(
        and(
          eq(studioPlanningPersonnel.personnelId, personnelId),
          ne(studioContractItems.contractId, info.item.contractId),
          lt(studioPlanningPersonnel.startsAt, end),
          gt(studioPlanningPersonnel.endsAt, start),
        ),
      )
      .limit(1);
    if (conflict.length)
      throw new ApiError(
        409,
        `پرسنل «${person.fullName}» در این بازه برنامه دیگری دارد.`,
        "PERSONNEL_CONFLICT",
      );
    if (value.wageAmount === undefined || value.wageAmount === "")
      throw new ApiError(400, "دستمزد این کار باید به‌صورت دستی وارد شود.");
    const wage = money(value.wageAmount, "دستمزد");
    const [existing] = await tx
      .select()
      .from(studioPlanningPersonnel)
      .where(
        and(
          eq(studioPlanningPersonnel.contractItemId, itemId),
          eq(studioPlanningPersonnel.personnelId, personnelId),
        ),
      )
      .limit(1);
    let salaryRecordId = existing?.salaryRecordId || null;
    if (!salaryRecordId) {
      const [salary] = await tx
        .insert(personnelSalaryRecords)
        .values({
          personnelId,
          studioProjectId: info.project.id,
          salaryType: "per_project",
          rateAmount: wage.toFixed(2),
          unitsCount: "1",
          totalCalculated: wage.toFixed(2),
          paymentStatus: "pending",
          financialStatus: "draft",
          notes: `برنامه‌ریزی آیتم ${info.item.title}`,
        })
        .returning();
      salaryRecordId = salary.id;
    } else {
      const [salary] = await tx
        .select()
        .from(personnelSalaryRecords)
        .where(eq(personnelSalaryRecords.id, salaryRecordId))
        .limit(1);
      if (salary?.financialStatus === "posted")
        throw new ApiError(409, "دستمزد پرداخت‌شده قابل تغییر نیست.");
      await tx
        .update(personnelSalaryRecords)
        .set({
          rateAmount: wage.toFixed(2),
          totalCalculated: wage.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(personnelSalaryRecords.id, salaryRecordId));
    }
    await recognizePlanningObligation(tx, actor, {
      sourceType: "personnel_wage", sourceId: salaryRecordId!, projectId: info.project.projectId,
      title: `دستمزد ${person.fullName} برای ${info.item.title}`, category: "salary", amount: wage, dueDate: end,
    });
    const values = {
      contractItemId: itemId,
      personnelId,
      startsAt: start,
      endsAt: end,
      wageSnapshot: wage.toFixed(2),
      salaryRecordId,
      notes: cleanText(value.notes, "توضیحات"),
      assignedById: actor.employeeId,
      updatedAt: new Date(),
    };
    const [row] = existing
      ? await tx
          .update(studioPlanningPersonnel)
          .set(values)
          .where(eq(studioPlanningPersonnel.id, existing.id))
          .returning()
      : await tx.insert(studioPlanningPersonnel).values(values).returning();
    await logProjectTimeline(
      info.project.id,
      {
        actionType: "PERSONNEL_ASSIGNED",
        title: `تخصیص ${person.fullName} به ${info.item.title}`,
        description: `دستمزد این تخصیص ${wage.toLocaleString("fa-IR")} تومان ثبت شد.`,
        authorName: actor.employeeName,
        actorEmployeeId: actor.employeeId,
        metadata: { contractItemId: itemId, personnelId, wageSnapshot: wage },
      },
      tx,
    );
    await logAuditEvent(
      "PLANNING_PERSONNEL_ASSIGNED",
      "studio_contract_item",
      itemId,
      { personnelId, wageSnapshot: wage, startsAt: start, endsAt: end },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return row;
  });
}

export async function updatePersonnelAssignment(actor: EmployeeContext, itemId: string, assignmentId: string, value: Record<string, unknown>) {
  assertUuid(assignmentId);
  const personnelId = String(value.personnelId || ""); assertUuid(personnelId);
  const start = validDate(value.startsAt, "زمان شروع"), end = validDate(value.endsAt, "زمان پایان");
  if (end <= start) throw new ApiError(400, "زمان پایان باید بعد از شروع باشد.");
  if (value.wageAmount === undefined || value.wageAmount === "") throw new ApiError(400, "دستمزد این کار باید وارد شود.");
  const wage = money(value.wageAmount, "دستمزد");
  return db.transaction(async (tx) => {
    const info = await approvedItem(tx, itemId); await assertPlanningScope(actor, info.project);
    const [current] = await tx.select().from(studioPlanningPersonnel).where(and(eq(studioPlanningPersonnel.id, assignmentId), eq(studioPlanningPersonnel.contractItemId, itemId))).for("update").limit(1);
    if (!current) throw new ApiError(404, "تخصیص پرسنل یافت نشد.");
    await lockScheduleResources(tx, [], [...new Set([current.personnelId, personnelId])]);
    const [person] = await tx.select().from(studioPersonnel).where(and(eq(studioPersonnel.id, personnelId), eq(studioPersonnel.status, "active"))).limit(1);
    if (!person) throw new ApiError(404, "پرسنل فعال یافت نشد.");
    const conflict = await tx.select({ id: studioPlanningPersonnel.id }).from(studioPlanningPersonnel).innerJoin(studioContractItems, eq(studioContractItems.id, studioPlanningPersonnel.contractItemId)).where(and(eq(studioPlanningPersonnel.personnelId, personnelId), ne(studioPlanningPersonnel.id, assignmentId), ne(studioContractItems.contractId, info.item.contractId), lt(studioPlanningPersonnel.startsAt, end), gt(studioPlanningPersonnel.endsAt, start))).limit(1);
    if (conflict.length) throw new ApiError(409, `پرسنل «${person.fullName}» در این بازه برنامه دیگری دارد.`, "PERSONNEL_CONFLICT");
    if (!current.salaryRecordId) throw new ApiError(409, "پیوند مالی دستمزد این تخصیص ناقص است.");
    const [salary] = await tx.select().from(personnelSalaryRecords).where(eq(personnelSalaryRecords.id, current.salaryRecordId)).for("update").limit(1);
    if (!salary) throw new ApiError(409, "رکورد دستمزد یافت نشد.");
    if (salary.financialStatus === "posted" || salary.paymentStatus === "paid") throw new ApiError(409, "تخصیصی که دستمزد آن پرداخت شده قابل تغییر نیست؛ ابتدا اصلاح مالی ثبت کنید.");
    await tx.update(personnelSalaryRecords).set({ personnelId, rateAmount: wage.toFixed(2), totalCalculated: wage.toFixed(2), updatedAt: new Date() }).where(eq(personnelSalaryRecords.id, salary.id));
    await recognizePlanningObligation(tx, actor, { sourceType: "personnel_wage", sourceId: salary.id, projectId: info.project.projectId, title: `دستمزد ${person.fullName} برای ${info.item.title}`, category: "salary", amount: wage, dueDate: end });
    const [updated] = await tx.update(studioPlanningPersonnel).set({ personnelId, startsAt: start, endsAt: end, wageSnapshot: wage.toFixed(2), notes: cleanText(value.notes, "توضیحات"), assignedById: actor.employeeId, updatedAt: new Date() }).where(eq(studioPlanningPersonnel.id, assignmentId)).returning();
    await logAuditEvent("PLANNING_PERSONNEL_UPDATED", "studio_contract_item", itemId, { assignmentId, before: current, after: updated }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return updated;
  });
}

export async function deletePersonnelAssignment(actor: EmployeeContext, itemId: string, assignmentId: string) {
  assertUuid(assignmentId);
  return db.transaction(async (tx) => {
    const info = await approvedItem(tx, itemId); await assertPlanningScope(actor, info.project);
    const [current] = await tx.select().from(studioPlanningPersonnel).where(and(eq(studioPlanningPersonnel.id, assignmentId), eq(studioPlanningPersonnel.contractItemId, itemId))).for("update").limit(1);
    if (!current) throw new ApiError(404, "تخصیص پرسنل یافت نشد.");
    if (current.salaryRecordId) {
      const [salary] = await tx.select().from(personnelSalaryRecords).where(eq(personnelSalaryRecords.id, current.salaryRecordId)).for("update").limit(1);
      if (salary && (salary.financialStatus === "posted" || Number(salary.paymentId ? 1 : 0) > 0)) throw new ApiError(409, "تخصیصی که دستمزد آن پرداخت شده قابل حذف نیست.");
      const [link] = await tx.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, "personnel_wage"), eq(atelierExpenseSources.sourceId, current.salaryRecordId))).limit(1);
      if (link) { await tx.delete(atelierExpenseSources).where(eq(atelierExpenseSources.id, link.id)); await tx.delete(expenses).where(and(eq(expenses.id, link.expenseId), eq(expenses.paidAmount, "0"))); }
      await tx.delete(studioPlanningPersonnel).where(eq(studioPlanningPersonnel.id, assignmentId));
      if (salary) await tx.delete(personnelSalaryRecords).where(eq(personnelSalaryRecords.id, salary.id));
    } else await tx.delete(studioPlanningPersonnel).where(eq(studioPlanningPersonnel.id, assignmentId));
    await logAuditEvent("PLANNING_PERSONNEL_DELETED", "studio_contract_item", itemId, { assignmentId, before: current }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return current;
  });
}

export async function assignEquipmentToItem(
  actor: EmployeeContext,
  itemId: string,
  value: Record<string, unknown>,
) {
  const equipmentId = String(value.equipmentId || "");
  assertUuid(equipmentId);
  const start = validDate(value.startsAt, "زمان شروع"),
    end = validDate(value.endsAt, "زمان پایان");
  if (end <= start)
    throw new ApiError(400, "زمان پایان باید بعد از شروع باشد.");
  return db.transaction(async (tx) => {
    await lockScheduleResources(tx, [equipmentId], []);
      const info = await approvedItem(tx, itemId);
      await assertPlanningScope(actor, info.project);
    const [prior] = await tx
      .select()
      .from(equipmentReservations)
      .where(
        and(
          eq(equipmentReservations.contractItemId, itemId),
          eq(equipmentReservations.equipmentId, equipmentId),
        ),
      )
      .limit(1);
    await assertEquipmentScheduleAvailable(
      tx,
      equipmentId,
      start,
      end,
      prior?.id,
    );
    const values = {
      equipmentId,
      studioProjectId: info.project.id,
      contractItemId: itemId,
      reservedFrom: start,
      reservedTo: end,
      status: "reserved",
      notes: cleanText(value.notes, "توضیحات"),
      updatedAt: new Date(),
    };
    const [row] = prior
      ? await tx
          .update(equipmentReservations)
          .set(values)
          .where(eq(equipmentReservations.id, prior.id))
          .returning()
      : await tx.insert(equipmentReservations).values(values).returning();
    await logProjectTimeline(
      info.project.id,
      {
        actionType: "EQUIPMENT_RESERVED",
        title: `تخصیص تجهیزات به ${info.item.title}`,
        authorName: actor.employeeName,
        actorEmployeeId: actor.employeeId,
        metadata: { contractItemId: itemId, equipmentId },
      },
      tx,
    );
    await logAuditEvent(
      "PLANNING_EQUIPMENT_ASSIGNED",
      "studio_contract_item",
      itemId,
      { equipmentId, startsAt: start, endsAt: end },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return row;
  });
}

export async function updateEquipmentAssignment(actor: EmployeeContext, itemId: string, assignmentId: string, value: Record<string, unknown>) {
  assertUuid(assignmentId); const equipmentId = String(value.equipmentId || ""); assertUuid(equipmentId);
  const start = validDate(value.startsAt, "زمان شروع"), end = validDate(value.endsAt, "زمان پایان");
  if (end <= start) throw new ApiError(400, "زمان پایان باید بعد از شروع باشد.");
  return db.transaction(async (tx) => {
    const info = await approvedItem(tx, itemId); await assertPlanningScope(actor, info.project);
    const [current] = await tx.select().from(equipmentReservations).where(and(eq(equipmentReservations.id, assignmentId), eq(equipmentReservations.contractItemId, itemId))).for("update").limit(1);
    if (!current) throw new ApiError(404, "تخصیص تجهیزات یافت نشد.");
    await lockScheduleResources(tx, [...new Set([current.equipmentId, equipmentId])], []);
    await assertEquipmentScheduleAvailable(tx, equipmentId, start, end, assignmentId);
    const [updated] = await tx.update(equipmentReservations).set({ equipmentId, reservedFrom: start, reservedTo: end, notes: cleanText(value.notes, "توضیحات"), updatedAt: new Date() }).where(eq(equipmentReservations.id, assignmentId)).returning();
    await logAuditEvent("PLANNING_EQUIPMENT_UPDATED", "studio_contract_item", itemId, { assignmentId, before: current, after: updated }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return updated;
  });
}

export async function deleteEquipmentAssignment(actor: EmployeeContext, itemId: string, assignmentId: string) {
  assertUuid(assignmentId);
  return db.transaction(async (tx) => {
    const info = await approvedItem(tx, itemId); await assertPlanningScope(actor, info.project);
    const [current] = await tx.select().from(equipmentReservations).where(and(eq(equipmentReservations.id, assignmentId), eq(equipmentReservations.contractItemId, itemId))).for("update").limit(1);
    if (!current) throw new ApiError(404, "تخصیص تجهیزات یافت نشد.");
    await tx.delete(equipmentReservations).where(eq(equipmentReservations.id, assignmentId));
    await logAuditEvent("PLANNING_EQUIPMENT_DELETED", "studio_contract_item", itemId, { assignmentId, before: current }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return current;
  });
}

export async function addRentalRequirement(
  actor: EmployeeContext,
  itemId: string,
  value: Record<string, unknown>,
) {
  const title = cleanText(value.itemTitle, "نام تجهیزات اجاره‌ای", true, 160)!,
    start = validDate(value.neededAt, "تاریخ مورد نیاز"),
    end = validDate(
      value.returnAt,
      "تاریخ بازگشت",
      new Date(start.getTime() + 24 * 60 * 60 * 1000),
    );
  const estimated = money(value.estimatedCost, "هزینه برآوردی");
  return db.transaction(async (tx) => {
      const info = await approvedItem(tx, itemId);
      await assertPlanningScope(actor, info.project);
    const [row] = await tx
      .insert(rentalEquipment)
      .values({
        studioProjectId: info.project.id,
        contractItemId: itemId,
        itemTitle: title,
        rentalCompany:
          cleanText(value.supplierName, "اجاره‌دهنده", false, 180) ||
          "تعیین نشده",
        rentalCost: estimated.toFixed(2),
        pickupDate: start,
        returnDate: end,
        status: "planned",
        notes: cleanText(value.notes, "توضیحات"),
      })
      .returning();
    await recognizePlanningObligation(tx, actor, {
      sourceType: "rental", sourceId: row.id, projectId: info.project.projectId,
      title: `اجاره ${title} برای ${info.item.title}`, category: "rental", amount: estimated, dueDate: start,
    });
    await logProjectTimeline(
      info.project.id,
      {
        actionType: "RENTAL_REQUIRED",
        title: `نیاز به اجاره ${title}`,
        description: `این وسیله باید برای تاریخ برنامه تهیه شود.`,
        authorName: actor.employeeName,
        actorEmployeeId: actor.employeeId,
        metadata: { rentalId: row.id, contractItemId: itemId },
      },
      tx,
    );
    await logAuditEvent(
      "RENTAL_REQUIREMENT_CREATED",
      "rental_equipment",
      row.id,
      { contractItemId: itemId, pickupDate: start },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return row;
  });
}
export async function markRentalAsRented(
  actor: EmployeeContext,
  rentalId: string,
  finalCost?: unknown,
) {
  assertUuid(rentalId);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(rentalEquipment)
      .where(eq(rentalEquipment.id, rentalId))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError(404, "نیاز اجاره یافت نشد.");
    if (!current.studioProjectId) throw new ApiError(422, "اتصال قرارداد برای این نیاز اجاره کامل نیست.");
    const [project] = await tx.select().from(studioProjects).where(eq(studioProjects.id, current.studioProjectId)).limit(1);
    if (!project) throw new ApiError(404, "برنامه مرتبط با تجهیزات اجاره‌ای یافت نشد.");
    await assertPlanningScope(actor, project);
    if (current.status === "rented") return current;
    const patch = {
      status: "rented",
      markedRentedAt: new Date(),
      markedRentedById: actor.employeeId,
      rentalCost:
        finalCost === undefined
          ? current.rentalCost
          : money(finalCost, "هزینه نهایی").toFixed(2),
      updatedAt: new Date(),
    };
    const [row] = await tx
      .update(rentalEquipment)
      .set(patch)
      .where(eq(rentalEquipment.id, rentalId))
      .returning();
    await recognizePlanningObligation(tx, actor, {
      sourceType: "rental", sourceId: row.id, projectId: project.projectId,
      title: `اجاره ${row.itemTitle}`, category: "rental", amount: Number(row.rentalCost), dueDate: row.pickupDate,
    });
    await logAuditEvent(
      "RENTAL_MARKED_RENTED",
      "rental_equipment",
      rentalId,
      { contractItemId: row.contractItemId, finalCost: row.rentalCost },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return row;
  });
}

export async function getAtelierConfig() {
  const [settings] = await db
    .select({ config: systemSettings.atelierConfig })
    .from(systemSettings)
    .where(eq(systemSettings.id, "main_config"))
    .limit(1);
  return (settings?.config || {}) as Record<string, unknown>;
}
export async function saveAtelierConfig(
  actor: EmployeeContext,
  value: unknown,
) {
  const config =
    typeof value === "object" && value && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(systemSettings)
      .values({ id: "main_config", atelierConfig: config })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: { atelierConfig: config, updatedAt: new Date() },
      })
      .returning();
    await logAuditEvent(
      "ATELIER_SETTINGS_UPDATED",
      "settings",
      "main_config",
      { sections: Object.keys(config) },
      {
        userId: actor.employeeId,
        employeeId: actor.employeeId,
        userName: actor.employeeName,
      },
      tx,
    );
    return row.atelierConfig;
  });
}
