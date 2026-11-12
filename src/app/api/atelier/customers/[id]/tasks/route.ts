import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { saveCustomerTask } from "@/services/studio/customerTasks";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json({ success: true, task: await saveCustomerTask((await params).id, await request.json()) }); }
  catch (error) { return apiError(error, "ثبت کار مشتری"); }
}
