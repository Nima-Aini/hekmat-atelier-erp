import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { getPersonnelAccess, savePersonnelAccess } from "@/services/studio/personnelAccess";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("studio.personnel.manage");
    const result = await getPersonnelAccess((await params).id);
    return NextResponse.json({
      success: true,
      access: { ...result.account, permissions: result.permissions },
      availablePermissions: result.available.map((item) => ({ permission: item.code, label: item.name })),
    });
  }
  catch (error) { return apiError(error, "دریافت دسترسی پرسنل"); }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requirePermission("studio.personnel.manage"); return NextResponse.json({ success: true, access: await savePersonnelAccess(actor, (await params).id, await req.json()) }); }
  catch (error) { return apiError(error, "ذخیره دسترسی پرسنل"); }
}
