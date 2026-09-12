import { db } from "@/db";
import { studioCatalog, studioWorkflowTemplates } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { ApiError, decimal } from "@/lib/apiError";
import type { EmployeeContext } from "@/services/access";
import type { Transaction } from "@/services/product";
import { logAuditEvent } from "@/services/audit";
import { choice, object, text, uuid } from "./productValidation";
import { validateStages } from "./workflow";

export async function saveCatalog(actor: EmployeeContext, value: unknown, id?: string) {
  const body = object(value);
  const data = { kind: choice(body.kind, ["service", "package", "addon"]), name: text(body.name, true, 200)!, jobType: text(body.jobType, true, 80)!, description: text(body.description), basePrice: decimal(body.basePrice ?? 0, "قیمت", 2), specifications: object(body.specifications || {}), parentId: uuid(body.parentId), workflowTemplateId: uuid(body.workflowTemplateId), active: body.active !== false, updatedAt: new Date() };
  return db.transaction(async tx => {
    const [item] = id ? await tx.update(studioCatalog).set(data).where(eq(studioCatalog.id, id)).returning() : await tx.insert(studioCatalog).values(data).returning();
    if (!item) throw new ApiError(404, "خدمت یافت نشد.");
    await logAuditEvent("STUDIO_CATALOG_SAVED", "studio_catalog", item.id, { kind: item.kind }, { employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return item;
  });
}
export async function saveTemplate(actor: EmployeeContext, value: unknown, id?: string) {
  const body = object(value); const data = { name: text(body.name, true, 200)!, jobType: text(body.jobType, true, 80)!, stages: validateStages(body.stages), active: body.active !== false, updatedAt: new Date() };
  return db.transaction(async tx => {
    const [item] = id ? await tx.update(studioWorkflowTemplates).set(data).where(eq(studioWorkflowTemplates.id, id)).returning() : await tx.insert(studioWorkflowTemplates).values(data).returning();
    if (!item) throw new ApiError(404, "قالب یافت نشد.");
    await logAuditEvent("STUDIO_WORKFLOW_TEMPLATE_SAVED", "studio_workflow_template", item.id, { stages: data.stages.length }, { employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return item;
  });
}
export type PackageSnapshot = { packageId: string; name: string; items: { id: string; name: string; quantity: number; unitPrice: string; specifications: unknown }[]; subtotal: number; discount: number; total: number };
export async function priceSnapshot(tx: Transaction, packageId: string, addons: unknown, discountInput: unknown = 0): Promise<PackageSnapshot> {
  const id = uuid(packageId)!;
  const additions = addons === undefined ? [] : addons;
  if (!Array.isArray(additions) || additions.length > 30) throw new ApiError(400, "افزونه‌های پکیج معتبر نیستند.");
  const requested = [{ id, quantity: 1 }, ...additions.map(raw => {
    const row = object(raw); const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new ApiError(400, "تعداد افزونه معتبر نیست.");
    return { id: uuid(row.id)!, quantity };
  })];
  if (new Set(requested.map(x => x.id)).size !== requested.length) throw new ApiError(400, "افزونهٔ تکراری مجاز نیست.");
  const rows = await tx.select().from(studioCatalog).where(inArray(studioCatalog.id, requested.map(x => x.id)));
  const items = requested.map((request, index) => {
    const item = rows.find(r => r.id === request.id);
    if (!item || !item.active || (index ? item.kind !== "addon" : item.kind === "addon")) throw new ApiError(400, "پکیج یا افزونه فعال نیست.");
    return { id: item.id, name: item.name, quantity: request.quantity, unitPrice: item.basePrice, specifications: item.specifications };
  });
  const subtotal = items.reduce((sum, row) => sum + Math.round(Number(row.unitPrice) * 100) * row.quantity, 0) / 100;
  const discount = Number(decimal(discountInput, "تخفیف", 2));
  if (discount >= subtotal) throw new ApiError(400, "تخفیف باید کمتر از مبلغ پکیج باشد.");
  return { packageId: id, name: items[0].name, items, subtotal, discount, total: Number((subtotal - discount).toFixed(2)) };
}
