import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  listRentalEquipment,
  createRentalEquipment,
} from "@/services/studio/equipmentService";
import { addRentalToProject } from "@/services/studio/projectService";
import { requireStudioGlobalAccess, requireStudioProjectAccess } from "@/services/studio/access";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const studioProjectId = searchParams.get("studioProjectId") || undefined;
    if (studioProjectId) await requireStudioProjectAccess(studioProjectId, "studio.finance.view");
    else await requireStudioGlobalAccess("studio.finance.view");
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    const result = await listRentalEquipment({
      search,
      status,
      studioProjectId,
      page,
      pageSize,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error, "دریافت فهرست تجهیزات اجاره‌ای");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let created;
    if (body.studioProjectId) {
      const { actor: context } = await requireStudioProjectAccess(body.studioProjectId, "studio.finance.manage");
      created = await addRentalToProject(body.studioProjectId, { ...body, idempotencyKey: req.headers.get("idempotency-key") || body.idempotencyKey, actorId: context.employeeId, authorName: context.employeeName });
    } else {
      await requireStudioGlobalAccess("studio.equipment.manage");
      created = await createRentalEquipment(body);
    }
    return NextResponse.json({ success: true, rental: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت تجهیز اجاره‌ای جدید");
  }
}
