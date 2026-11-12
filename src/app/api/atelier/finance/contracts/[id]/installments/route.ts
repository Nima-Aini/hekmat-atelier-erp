import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { saveContractInstallments } from "@/services/studio/financeCenter";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("studio.finance.manage"); const { id } = await params; const body = await req.json();
    if (!Array.isArray(body.installments)) throw new ApiError(400, "فهرست اقساط نامعتبر است.");
    return NextResponse.json({ success: true, installments: await saveContractInstallments(actor, id, body.installments) });
  } catch (error) { return apiError(error, "ذخیره برنامه اقساط"); }
}
