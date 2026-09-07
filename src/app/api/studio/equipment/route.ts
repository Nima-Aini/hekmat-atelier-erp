import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  listStudioEquipment,
  createStudioEquipment,
} from "@/services/studio/equipmentService";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("studio.view");
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;
    const healthStatus = searchParams.get("healthStatus") || undefined;
    const locationType = searchParams.get("locationType") || undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    const result = await listStudioEquipment({
      search,
      category,
      healthStatus,
      locationType,
      page,
      pageSize,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error, "دریافت فهرست تجهیزات آتلیه");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("studio.equipment.manage");
    const body = await req.json();

    const created = await createStudioEquipment(body);
    return NextResponse.json({ success: true, equipment: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت تجهیز جدید در آتلیه");
  }
}
