import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { markRentalAsRented } from "@/services/studio/finalWorkflow";
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("studio.planning.manage");
    const { id } = await params;
    const body = await req.json();
    return NextResponse.json({
      success: true,
      rental: await markRentalAsRented(actor, id, body.finalCost),
    });
  } catch (error) {
    return apiError(error, "ثبت انجام اجاره");
  }
}
