import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studioCustomerTasks, studioProjects, studioContracts, studioTasks } from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/apiError";
import { requireStudioCustomerAccess, requireStudioProjectAccess } from "./access";
import { logAuditEvent } from "@/services/audit";

export async function saveCustomerTask(customerId: string, input: Record<string, unknown>) {
  const actor = await requireStudioCustomerAccess(customerId, "studio.planning.manage");
  const status = input.status ?? "pending";
  if (!["pending", "done", "cancelled"].includes(String(status))) throw new ApiError(400, "وضعیت نامعتبر است.");
  if (input.sourceType && input.sourceType !== "manual") {
    if (input.sourceType !== "task") throw new ApiError(409, "تغییر این برنامه باید از صفحه منبع انجام شود؛ ابطال قرارداد فقط از مسیر ابطال و برگشت وجه مجاز است.", "SOURCE_WORKFLOW_REQUIRED");
    assertUuid(input.sourceId);
    const [row] = await db.select({ task: studioTasks, project: studioProjects }).from(studioTasks).innerJoin(studioProjects, eq(studioProjects.id, studioTasks.studioProjectId)).where(eq(studioTasks.id, input.sourceId)).limit(1);
    if (!row || row.project.studioCustomerId !== customerId) throw new ApiError(404, "کار یافت نشد.");
    await requireStudioProjectAccess(row.project.id, "studio.planning.manage");
    return db.transaction(async tx => {
      const [saved] = await tx.update(studioTasks).set({ status: status === "pending" ? "open" : String(status), completedAt: status === "done" ? new Date() : null, updatedAt: new Date() }).where(eq(studioTasks.id, row.task.id)).returning();
      await logAuditEvent("CUSTOMER_LINKED_TASK_STATUS", "studio_task", row.task.id, { status }, { employeeId: actor.employeeId, userId: actor.employeeId }, tx);
      return saved;
    });
  }
  if (input.id) {
    assertUuid(input.id);
    const [existing] = await db.select().from(studioCustomerTasks).where(and(eq(studioCustomerTasks.id, input.id as string), eq(studioCustomerTasks.studioCustomerId, customerId))).limit(1);
    if (!existing) throw new ApiError(404, "کار یافت نشد.");
    if (existing.studioProjectId) await requireStudioProjectAccess(existing.studioProjectId, "studio.planning.manage");
    return db.transaction(async tx => {
      const [saved] = await tx.update(studioCustomerTasks).set({ status: String(status), updatedAt: new Date() }).where(and(eq(studioCustomerTasks.id, input.id as string), eq(studioCustomerTasks.studioCustomerId, customerId))).returning();
      if (!saved) throw new ApiError(404, "کار یافت نشد.");
      await logAuditEvent("CUSTOMER_MANUAL_TASK_STATUS", "studio_customer_task", saved.id, { status }, { employeeId: actor.employeeId, userId: actor.employeeId }, tx);
      return saved;
    });
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 180) throw new ApiError(400, "عنوان معتبر لازم است.");
  const notes = typeof input.notes === "string" ? input.notes.trim() : null;
  if (notes && notes.length > 5000) throw new ApiError(400, "توضیحات طولانی است.");
  const dueDate = input.date ? new Date(String(input.date)) : null;
  if (dueDate && !Number.isFinite(+dueDate)) throw new ApiError(400, "تاریخ نامعتبر است.");
  let studioProjectId: string | null = null, contractId: string | null = null;
  if (input.projectId) { assertUuid(input.projectId); studioProjectId = input.projectId as string; }
  if (input.contractId) { assertUuid(input.contractId); contractId = input.contractId as string; const [contract] = await db.select().from(studioContracts).where(eq(studioContracts.id, contractId)).limit(1); if (!contract || (studioProjectId && contract.studioProjectId !== studioProjectId)) throw new ApiError(400, "قرارداد نامعتبر است."); studioProjectId = contract.studioProjectId; }
  if (studioProjectId) { const [project] = await db.select().from(studioProjects).where(eq(studioProjects.id, studioProjectId)).limit(1); if (!project || project.studioCustomerId !== customerId) throw new ApiError(400, "پروژه متعلق به این مشتری نیست."); await requireStudioProjectAccess(studioProjectId, "studio.planning.manage"); }
  return db.transaction(async tx => {
    const [saved] = await tx.insert(studioCustomerTasks).values({ studioCustomerId: customerId, studioProjectId, contractId, title, notes, dueDate, status: String(status), createdBy: actor.employeeId }).returning();
    await logAuditEvent("CUSTOMER_MANUAL_TASK_CREATED", "studio_customer_task", saved.id, { title, status }, { employeeId: actor.employeeId, userId: actor.employeeId }, tx);
    return saved;
  });
}
