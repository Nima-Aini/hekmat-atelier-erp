import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { listLeads, saveLead } from "@/services/studio/leads";
export async function GET(){try{const actor=await requirePermission("studio.view");return NextResponse.json({success:true,leads:await listLeads(actor)});}catch(error){return apiError(error,"دریافت سرنخ‌ها");}}
export async function POST(req:NextRequest){try{const actor=await requirePermission("studio.crm.manage");return NextResponse.json({success:true,lead:await saveLead(actor,await req.json())},{status:201});}catch(error){return apiError(error,"ثبت سرنخ");}}
