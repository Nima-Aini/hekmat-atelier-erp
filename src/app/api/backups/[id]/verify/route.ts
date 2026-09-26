import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { verifySystemBackup } from "@/services/backup";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requirePermission("backup.verify"); const { id } = await params; const verification = await verifySystemBackup(id, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }); return NextResponse.json({ success: true, verification }); }
  catch (error) { return apiError(error, "اعتبارسنجی نسخه پشتیبان"); }
}
