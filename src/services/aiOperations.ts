import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ApiError, assertUuid } from "@/lib/apiError";
import { canAccessPermission, type EmployeeContext } from "@/services/access";
import { logAuditEvent } from "@/services/audit";

type Module = Record<string, unknown>;
type Operation = { label: string; permission: string; method: "GET" | "POST" | "PUT" | "DELETE"; load: () => Promise<Module> };
// Every handler performs its normal session, project-scope and business validation again.
export const AI_OPERATIONS: Record<string, Operation> = {
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
  personnel_create: { label: "ثبت پرسنل", permission: "studio.personnel.manage", method: "POST", load: () => import("@/app/api/studio/personnel/route") },
  personnel_access: { label: "تغییر دسترسی پرسنل و ابطال نشست قبلی", permission: "studio.personnel.manage", method: "PUT", load: () => import("@/app/api/atelier/personnel/[id]/access/route") },
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

type Parameters = { targetId?: string; params?: Record<string, string>; input?: Record<string, unknown>; query?: Record<string, string> };
export async function availableAIOperations(actor: EmployeeContext) {
  const allowed = await Promise.all(Object.entries(AI_OPERATIONS).map(async ([operation, item]) => await canAccessPermission(actor, item.permission) ? { operation, label: item.label, mutation: item.method !== "GET" } : null));
  return allowed.filter(Boolean);
}
async function authorize(actor: EmployeeContext, operation: string) {
  const tool = AI_OPERATIONS[operation];
  if (!tool || !await canAccessPermission(actor, "ai.use") || !await canAccessPermission(actor, tool.permission)) throw new ApiError(403, "این عملیات برای دستیار شما مجاز نیست.");
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
export async function prepareAIOperation(actor: EmployeeContext, operation: string, parameters: Parameters) {
  const tool = await authorize(actor, operation);
  if (JSON.stringify(parameters).length > 30000) throw new ApiError(400, "حجم درخواست بیش از حد مجاز است.");
  if (tool.method === "GET") return { result: await dispatch(tool, parameters) };
  const id = randomUUID();
  // Never persist credentials or accept arbitrary external destinations.
  if (/password|secret|token|api.?key/i.test(JSON.stringify(parameters))) throw new ApiError(400, "اطلاعات محرمانه را فقط در فرم امن تنظیمات وارد کنید.");
  let preview: Record<string, unknown> | null = null;
  if (operation === "contract_cancel") {
    const data = await dispatch({ ...tool, method: "GET" }, parameters);
    preview = data.preview;
  }
  const stored = { ...parameters, input: { ...parameters.input, ...(preview ? { token: preview.token, confirmed: true } : {}), idempotencyKey: `ai:${id}` } };
  await db.execute(sql`INSERT INTO atelier_ai_actions(id, actor_id, operation, target_id, parameters, expires_at) VALUES (${id}::uuid, ${actor.employeeId}::uuid, ${operation}, ${parameters.targetId || null}, ${JSON.stringify(stored)}::jsonb, now() + interval '10 minutes')`);
  return { confirmation: { id, label: tool.label, targetId: parameters.targetId || null, amount: preview?.received ?? parameters.input?.amount ?? null, parameters: stored, preview, consequences: "با تأیید، عملیات واقعی از مسیر معتبر برنامه انجام می‌شود. تغییر مالی فقط ثبت حسابداری است و انتقال بانکی انجام نمی‌دهد." } };
}
export async function executeAIOperation(actor: EmployeeContext, id: string, confirmed: unknown) {
  assertUuid(id);
  if (confirmed !== true) throw new ApiError(400, "تأیید صریح عملیات الزامی است.");
  const claimed = await db.execute(sql`UPDATE atelier_ai_actions SET status='processing', updated_at=now() WHERE id=${id}::uuid AND actor_id=${actor.employeeId}::uuid AND status='pending' AND expires_at > now() RETURNING operation, parameters, target_id`);
  const row = claimed.rows[0] as { operation: string; parameters: Parameters; target_id: string | null } | undefined;
  if (!row) throw new ApiError(409, "این درخواست منقضی شده، قبلاً اجرا شده یا متعلق به شما نیست. وضعیت رکورد را بررسی کنید.");
  const context = { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName };
  try {
    const tool = await authorize(actor, row.operation);
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
