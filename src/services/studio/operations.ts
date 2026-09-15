import { db } from "@/db";
import { studioDeliverables, studioPersonnel, studioProductionSteps, studioProjectTimelines, studioProjects, studioTasks } from "@/db/schema";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { ApiError, assertUuid } from "@/lib/apiError";
import type { EmployeeContext } from "@/services/access";
import { logAuditEvent } from "@/services/audit";
import { choice, date, object, safeLink, text, uuid } from "./productValidation";
import { lockProjectWorkflow, syncPlanStage } from "./workflow";
import { logProjectTimeline } from "./projectService";

const taskStatuses = ["open", "in_progress", "done", "cancelled"] as const;
const taskPriorities = ["low", "medium", "high", "urgent"] as const;
export async function listTasks(allowedCoreProjectIds: string[] | null, filters: { projectId?: string; assigneeId?: string; view?: string } = {}) {
  const conditions = [];
  if (allowedCoreProjectIds !== null) conditions.push(allowedCoreProjectIds.length ? inArray(studioProjects.projectId, allowedCoreProjectIds) : sql`false`);
  if (filters.projectId) conditions.push(eq(studioTasks.studioProjectId, filters.projectId));
  if (filters.assigneeId) conditions.push(eq(studioTasks.assignedPersonnelId, filters.assigneeId));
  const now = new Date(); const tomorrow = new Date(now.getTime() + 86400000);
  if (filters.view === "urgent") conditions.push(eq(studioTasks.priority, "urgent"));
  if (filters.view === "overdue") conditions.push(and(lt(studioTasks.dueDate, now), inArray(studioTasks.status, ["open", "in_progress"]))!);
  if (filters.view === "today") conditions.push(and(sql`${studioTasks.dueDate} >= ${new Date(now.toISOString().slice(0,10))}`, lt(studioTasks.dueDate, tomorrow))!);
  return db.select({ id: studioTasks.id, studioProjectId: studioTasks.studioProjectId, projectTitle: studioProjects.title, projectNumber: studioProjects.projectNumber, assignedPersonnelId: studioTasks.assignedPersonnelId, assigneeName: studioPersonnel.fullName, title: studioTasks.title, description: studioTasks.description, stage: studioTasks.stage, priority: studioTasks.priority, status: studioTasks.status, dueDate: studioTasks.dueDate, blocker: studioTasks.blocker, dependencyId: studioTasks.dependencyId, position: studioTasks.position, completedAt: studioTasks.completedAt })
    .from(studioTasks).innerJoin(studioProjects, eq(studioTasks.studioProjectId, studioProjects.id)).leftJoin(studioPersonnel, eq(studioTasks.assignedPersonnelId, studioPersonnel.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(studioTasks.dueDate), desc(studioTasks.priority));
}
export async function saveTask(actor: EmployeeContext, projectId: string, value: unknown, id?: string) {
  assertUuid(projectId); const body = object(value);
  return db.transaction(async tx => {
    await lockProjectWorkflow(tx, projectId);
    let prior: typeof studioTasks.$inferSelect | undefined;
    if (id) { assertUuid(id); [prior] = await tx.select().from(studioTasks).where(and(eq(studioTasks.id,id),eq(studioTasks.studioProjectId,projectId))); if (!prior) throw new ApiError(404,"کار یافت نشد."); }
    const dependencyId = uuid(body.dependencyId);
    if (dependencyId === id) throw new ApiError(400,"یک کار نمی‌تواند به خودش وابسته باشد.");
    if (dependencyId) {
      const [dependency] = await tx.select().from(studioTasks).where(and(eq(studioTasks.id,dependencyId),eq(studioTasks.studioProjectId,projectId)));
      if (!dependency) throw new ApiError(400,"کار وابسته باید متعلق به همین پروژه باشد.");
      // Follow the dependency chain under the project workflow lock so A -> B -> A
      // (including longer cycles) can never be persisted.
      if (id) {
        let cursor: string | null = dependency.dependencyId;
        const visited = new Set<string>([dependencyId]);
        while (cursor) {
          if (cursor === id || visited.has(cursor)) throw new ApiError(400,"چرخه وابستگی بین کارها مجاز نیست.");
          visited.add(cursor);
          const [parent] = await tx.select({ dependencyId: studioTasks.dependencyId }).from(studioTasks).where(and(eq(studioTasks.id,cursor),eq(studioTasks.studioProjectId,projectId)));
          cursor = parent?.dependencyId || null;
        }
      }
    }
    const status = choice(body.status, taskStatuses, prior?.status || "open");
    if (status === "done" && dependencyId) { const [dependency] = await tx.select().from(studioTasks).where(eq(studioTasks.id,dependencyId)); if (dependency && dependency.status !== "done") throw new ApiError(409,"ابتدا کار وابسته را تکمیل کنید."); }
    const values = { title: text(body.title, true, 250)!, description: text(body.description), assignedPersonnelId: uuid(body.assignedPersonnelId), stage: text(body.stage, true, 80)!, priority: choice(body.priority,taskPriorities,"medium"), status, dueDate: date(body.dueDate), blocker: text(body.blocker), dependencyId, completedAt: status === "done" ? prior?.completedAt || new Date() : null, updatedAt: new Date() };
    const [saved] = id ? await tx.update(studioTasks).set(values).where(eq(studioTasks.id,id)).returning() : await tx.insert(studioTasks).values({studioProjectId:projectId,...values}).returning();
    if (saved.productionStepId) await tx.update(studioProductionSteps).set({ status: status === "done" ? "completed" : status === "in_progress" ? "in_progress" : "pending", completedAt: saved.completedAt, updatedAt:new Date() }).where(eq(studioProductionSteps.id,saved.productionStepId));
    await syncPlanStage(tx, projectId);
    await logProjectTimeline(projectId,{actionType:"TASK_UPDATED",title:status === "done" ? "تکمیل کار" : id ? "ویرایش کار" : "ایجاد کار",description:saved.title,authorName:actor.employeeName,actorEmployeeId:actor.employeeId,metadata:{taskId:saved.id,status}},tx);
    await logAuditEvent("STUDIO_TASK_SAVED","studio_task",saved.id,{studioProjectId:projectId,status},{employeeId:actor.employeeId,userName:actor.employeeName},tx);
    return saved;
  });
}

const deliverableStatuses = ["pending","in_progress","ready","delivered","confirmed"] as const;
export async function listDeliverables(projectId: string) { assertUuid(projectId); return db.select().from(studioDeliverables).where(eq(studioDeliverables.studioProjectId,projectId)).orderBy(asc(studioDeliverables.dueDate),asc(studioDeliverables.createdAt)); }
export async function saveDeliverable(actor: EmployeeContext, projectId: string, value: unknown, id?: string) {
  assertUuid(projectId); const body=object(value); const status=choice(body.status,deliverableStatuses,"pending");
  const values={kind:text(body.kind,true,80)!,title:text(body.title,true,250)!,url:safeLink(body.url),storageLocation:text(body.storageLocation),status,dueDate:date(body.dueDate),deliveredAt:status==="delivered"||status==="confirmed"?new Date():null,confirmedAt:status==="confirmed"?new Date():null,notes:text(body.notes),updatedAt:new Date()};
  return db.transaction(async tx=>{let saved;if(id){assertUuid(id);[saved]=await tx.update(studioDeliverables).set(values).where(and(eq(studioDeliverables.id,id),eq(studioDeliverables.studioProjectId,projectId))).returning();}else [saved]=await tx.insert(studioDeliverables).values({studioProjectId:projectId,...values}).returning();if(!saved)throw new ApiError(404,"تحویل‌دادنی یافت نشد.");await logProjectTimeline(projectId,{actionType:"DELIVERABLE_UPDATED",title:`${saved.title}: ${status}`,authorName:actor.employeeName,actorEmployeeId:actor.employeeId,metadata:{deliverableId:saved.id,status}},tx);await logAuditEvent("STUDIO_DELIVERABLE_SAVED","studio_deliverable",saved.id,{studioProjectId:projectId,status},{employeeId:actor.employeeId,userName:actor.employeeName},tx);return saved;});
}
