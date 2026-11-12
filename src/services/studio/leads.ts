import { db } from "@/db";
import { employees, employeeProjectAssignments, studioCalendarEvents, studioLeads } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { ApiError, assertUuid, decimal } from "@/lib/apiError";
import type { EmployeeContext } from "@/services/access";
import { logAuditEvent } from "@/services/audit";
import { createStudioCustomer } from "./customerService";
import { createStudioProject } from "./projectService";
import { choice, date, object, text, uuid } from "./productValidation";

export const LEAD_STAGES = ["lead", "contact", "consultation", "proposal", "contract_pending", "booked", "lost", "converted"] as const;
export function leadScope(actor: EmployeeContext) { return actor.permissions.has("*") ? undefined : eq(studioLeads.assignedEmployeeId, actor.employeeId); }
export async function listLeads(actor: EmployeeContext) {
  return db.select().from(studioLeads).where(leadScope(actor)).orderBy(desc(studioLeads.updatedAt));
}
export async function ownedLead(actor: EmployeeContext, id: string, client: typeof db | import("@/services/product").Transaction = db) {
  assertUuid(id);
  const [lead] = await client.select().from(studioLeads).where(and(eq(studioLeads.id, id), leadScope(actor)));
  if (!lead) throw new ApiError(404, "سرنخ یافت نشد یا در حوزهٔ دسترسی شما نیست.");
  return lead;
}
export async function saveLead(actor: EmployeeContext, value: unknown, id?: string) {
  const body = object(value);
  const mobile = text(body.mobile, true, 11)!;
  if (!/^09\d{9}$/.test(mobile)) throw new ApiError(400, "شماره همراه معتبر نیست.");
  const stage = choice(body.stage, LEAD_STAGES.filter(s => s !== "converted"), "lead");
  const lostReason = text(body.lostReason);
  if (stage === "lost" && !lostReason) throw new ApiError(400, "علت از دست رفتن سرنخ الزامی است.");
  const assignedEmployeeId = uuid(body.assignedEmployeeId) || actor.employeeId;
  if (assignedEmployeeId !== actor.employeeId && !actor.permissions.has("*")) throw new ApiError(403, "تغییر مسئول سرنخ به دسترسی مدیر نیاز دارد.");
  return db.transaction(async tx => {
    if (id) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"lead:" + id}, 0))`);
      if ((await ownedLead(actor, id, tx)).convertedProjectId) throw new ApiError(409, "سرنخ تبدیل‌شده را از پروندهٔ پروژه پیگیری کنید.");
    }
    const [owner] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, assignedEmployeeId), eq(employees.status, "active")));
    if (!owner) throw new ApiError(400, "مسئول فعال یافت نشد.");
    const values = { name: text(body.name, true, 200)!, mobile, source: text(body.source), eventType: text(body.eventType) || "wedding", desiredDate: date(body.desiredDate), location: text(body.location), budget: body.budget === undefined || body.budget === "" ? null : decimal(body.budget, "بودجه", 2), stage, assignedEmployeeId, nextFollowUp: date(body.nextFollowUp), lastContactAt: date(body.lastContactAt), lostReason, notes: text(body.notes), catalogItemId: uuid(body.catalogItemId), updatedAt: new Date() };
    const [saved] = id ? await tx.update(studioLeads).set(values).where(eq(studioLeads.id, id)).returning() : await tx.insert(studioLeads).values(values).returning();
    await logAuditEvent(id ? "STUDIO_LEAD_UPDATED" : "STUDIO_LEAD_CREATED", "studio_lead", saved.id, { stage }, { employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return saved;
  });
}
export async function convertLead(actor: EmployeeContext, id: string) {
  assertUuid(id);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"lead:" + id}, 0))`);
    const lead = await ownedLead(actor, id, tx);
    if (lead.convertedProjectId) return { projectId: lead.convertedProjectId, reused: true };
    if (!lead.desiredDate || lead.stage === "lost") throw new ApiError(400, "تاریخ پروژه را مشخص کنید و سرنخ را از وضعیت از دست رفته خارج کنید.");
    const allowedTypes = ["wedding", "portrait", "commercial", "child", "event", "family", "industrial", "modeling"] as const;
    const eventType = allowedTypes.includes(lead.eventType as typeof allowedTypes[number]) ? lead.eventType as typeof allowedTypes[number] : "event";
    const client = await createStudioCustomer({ name: lead.name, mobile: lead.mobile, customerType: eventType, referrer: lead.source, notes: lead.notes }, tx, true);
    const project = await createStudioProject({ studioCustomerId: client.id, title: `${lead.name} — ${lead.eventType}`, eventType, eventDate: lead.desiredDate, mainLocation: lead.location, notes: lead.notes, catalogItemId: lead.catalogItemId, actorId: actor.employeeId, authorName: actor.employeeName, managerEmployeeId: actor.employeeId, status: "booked" }, tx);
    // A newly-created job belongs to its creator; no access is granted to other projects.
    await tx.insert(employeeProjectAssignments).values({ employeeId: actor.employeeId, projectId: project.projectId!, status: "active", permissionSet: {} }).onConflictDoNothing();
    await tx.update(studioLeads).set({ convertedProjectId: project.id, stage: "converted", updatedAt: new Date() }).where(eq(studioLeads.id, id));
    await logAuditEvent("STUDIO_LEAD_CONVERTED", "studio_lead", id, { projectId: project.projectId, studioProjectId: project.id, studioCustomerId: client.id }, { employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return { projectId: project.id, reused: false };
  });
}
export async function scheduleLeadConsultation(actor: EmployeeContext, id: string, startInput?: unknown) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"lead:" + id}, 0))`);
    const lead = await ownedLead(actor, id, tx);
    if (lead.convertedProjectId) throw new ApiError(409, "جلسه را از تقویم پروژه ثبت کنید.");
    if (lead.consultationEventId) {
      const [existing] = await tx.select().from(studioCalendarEvents).where(eq(studioCalendarEvents.id, lead.consultationEventId));
      if (existing) return existing;
    }
    const start = date(startInput) || lead.nextFollowUp;
    if (!start) throw new ApiError(400, "ابتدا زمان پیگیری/مشاوره را مشخص کنید.");
    const [event] = await tx.insert(studioCalendarEvents).values({ ownerEmployeeId: actor.employeeId, title: `جلسه مشاوره — ${lead.name}`, eventType: "consultation", startTime: start, endTime: new Date(start.getTime() + 60 * 60 * 1000), status: "confirmed", notes: `${lead.mobile}${lead.notes ? ` — ${lead.notes}` : ""}`, assignedPersonnelIds: [] }).returning();
    await tx.update(studioLeads).set({ consultationEventId: event.id, stage: "consultation", lastContactAt: new Date(), updatedAt: new Date() }).where(eq(studioLeads.id, id));
    await logAuditEvent("STUDIO_CONSULTATION_BOOKED", "studio_lead", id, { calendarEventId: event.id, startTime: start.toISOString() }, { employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return event;
  });
}
