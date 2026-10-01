import { db } from "@/db";
import { studioCatalog, studioProductionPlans, studioProductionSteps, studioProjects, studioTasks, studioWorkflowTemplates } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { ApiError } from "@/lib/apiError";
import type { Transaction } from "@/services/product";
import { object, text } from "./productValidation";

export type WorkflowStage = { title: string; stage: string; days: number };
const wedding: WorkflowStage[] = [
  { title: "مشاوره و انتخاب پکیج", stage: "consultation", days: -14 },
  { title: "قرارداد و تأیید بیعانه", stage: "contract", days: -10 },
  { title: "هماهنگی عوامل و لوکیشن", stage: "pre_production", days: -2 },
  { title: "عکاسی و تصویربرداری", stage: "shooting", days: 0 },
  { title: "تأیید نسخهٔ پشتیبان فایل‌های RAW", stage: "raw_backup", days: 1 },
  { title: "جلسهٔ انتخاب عکس", stage: "selection", days: 3 },
  { title: "رتوش عکس‌ها", stage: "retouch", days: 10 },
  { title: "تدوین و اصلاح رنگ ویدیو", stage: "video_edit", days: 15 },
  { title: "طراحی و چاپ آلبوم", stage: "album_print", days: 20 },
  { title: "کنترل کیفیت نهایی", stage: "final_qc", days: 25 },
  { title: "تحویل و تأیید مشتری", stage: "delivery", days: 30 },
];
export const BUILTIN_WORKFLOWS = [
  { id: "a1000000-0000-4000-8000-000000000001", name: "عروسی", jobType: "wedding", stages: wedding },
  { id: "a1000000-0000-4000-8000-000000000002", name: "پرتره", jobType: "portrait", stages: wedding.filter(s => !["video_edit", "album_print"].includes(s.stage)) },
  { id: "a1000000-0000-4000-8000-000000000003", name: "تجاری و تبلیغاتی", jobType: "commercial", stages: [
    { title: "بریف و برآورد پروژه", stage: "brief", days: -14 }, ...wedding.filter(s => !["consultation", "selection", "album_print"].includes(s.stage)),
  ] },
];
export function validateStages(value: unknown): WorkflowStage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) throw new ApiError(400, "گردش‌کار باید ۱ تا ۴۰ مرحله داشته باشد.");
  return value.map(v => {
    const row = object(v); const days = Number(row.days);
    if (!Number.isInteger(days) || Math.abs(days) > 730) throw new ApiError(400, "مهلت مرحله معتبر نیست.");
    return { title: text(row.title, true, 200)!, stage: text(row.stage, true, 80)!, days };
  });
}
export async function instantiateWorkflow(tx: Transaction, projectId: string, jobType: string, eventDate: Date, catalogItemId?: string | null) {
  let template: { id: string; stages: unknown } | undefined;
  if (catalogItemId) {
    const [item] = await tx.select().from(studioCatalog).where(and(eq(studioCatalog.id, catalogItemId), eq(studioCatalog.active, true)));
    if (!item || item.kind === "addon") throw new ApiError(400, "خدمت یا پکیج فعال را انتخاب کنید.");
    if (item.workflowTemplateId) [template] = await tx.select().from(studioWorkflowTemplates).where(eq(studioWorkflowTemplates.id, item.workflowTemplateId));
  }
  if (!template) [template] = await tx.select().from(studioWorkflowTemplates).where(and(eq(studioWorkflowTemplates.jobType, jobType), eq(studioWorkflowTemplates.active, true))).orderBy(asc(studioWorkflowTemplates.createdAt)).limit(1);
  const stages = validateStages(template?.stages || BUILTIN_WORKFLOWS.find(w => w.jobType === jobType)?.stages || BUILTIN_WORKFLOWS[1].stages);
  const [plan] = await tx.insert(studioProductionPlans).values({ studioProjectId: projectId, targetDeliveryDate: new Date(eventDate.getTime() + Math.max(...stages.map(s => s.days)) * 86400000), currentStage: stages[0].stage, workflowTemplateId: template?.id, workflowSnapshot: stages }).returning();
  let dependencyId: string | null = null;
  for (const [position, stage] of stages.entries()) {
    const dueDate = new Date(eventDate.getTime() + stage.days * 86400000);
    const [step] = await tx.insert(studioProductionSteps).values({ planId: plan.id, stepName: stage.title, deadline: dueDate }).returning();
    const taskRows: Array<{ id: string }> = await tx.insert(studioTasks).values({ studioProjectId: projectId, title: stage.title, stage: stage.stage, dueDate, position, productionStepId: step.id, dependencyId }).returning({ id: studioTasks.id });
    dependencyId = taskRows[0].id;
  }
  return plan;
}
export async function syncPlanStage(tx: Transaction, projectId: string) {
  const tasks = await tx.select().from(studioTasks).where(eq(studioTasks.studioProjectId, projectId)).orderBy(asc(studioTasks.position), asc(studioTasks.createdAt));
  const next = tasks.find(t => !["done", "cancelled"].includes(t.status));
  await tx.update(studioProductionPlans).set({ currentStage: next?.stage || "delivered", updatedAt: new Date() }).where(eq(studioProductionPlans.studioProjectId, projectId));
  const operationalStatus = !next ? "delivered" : next.stage === "shooting" ? "shooting" : ["raw_backup", "selection", "retouch", "video_edit", "album_print", "final_qc", "delivery", "revision"].includes(next.stage) ? "in_post_production" : "booked";
  await tx.update(studioProjects).set({ status: operationalStatus, updatedAt: new Date() }).where(and(eq(studioProjects.id, projectId), sql`${studioProjects.status} NOT IN ('cancelled','archived')`));
}
export async function ensureWorkflowTemplates(tx: Transaction) {
  for (const template of BUILTIN_WORKFLOWS) await tx.insert(studioWorkflowTemplates).values(template).onConflictDoNothing();
}
export async function lockProjectWorkflow(tx: Transaction, projectId: string) { await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"workflow:" + projectId}, 0))`); }
export type WorkflowDatabase = typeof db;
