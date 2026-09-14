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
  customers,
  equipmentReservations,
  invoices,
  personnelSalaryRecords,
  rentalEquipment,
  studioEquipment,
  studioCalendarEvents,
  studioContractItems,
  studioContracts,
  studioCustomers,
  studioDailyVisits,
  studioPersonnel,
  studioPersonnelDefaultWages,
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
  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
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
    if (approved && value.items !== undefined)
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
        total = items.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );
      const paid =
        value.paidAmount === undefined
          ? Number(current.depositAmount)
          : money(value.paidAmount, "مبلغ پرداخت‌شده");
      if (paid > total)
        throw new ApiError(400, "مبلغ پرداخت‌شده بیشتر از مبلغ قرارداد است.");
      patch.totalAmount = total.toFixed(2);
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
    .select()
    .from(studioDailyVisits)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(studioDailyVisits.visitDate))
    .limit(300);
  return rows.map((row) => ({
    ...row,
    remainingAmount: Number(row.price) - Number(row.paidAmount),
  }));
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
      [row] = await tx
        .update(studioDailyVisits)
        .set({ ...vals, updatedAt: new Date() })
        .where(eq(studioDailyVisits.id, id))
        .returning();
    } else
      [row] = await tx
        .insert(studioDailyVisits)
        .values({ ...vals, createdById: actor.employeeId })
        .returning();
    if (!row) throw new ApiError(404, "مراجعه روزانه یافت نشد.");
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
    };
  });
}
export async function deleteDailyVisit(actor: EmployeeContext, id: string) {
  assertUuid(id);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(studioDailyVisits)
      .where(eq(studioDailyVisits.id, id))
      .returning();
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
  return (
    await db
      .select()
      .from(studioReservations)
      .orderBy(asc(studioReservations.reservedAt))
      .limit(300)
  ).map((row) => ({
    ...row,
    remainingAmount: Number(row.price) - Number(row.paidAmount),
  }));
}
export async function saveReservation(
  actor: EmployeeContext,
  value: SimpleMoneyInput & { status?: unknown },
  id?: string,
) {
  const vals = simpleValues(
    value,
    "reservedAt",
  ) as typeof studioReservations.$inferInsert;
  return db.transaction(async (tx) => {
    let row;
    if (id) {
      assertUuid(id);
      [row] = await tx
        .update(studioReservations)
        .set({ ...vals, updatedAt: new Date() })
        .where(eq(studioReservations.id, id))
        .returning();
    } else
      [row] = await tx
        .insert(studioReservations)
        .values({ ...vals, status: "pending", createdById: actor.employeeId })
        .returning();
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
      remainingAmount: Number(row.price) - Number(row.paidAmount),
    };
  });
}
export async function completeReservation(actor: EmployeeContext, id: string) {
  assertUuid(id);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(studioReservations)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedById: actor.employeeId,
        updatedAt: new Date(),
      })
      .where(eq(studioReservations.id, id))
      .returning();
    if (!row) throw new ApiError(404, "رزرو یافت نشد.");
    await logAuditEvent(
      "RESERVATION_COMPLETED",
      "studio_reservation",
      id,
      { convertedToContract: false },
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
export async function deleteReservation(actor: EmployeeContext, id: string) {
  assertUuid(id);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(studioReservations)
      .where(eq(studioReservations.id, id))
      .returning();
    if (!row) throw new ApiError(404, "رزرو یافت نشد.");
    await logAuditEvent(
      "RESERVATION_DELETED",
      "studio_reservation",
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
  const [personnelOptions, equipmentOptions, defaultWages] = await Promise.all([
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
    db.select().from(studioPersonnelDefaultWages),
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
    defaultWages,
  };
}
export async function listDefaultWages(personnelId?: string) {
  if (personnelId) assertUuid(personnelId);
  return db
    .select()
    .from(studioPersonnelDefaultWages)
    .where(
      personnelId
        ? eq(studioPersonnelDefaultWages.personnelId, personnelId)
        : undefined,
    )
    .orderBy(asc(studioPersonnelDefaultWages.workTitle));
}
export async function saveDefaultWage(
  actor: EmployeeContext,
  personnelId: string,
  workTitle: unknown,
  amountInput: unknown,
) {
  assertUuid(personnelId);
  const title = cleanText(workTitle, "عنوان فعالیت", true, 120)!;
  const amount = money(amountInput, "دستمزد پیش‌فرض");
  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: studioPersonnel.id })
      .from(studioPersonnel)
      .where(eq(studioPersonnel.id, personnelId))
      .limit(1);
    if (!person) throw new ApiError(404, "پرسنل یافت نشد.");
    const [row] = await tx
      .insert(studioPersonnelDefaultWages)
      .values({ personnelId, workTitle: title, amount: amount.toFixed(2) })
      .onConflictDoUpdate({
        target: [
          studioPersonnelDefaultWages.personnelId,
          studioPersonnelDefaultWages.workTitle,
        ],
        set: { amount: amount.toFixed(2), updatedAt: new Date() },
      })
      .returning();
    await logAuditEvent(
      "PERSONNEL_DEFAULT_WAGE_SAVED",
      "studio_personnel",
      personnelId,
      { workTitle: title, amount },
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
    const conflict = await tx
      .select({ id: studioPlanningPersonnel.id })
      .from(studioPlanningPersonnel)
      .where(
        and(
          eq(studioPlanningPersonnel.personnelId, personnelId),
          ne(studioPlanningPersonnel.contractItemId, itemId),
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
    const [preset] = await tx
      .select()
      .from(studioPersonnelDefaultWages)
      .where(
        and(
          eq(studioPersonnelDefaultWages.personnelId, personnelId),
          eq(studioPersonnelDefaultWages.workTitle, info.item.title),
        ),
      )
      .limit(1);
    const wage =
      value.wageAmount === undefined || value.wageAmount === ""
        ? Number(preset?.amount || 0)
        : money(value.wageAmount, "دستمزد");
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
    return { ...row, defaultWage: Number(preset?.amount || 0) };
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
