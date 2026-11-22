import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ApiError, assertUuid } from "@/lib/apiError";
import { assertAIAdministrator, canAccessPermission, type EmployeeContext } from "@/services/access";
import type { CustomerProfileData } from "@/lib/customerProfile";
import { logAuditEvent } from "@/services/audit";

type Module = Record<string, unknown>;
type Operation = { label: string; permission: string; method: "GET" | "POST" | "PUT" | "DELETE"; load: () => Promise<Module> };
// Every handler performs its normal session, project-scope and business validation again.
export const AI_OPERATIONS: Record<string, Operation> = {
  customer_read: { label: "مشاهده پرونده مشتری، پروژه‌ها و سوابق", permission: "studio.customers.view", method: "GET", load: () => import("@/app/api/atelier/customers/[id]/route") },
  contract_read: { label: "مشاهده جزئیات قرارداد", permission: "studio.contract.view", method: "GET", load: () => import("@/app/api/atelier/contracts/[id]/route") },
  projects_list: { label: "مشاهده پروژه‌ها", permission: "studio.view", method: "GET", load: () => import("@/app/api/studio/projects/route") },
  personnel_read: { label: "مشاهده پرونده پرسنل و سوابق دستمزد", permission: "studio.personnel.view", method: "GET", load: () => import("@/app/api/studio/personnel/[id]/route") },
  equipment_read: { label: "مشاهده تجهیز و رزروهای آن", permission: "studio.equipment.view", method: "GET", load: () => import("@/app/api/studio/equipment/[id]/route") },
  customers_list: { label: "مشاهده مشتریان", permission: "studio.customers.view", method: "GET", load: () => import("@/app/api/atelier/customers/route") },
  customer_update: { label: "ویرایش مشتری", permission: "studio.customers.edit", method: "PUT", load: () => import("@/app/api/atelier/customers/[id]/route") },
  customer_task_create: { label: "افزودن کار مشتری", permission: "studio.planning.manage", method: "POST", load: () => import("@/app/api/atelier/customers/[id]/tasks/route") },
  contracts_list: { label: "مشاهده قراردادها", permission: "studio.contract.view", method: "GET", load: () => import("@/app/api/atelier/contracts/route") },
  contract_create: { label: "ثبت پیش‌قرارداد", permission: "studio.contract.create", method: "POST", load: () => import("@/app/api/atelier/contracts/route") },
  contract_update: { label: "ویرایش قرارداد", permission: "studio.contract.edit", method: "PUT", load: () => import("@/app/api/atelier/contracts/[id]/route") },
  contract_approve: { label: "تأیید قرارداد", permission: "studio.contract.approve", method: "POST", load: () => import("@/app/api/atelier/contracts/[id]/approve/route") },
  contract_delete_draft: { label: "حذف پیش‌قرارداد بدون سابقه مالی", permission: "studio.contract.delete_draft", method: "DELETE", load: () => import("@/app/api/atelier/contracts/[id]/route") },
  contract_cancel: { label: "ابطال قرارداد و برگشت حسابداری وجوه", permission: "studio.contract.cancel", method: "POST", load: () => import("@/app/api/atelier/contracts/[id]/cancellation/route") },
  reservations_list: { label: "مشاهده رزروهای مجاز", permission: "studio.reservations.view", method: "GET", load: () => import("@/app/api/atelier/reservations/route") },
  reservation_create: { label: "ثبت رزرو", permission: "studio.reservations.create", method: "POST", load: () => import("@/app/api/atelier/reservations/route") },
  reservation_update: { label: "ویرایش رزرو", permission: "studio.reservations.edit", method: "PUT", load: () => import("@/app/api/atelier/reservations/[id]/route") },
  planning_list: { label: "مشاهده برنامه‌ریزی", permission: "studio.planning.view", method: "GET", load: () => import("@/app/api/atelier/planning/route") },
  planning_personnel_assign: { label: "تخصیص پرسنل به برنامه", permission: "studio.planning.manage", method: "POST", load: () => import("@/app/api/atelier/planning/[itemId]/personnel/route") },
  planning_equipment_assign: { label: "تخصیص تجهیز به برنامه", permission: "studio.planning.manage", method: "POST", load: () => import("@/app/api/atelier/planning/[itemId]/equipment/route") },
  planning_rental_create: { label: "ثبت اجاره تجهیز برنامه", permission: "studio.planning.manage", method: "POST", load: () => import("@/app/api/atelier/planning/[itemId]/rentals/route") },
  daily_visits_list: { label: "مشاهده مراجعات روزانه", permission: "studio.daily_visits.view", method: "GET", load: () => import("@/app/api/atelier/daily-visits/route") },
  daily_visit_create: { label: "ثبت مراجعه روزانه", permission: "studio.daily_visits.manage", method: "POST", load: () => import("@/app/api/atelier/daily-visits/route") },
  reports_read: { label: "مشاهده گزارش‌ها", permission: "reports.view", method: "GET", load: () => import("@/app/api/studio/reports/route") },
  customer_create: { label: "ثبت مشتری", permission: "studio.customers.create", method: "POST", load: () => import("@/app/api/studio/customers/route") },
  calendar_read: { label: "مشاهده تقویم", permission: "studio.calendar.view", method: "GET", load: () => import("@/app/api/atelier/calendar/route") },
  personnel_list: { label: "مشاهده پرسنل", permission: "studio.personnel.view", method: "GET", load: () => import("@/app/api/studio/personnel/route") },
  personnel_update: { label: "ویرایش مشخصات پرسنل", permission: "studio.personnel.manage", method: "PUT", load: () => import("@/app/api/studio/personnel/[id]/route") },
  personnel_create: { label: "ثبت پرسنل", permission: "studio.personnel.manage", method: "POST", load: () => import("@/app/api/studio/personnel/route") },
  wage_pay: { label: "پرداخت دستمزد و کسر از حساب", permission: "studio.personnel.finance.pay", method: "POST", load: () => import("@/app/api/atelier/personnel/[id]/finance/[salaryId]/pay/route") },
  equipment_list: { label: "مشاهده تجهیزات", permission: "studio.equipment.view", method: "GET", load: () => import("@/app/api/studio/equipment/route") },
  equipment_create: { label: "ثبت تجهیز", permission: "studio.equipment.manage", method: "POST", load: () => import("@/app/api/studio/equipment/route") },
  equipment_update: { label: "ویرایش تجهیز", permission: "studio.equipment.manage", method: "PUT", load: () => import("@/app/api/studio/equipment/[id]/route") },
  finance_read: { label: "مشاهده مرکز مالی", permission: "studio.finance.view", method: "GET", load: () => import("@/app/api/atelier/finance/route") },
  receipt_create: { label: "ثبت دریافت در سیستم مالی", permission: "studio.finance.create_receipt", method: "POST", load: () => import("@/app/api/atelier/finance/receipts/route") },
  expense_create: { label: "ثبت هزینه در سیستم مالی", permission: "studio.finance.create_expense", method: "POST", load: () => import("@/app/api/atelier/finance/expenses/route") },
  settings_read: { label: "مشاهده تنظیمات", permission: "settings.view", method: "GET", load: () => import("@/app/api/atelier/settings/route") },
  settings_update: { label: "ویرایش تنظیمات", permission: "settings.manage", method: "PUT", load: () => import("@/app/api/atelier/settings/route") },
};

const deliberateConfirmation = "تأیید عملیات";
const highRiskConsequences: Record<string, string> = {
  contract_approve: "تأیید قرارداد می‌تواند تعهد مالی و فاکتور ایجاد کند.",
  contract_delete_draft: "پیش‌قرارداد پس از بررسی وابستگی‌های مالی حذف می‌شود.",
  contract_cancel: "ابطال قرارداد وضعیت قرارداد، تعهدات و سندهای برگشت حسابداری را تغییر می‌دهد.",
  wage_pay: "پرداخت دستمزد در حساب مالی ثبت می‌شود و مانده تعهد دستمزد تغییر می‌کند.",
  receipt_create: "دریافت در حساب مالی ثبت می‌شود و ممکن است مانده فاکتور را تغییر دهد.",
  expense_create: "هزینه ثبت می‌شود و در صورت انتخاب پرداخت، از مانده حساب مالی کسر خواهد شد.",
};

type Parameters = { targetId?: string; params?: Record<string, string>; input?: Record<string, unknown>; query?: Record<string, string> };
export function isAIReadOperation(operation: string) {
  return Object.hasOwn(AI_OPERATIONS, operation) && AI_OPERATIONS[operation].method === "GET";
}

export async function availableAIOperations(actor: EmployeeContext) {
  assertAIAdministrator(actor);
  const allowed = await Promise.all(Object.entries(AI_OPERATIONS).map(async ([operation, item]) => await canAccessPermission(actor, item.permission) ? { operation, label: item.label, mutation: item.method !== "GET" } : null));
  return allowed.filter(Boolean);
}
async function authorize(actor: EmployeeContext, operation: string) {
  assertAIAdministrator(actor);
  const tool = Object.hasOwn(AI_OPERATIONS, operation) ? AI_OPERATIONS[operation] : undefined;
  if (!tool || !await canAccessPermission(actor, tool.permission)) throw new ApiError(403, "این عملیات برای دستیار شما مجاز نیست.");
  return tool;
}
async function dispatch(tool: Operation, parameters: Parameters) {
  const handlers = await tool.load();
  const handler = handlers[tool.method] as ((req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>) | undefined;
  if (!handler) throw new ApiError(400, "این عملیات در برنامه پشتیبانی نمی‌شود.");
  const url = new URL("http://atelier.internal/api/ai/operation");
  for (const [key, value] of Object.entries(parameters.query || {})) url.searchParams.set(key, String(value));
  const request = new NextRequest(url, { method: tool.method, headers: { "Content-Type": "application/json" }, ...(tool.method !== "GET" ? { body: JSON.stringify(parameters.input || {}) } : {}) });
  const response = await handler(request, { params: Promise.resolve({ ...parameters.params, ...(parameters.targetId ? { id: parameters.targetId } : {}) }) });
  const result = await response.json();
  if (!response.ok || result.success === false) throw new ApiError(response.status >= 400 ? response.status : 400, result.error || "عملیات انجام نشد.");
  return result;
}
const customerPreviewLabels = {
  name: "نام مشتری",
  mobile: "شماره همراه",
  phone: "تلفن دوم",
  email: "ایمیل",
  storeName: "نام مجموعه",
  city: "شهر",
  region: "منطقه",
  postalCode: "کد پستی",
  address: "آدرس",
} as const;

async function prepareCustomerUpdate(tool: Operation, parameters: Parameters) {
  assertUuid(parameters.targetId);
  const { profile } = await dispatch({ ...tool, method: "GET" }, { targetId: parameters.targetId }) as { profile: CustomerProfileData };
  const customer = profile.customer;
  const comparison: Array<{ field: string; before: string | null; after: string | null }> = [];
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters.input || {})) {
    if (!Object.hasOwn(customerPreviewLabels, key)) throw new ApiError(400, "این فیلد در پیش‌نمایش ویرایش مشتری پشتیبانی نمی‌شود.");
    const field = key as keyof typeof customerPreviewLabels;
    if (value !== null && typeof value !== "string") throw new ApiError(400, "مقدار پیشنهادی معتبر نیست.");
    const after = value?.trim() || null;
    if (field === "name" && (!after || after.length > 200)) throw new ApiError(400, "نام مشتری معتبر نیست.");
    if (field === "mobile" && (!after || after.length !== 11 || !/^09[0-9]+$/.test(after))) throw new ApiError(400, "شماره همراه معتبر نیست.");
    if (field === "email" && after && (after.length > 254 || !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(after))) throw new ApiError(400, "ایمیل معتبر نیست.");
    if (after && after.length > 2000) throw new ApiError(400, "مقدار پیشنهادی بیش از حد طولانی است.");
    const before = customer[field] ?? null;
    if (before === after) continue;
    comparison.push({ field: customerPreviewLabels[field], before, after });
    input[field] = after;
  }
  if (!comparison.length) throw new ApiError(400, "پیشنهاد شامل تغییری در پرونده مشتری نیست.");
  return {
    comparison,
    input: { ...input, expectedRevision: { customer: customer.updatedAt, studio: customer.studio.updatedAt } },
  };
}

const profileEdits: Record<string, { resultKey: string; fields: Record<string, string>; required: string[] }> = {
  equipment_update: {
    resultKey: "equipment",
    fields: { title: "عنوان تجهیز", category: "دسته", brand: "برند", model: "مدل", serialNumber: "شماره سریال", notes: "یادداشت" },
    required: ["title", "category"],
  },
  personnel_update: {
    resultKey: "personnel",
    fields: { fullName: "نام پرسنل", primaryRole: "نقش کاری", portfolioUrl: "پیوند نمونه‌کار", notes: "یادداشت" },
    required: ["fullName", "primaryRole"],
  },
};

async function prepareRecordUpdate(tool: Operation, parameters: Parameters, config: (typeof profileEdits)[string]) {
  assertUuid(parameters.targetId);
  const record = (await dispatch({ ...tool, method: "GET" }, { targetId: parameters.targetId }))[config.resultKey];
  if (typeof record?.updatedAt !== "string") throw new ApiError(409, "نسخه رکورد برای پیش‌نمایش قابل بررسی نیست.");
  const comparison: Array<{ field: string; before: string | null; after: string | null }> = [];
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters.input || {})) {
    if (!Object.hasOwn(config.fields, key) || (value !== null && typeof value !== "string")) throw new ApiError(400, "فیلد پیشنهادی قابل ویرایش نیست.");
    const after = value?.trim() || null;
    if ((!after && config.required.includes(key)) || (after && after.length > 2000)) throw new ApiError(400, "مقدار پیشنهادی معتبر نیست.");
    const before = typeof record[key] === "string" ? record[key] : null;
    if (before === after) continue;
    comparison.push({ field: config.fields[key], before, after });
    input[key] = after;
  }
  if (!comparison.length) throw new ApiError(400, "پیشنهاد شامل تغییری در رکورد نیست.");
  return { comparison, input: { ...input, expectedRevision: record.updatedAt } };
}

export async function prepareAIOperation(actor: EmployeeContext, operation: string, parameters: Parameters) {
  const tool = await authorize(actor, operation);
  if (JSON.stringify(parameters).length > 30000) throw new ApiError(400, "حجم درخواست بیش از حد مجاز است.");
  if (tool.method === "GET") {
    const query = { ...parameters.query };
    for (const field of ["limit", "pageSize"]) {
      const requested = Number(query[field] ?? 20);
      query[field] = String(Number.isInteger(requested) && requested > 0 ? Math.min(requested, 20) : 20);
    }
    return { result: await dispatch(tool, { ...parameters, query }) };
  }
  const id = randomUUID();
  // Never persist credentials or accept arbitrary external destinations.
  if (/password|secret|token|api.?key/i.test(JSON.stringify(parameters))) throw new ApiError(400, "اطلاعات محرمانه را فقط در فرم امن تنظیمات وارد کنید.");
  const change = operation === "customer_update"
    ? await prepareCustomerUpdate(tool, parameters)
    : Object.hasOwn(profileEdits, operation) ? await prepareRecordUpdate(tool, parameters, profileEdits[operation]) : null;
  let preview: Record<string, unknown> | null = null;
  if (operation === "contract_cancel") {
    const data = await dispatch({ ...tool, method: "GET" }, parameters);
    preview = data.preview;
  }
  const stored = { ...parameters, input: { ...(change?.input ?? parameters.input), ...(preview ? { token: preview.token, confirmed: true } : {}), idempotencyKey: `ai:${id}` } };
  await db.execute(sql`INSERT INTO atelier_ai_actions(id, actor_id, operation, target_id, parameters, expires_at) VALUES (${id}::uuid, ${actor.employeeId}::uuid, ${operation}, ${parameters.targetId || null}, ${JSON.stringify(stored)}::jsonb, now() + interval '10 minutes')`);
  return { confirmation: { id, label: tool.label, targetId: parameters.targetId || null, amount: preview?.received ?? parameters.input?.amount ?? null, parameters: { input: change ? undefined : parameters.input }, preview: preview ? Object.fromEntries(Object.entries(preview).filter(([key]) => key !== "token")) : null, comparison: change?.comparison ?? null, requiredPhrase: highRiskConsequences[operation] ? deliberateConfirmation : null, consequences: highRiskConsequences[operation] || "با تأیید، تغییر از مسیر ثبت و اعتبارسنجی برنامه اعمال می‌شود." } };
}
export async function cancelAIOperation(actor: EmployeeContext, id: string) {
  assertAIAdministrator(actor);
  assertUuid(id);
  const cancelled = await db.execute(sql`UPDATE atelier_ai_actions SET status='cancelled', updated_at=now() WHERE id=${id}::uuid AND actor_id=${actor.employeeId}::uuid AND status='pending' AND expires_at > now() RETURNING id`);
  if (!cancelled.rows.length) throw new ApiError(409, "این پیشنهاد دیگر قابل لغو نیست.");
}

export async function executeAIOperation(actor: EmployeeContext, id: string, confirmed: unknown, phrase?: unknown) {
  assertAIAdministrator(actor);
  assertUuid(id);
  if (confirmed !== true) throw new ApiError(400, "تأیید صریح عملیات الزامی است.");
  if (phrase !== deliberateConfirmation) {
    const pending = await db.execute(sql`SELECT operation FROM atelier_ai_actions WHERE id=${id}::uuid AND actor_id=${actor.employeeId}::uuid AND status='pending' AND expires_at > now()`);
    const operation = pending.rows[0]?.operation;
    if (typeof operation === "string" && Object.hasOwn(highRiskConsequences, operation)) {
      throw new ApiError(400, "برای این عملیات باید عبارت تأیید را وارد کنید.", "AI_DELIBERATE_CONFIRMATION_REQUIRED");
    }
  }
  const claimed = await db.execute(sql`UPDATE atelier_ai_actions SET status='processing', updated_at=now() WHERE id=${id}::uuid AND actor_id=${actor.employeeId}::uuid AND status='pending' AND expires_at > now() RETURNING operation, parameters, target_id`);
  const row = claimed.rows[0] as { operation: string; parameters: Parameters; target_id: string | null } | undefined;
  if (!row) throw new ApiError(409, "این درخواست منقضی شده، قبلاً اجرا شده یا متعلق به شما نیست. وضعیت رکورد را بررسی کنید.");
  const context = { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName };
  try {
    const tool = await authorize(actor, row.operation);
    if ((row.operation === "customer_update" || Object.hasOwn(profileEdits, row.operation)) && !row.parameters.input?.expectedRevision) throw new ApiError(409, "برای این درخواست پیش‌نمایش تازه‌ای تهیه کنید.");
    await logAuditEvent("AI_OPERATION_STARTED", "ai_operation", id, { operation: row.operation, target: row.target_id, correlationId: id }, context);
    const result = await dispatch(tool, row.parameters);
    await db.execute(sql`UPDATE atelier_ai_actions SET status='succeeded', result=${JSON.stringify(result)}::jsonb, updated_at=now() WHERE id=${id}::uuid`);
    await logAuditEvent("AI_OPERATION_SUCCEEDED", "ai_operation", id, { operation: row.operation, target: row.target_id, correlationId: id }, context);
    return result;
  } catch (error) {
    await db.execute(sql`UPDATE atelier_ai_actions SET status='failed', updated_at=now() WHERE id=${id}::uuid`);
    await logAuditEvent("AI_OPERATION_FAILED", "ai_operation", id, { operation: row.operation, target: row.target_id, correlationId: id, error: error instanceof ApiError ? error.message : "operation_failed" }, context);
    throw error;
  }
}
