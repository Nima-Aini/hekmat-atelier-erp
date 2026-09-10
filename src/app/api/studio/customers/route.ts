import { NextRequest, NextResponse } from "next/server";
import { getScopedProjectIds, requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  listStudioCustomers,
  createStudioCustomer,
} from "@/services/studio/customerService";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("studio.view");
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search") || undefined;
    const customerType = searchParams.get("customerType") || undefined;
    const vipLevel = searchParams.get("vipLevel") || undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    const result = await listStudioCustomers({
      search,
      customerType,
      vipLevel,
      page,
      pageSize,
      allowedCoreProjectIds: await getScopedProjectIds(),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error, "دریافت فهرست مشتریان آتلیه");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("studio.projects.manage");
    const body = await req.json();

    const created = await createStudioCustomer(body);
    return NextResponse.json({ success: true, customer: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت پرونده مشتری آتلیه");
  }
}
