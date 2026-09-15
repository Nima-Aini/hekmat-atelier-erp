import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { convertLead,saveLead,scheduleLeadConsultation } from "@/services/studio/leads";
export async function PUT(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const actor=await requirePermission("studio.crm.manage");const{id}=await params;return NextResponse.json({success:true,lead:await saveLead(actor,await req.json(),id)});}catch(error){return apiError(error,"ویرایش سرنخ");}}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const actor=await requirePermission("studio.crm.manage");const{id}=await params;const body=await req.json().catch(()=>({}));if(body.action==="consultation")return NextResponse.json({success:true,event:await scheduleLeadConsultation(actor,id,body.startTime)});if(body.action!=="convert")return NextResponse.json({success:false,error:"عملیات معتبر نیست."},{status:400});return NextResponse.json({success:true,...await convertLead(actor,id)});}catch(error){return apiError(error,"عملیات سرنخ");}}
