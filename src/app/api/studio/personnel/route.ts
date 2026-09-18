import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission, requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  listStudioPersonnel,
  createStudioPersonnel,
} from "@/services/studio/personnelService";

export async function GET(req: NextRequest) {
  try {
    await requireAnyPermission(["studio.personnel.view", "studio.personnel.manage", "studio.planning.view", "studio.planning.manage", "studio.daily_visits.view", "studio.daily_visits.manage", "studio.view"]);
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search") || undefined;
    const primaryRole = searchParams.get("primaryRole") || undefined;
    const personnelType = searchParams.get("personnelType") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    const result = await listStudioPersonnel({
      search,
      primaryRole,
      personnelType,
      status,
      page,
      pageSize,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error, "دریافت فهرست عوامل و پرسنل آتلیه");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("studio.personnel.manage");
    const body = await req.json();

    const created = await createStudioPersonnel(body);
    return NextResponse.json({ success: true, personnel: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت پرسنل یا عوامل آتلیه");
  }
}
