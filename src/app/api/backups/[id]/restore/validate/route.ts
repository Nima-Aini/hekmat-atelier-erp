import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { validateRestore } from "@/services/backup";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requirePermission("backup.restore"); const { id } = await params; const validation = await validateRestore(id, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }); return NextResponse.json({ success: true, validation }); }
  catch (error) { return apiError(error, "اعتبارسنجی بازیابی"); }
}
