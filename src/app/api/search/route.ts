import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  customers,
  invoices,
  studioContracts,
  studioCustomers,
  studioDailyVisits,
  studioEquipment,
  studioPersonnel,
  studioProjects,
  studioReservations,
} from "@/db/schema";
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
    const projectScope =
      coreIds === null
        ? undefined
        : coreIds.length
          ? inArray(studioProjects.projectId, coreIds)
          : sql`false`;
    const [clients, contracts, personnel, equipment, visits, reservations] =
      await Promise.all([
        db
          .selectDistinct({
            id: studioCustomers.id,
            title: customers.name,
            code: customers.code,
            detail: customers.mobile,
          })
          .from(studioCustomers)
          .innerJoin(customers, eq(customers.id, studioCustomers.customerId))
          .innerJoin(
            studioProjects,
            eq(studioProjects.studioCustomerId, studioCustomers.id),
          )
          .innerJoin(
            studioContracts,
            eq(studioContracts.studioProjectId, studioProjects.id),
          )
          .where(
            and(
              projectScope,
              or(
                ilike(customers.name, term),
                ilike(customers.mobile, term),
                ilike(customers.code, term),
              ),
            ),
          )
          .limit(8),
        actor.permissions.has("*") ||
        actor.permissions.has("studio.contract.view")
          ? db
              .select({
                id: studioContracts.id,
                title: studioContracts.contractNumber,
                code: invoices.invoiceNumber,
                detail: studioProjects.title,
                projectId: studioProjects.id,
              })
              .from(studioContracts)
              .innerJoin(
                studioProjects,
                eq(studioProjects.id, studioContracts.studioProjectId),
              )
              .leftJoin(invoices, eq(invoices.id, studioContracts.invoiceId))
              .where(
                and(
                  projectScope,
                  or(
                    ilike(studioContracts.contractNumber, term),
                    ilike(invoices.invoiceNumber, term),
                    ilike(studioProjects.title, term),
                  ),
                ),
              )
              .limit(8)
          : [],
        db
          .select({
            id: studioPersonnel.id,
            title: studioPersonnel.fullName,
            code: studioPersonnel.mobile,
            detail: studioPersonnel.primaryRole,
          })
          .from(studioPersonnel)
          .where(
            or(
              ilike(studioPersonnel.fullName, term),
              ilike(studioPersonnel.mobile, term),
              ilike(studioPersonnel.primaryRole, term),
            ),
          )
          .limit(8),
        db
          .select({
            id: studioEquipment.id,
            title: studioEquipment.title,
            code: studioEquipment.code,
            detail: studioEquipment.category,
          })
          .from(studioEquipment)
          .where(
            or(
              ilike(studioEquipment.title, term),
              ilike(studioEquipment.code, term),
              ilike(studioEquipment.serialNumber, term),
            ),
          )
          .limit(8),
        db
          .select({
            id: studioDailyVisits.id,
            title: studioDailyVisits.title,
            code: studioDailyVisits.mobile,
            detail: studioDailyVisits.customerName,
          })
          .from(studioDailyVisits)
          .where(
            or(
              ilike(studioDailyVisits.title, term),
              ilike(studioDailyVisits.customerName, term),
              ilike(studioDailyVisits.mobile, term),
            ),
          )
          .limit(8),
        db
          .select({
            id: studioReservations.id,
            title: studioReservations.title,
            code: studioReservations.mobile,
            detail: studioReservations.customerName,
          })
          .from(studioReservations)
          .where(
            or(
              ilike(studioReservations.title, term),
              ilike(studioReservations.customerName, term),
              ilike(studioReservations.mobile, term),
            ),
          )
          .limit(8),
      ]);
    const results = [
      ...clients.map((item) => ({
        ...item,
        type: "studio_customer",
        typeLabel: "مشتری",
      })),
      ...contracts.map((item) => ({
        ...item,
        type: "studio_contract",
        typeLabel: "قرارداد",
      })),
      ...visits.map((item) => ({
        ...item,
        type: "studio_daily_visit",
        typeLabel: "مراجعه روزانه",
      })),
      ...reservations.map((item) => ({
        ...item,
        type: "studio_reservation",
        typeLabel: "رزرو",
      })),
      ...personnel.map((item) => ({
        ...item,
        type: "studio_personnel",
        typeLabel: "پرسنل",
      })),
      ...equipment.map((item) => ({
        ...item,
        type: "studio_equipment",
        typeLabel: "تجهیزات",
      })),
    ];
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return apiError(error, "جستجوی آتلیه");
  }
}
