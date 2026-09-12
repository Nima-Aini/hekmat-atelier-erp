import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices, studioContracts, studioCustomers, studioEquipment, studioPersonnel, studioProjects, studioTasks, suppliers } from "@/db/schema";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { apiError } from "@/lib/apiError";
import { getScopedProjectIds, requirePermission } from "@/services/access";

export async function GET(req: Request) {
  try {
    const actor = await requirePermission("global_search");
    const coreIds = await getScopedProjectIds();
    const q = new URL(req.url).searchParams.get("q")?.trim() || "";
    if (q.length < 2) return NextResponse.json({ success: true, results: [] });
    const term = `%${q}%`;
    const projectScope = coreIds === null ? undefined : coreIds.length ? inArray(studioProjects.projectId, coreIds) : sql`false`;
    const [projects, clients, contracts, personnel, equipment, tasks, vendors] = await Promise.all([
      db.select({ id: studioProjects.id, coreProjectId: studioProjects.projectId, title: studioProjects.title, code: studioProjects.projectNumber, detail: studioProjects.eventType }).from(studioProjects).where(and(projectScope, or(ilike(studioProjects.title, term), ilike(studioProjects.projectNumber, term), ilike(studioProjects.eventType, term)))).limit(8),
      db.selectDistinct({ id: studioCustomers.id, title: customers.name, code: customers.code, detail: customers.mobile }).from(studioCustomers).innerJoin(customers, eq(customers.id, studioCustomers.customerId)).leftJoin(studioProjects, eq(studioProjects.studioCustomerId, studioCustomers.id)).where(and(projectScope, or(ilike(customers.name, term), ilike(customers.mobile, term), ilike(customers.code, term)))).limit(8),
      actor.permissions.has("*") || actor.permissions.has("studio.contract.view") ? db.select({ id: studioContracts.id, title: studioContracts.contractNumber, code: invoices.invoiceNumber, detail: studioProjects.title, projectId: studioProjects.id }).from(studioContracts).innerJoin(studioProjects, eq(studioProjects.id, studioContracts.studioProjectId)).leftJoin(invoices, eq(invoices.id, studioContracts.invoiceId)).where(and(projectScope, or(ilike(studioContracts.contractNumber, term), ilike(invoices.invoiceNumber, term), ilike(studioProjects.title, term)))).limit(8) : [],
      db.select({ id: studioPersonnel.id, title: studioPersonnel.fullName, code: studioPersonnel.mobile, detail: studioPersonnel.primaryRole }).from(studioPersonnel).where(or(ilike(studioPersonnel.fullName, term), ilike(studioPersonnel.mobile, term), ilike(studioPersonnel.primaryRole, term))).limit(8),
      db.select({ id: studioEquipment.id, title: studioEquipment.title, code: studioEquipment.code, detail: studioEquipment.category }).from(studioEquipment).where(or(ilike(studioEquipment.title, term), ilike(studioEquipment.code, term), ilike(studioEquipment.serialNumber, term))).limit(8),
      db.select({ id: studioTasks.id, title: studioTasks.title, code: studioProjects.projectNumber, detail: studioTasks.status, projectId: studioProjects.id }).from(studioTasks).innerJoin(studioProjects, eq(studioProjects.id, studioTasks.studioProjectId)).where(and(projectScope, or(ilike(studioTasks.title, term), ilike(studioTasks.description, term)))).limit(8),
      actor.permissions.has("*") || actor.permissions.has("suppliers.view") ? db.select({ id: suppliers.id, title: suppliers.name, code: suppliers.code, detail: suppliers.mobile }).from(suppliers).where(or(ilike(suppliers.name, term), ilike(suppliers.contactPerson, term), ilike(suppliers.mobile, term))).limit(6) : [],
    ]);
    const results = [
      ...clients.map(item => ({ ...item, type: "studio_customer", typeLabel: "مشتری" })),
      ...projects.map(item => ({ ...item, type: "studio_project", typeLabel: "پروژه" })),
      ...contracts.map(item => ({ ...item, type: "studio_contract", typeLabel: "قرارداد / صورتحساب" })),
      ...tasks.map(item => ({ ...item, type: "studio_task", typeLabel: "کار" })),
      ...personnel.map(item => ({ ...item, type: "studio_personnel", typeLabel: "عامل" })),
      ...equipment.map(item => ({ ...item, type: "studio_equipment", typeLabel: "تجهیزات" })),
      ...vendors.map(item => ({ ...item, type: "studio_vendor", typeLabel: "همکار" })),
    ];
    return NextResponse.json({ success: true, results });
  } catch (error) { return apiError(error, "جستجوی آتلیه"); }
}
