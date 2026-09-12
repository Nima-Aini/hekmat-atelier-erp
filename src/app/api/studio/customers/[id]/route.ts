import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  getStudioCustomerById,
  updateStudioCustomer,
  deleteStudioCustomer,
} from "@/services/studio/customerService";
import { requireStudioCustomerAccess } from "@/services/studio/access";
import { canAccessPermission } from "@/services/access";
import { db } from "@/db";
import { invoices, payments, studioDeliverables, studioProjectTimelines } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await requireStudioCustomerAccess(id, "studio.view");

    const customer: any = await getStudioCustomerById(id);
    const projects = [];
    const financialCoreIds: string[] = [];
    for (const project of customer.projects || []) {
      if (!(await canAccessPermission(actor, "studio.view", project.projectId))) continue;
      if (project.projectId && await canAccessPermission(actor, "studio.finance.view", project.projectId)) financialCoreIds.push(project.projectId);
      projects.push((await canAccessPermission(actor, "studio.contract.view", project.projectId)) ? project : { ...project, totalContractValue: null });
    }
    customer.projects = projects;
    const studioIds = projects.map((project: any) => project.id);
    const [clientInvoices, clientPayments, timeline, files] = await Promise.all([
      financialCoreIds.length ? db.select().from(invoices).where(inArray(invoices.projectId, financialCoreIds)) : [],
      financialCoreIds.length ? db.select().from(payments).where(inArray(payments.projectId, financialCoreIds)) : [],
      studioIds.length ? db.select().from(studioProjectTimelines).where(inArray(studioProjectTimelines.studioProjectId, studioIds)).orderBy(desc(studioProjectTimelines.createdAt)).limit(100) : [],
      studioIds.length ? db.select().from(studioDeliverables).where(inArray(studioDeliverables.studioProjectId, studioIds)) : [],
    ]);
    customer.summary = { totalProjects: projects.length, totalContracted: clientInvoices.filter(row => row.status === "issued").reduce((sum, row) => sum + Number(row.grandTotal), 0), totalPaid: clientPayments.filter(row => row.status === "completed" && row.paymentType === "customer_receipt").reduce((sum, row) => sum + Number(row.amount), 0), balance: clientInvoices.filter(row => row.status === "issued").reduce((sum, row) => sum + Number(row.balanceDue), 0), upcomingBooking: projects.filter((project: any) => new Date(project.eventDate) >= new Date()).sort((a: any, b: any) => +new Date(a.eventDate) - +new Date(b.eventDate))[0] || null };
    customer.timeline = timeline;
    customer.files = files;
    return NextResponse.json({ success: true, customer });
  } catch (error) {
    return apiError(error, "دریافت پرونده مشتری آتلیه");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireStudioCustomerAccess(id, "studio.projects.manage");
    const body = await req.json();

    const updated = await updateStudioCustomer(id, body);
    return NextResponse.json({ success: true, customer: updated });
  } catch (error) {
    return apiError(error, "ویرایش اطلاعات مشتری آتلیه");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireStudioCustomerAccess(id, "studio.projects.manage");

    const result = await deleteStudioCustomer(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف پرونده مشتری آتلیه");
  }
}
