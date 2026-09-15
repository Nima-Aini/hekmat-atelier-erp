import { NextRequest, NextResponse } from "next/server";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioPipeline,
  updateStudioProjectStage,
} from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";

export async function GET(_req: NextRequest) {
  try {
    const actor = await requirePermission("studio.view");
    const data = await getStudioPipeline(await getScopedProjectIds());
    let allFinancialVisible = true;
    for (const stage of data.pipeline) {
      stage.projects = await Promise.all(stage.projects.map(async (project: any) => {
        if (await canAccessPermission(actor, "studio.profitability.view", project.projectId)) return project;
        allFinancialVisible = false;
        const { totalContractValue: _total, paidAmount: _paid, remainingAmount: _remaining, ...safe } = project;
        return safe;
      }));
      if (!allFinancialVisible) stage.totalValue = 0;
    }
    if (!allFinancialVisible) data.stats.totalPipelineValue = 0;
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiError(error, "دریافت پایپ‌لاین فروش و پروژه‌های آتلیه");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, newStage, note } = body;
    const { actor: context } = await requireStudioProjectAccess(projectId, "studio.projects.manage");

    const updated = await updateStudioProjectStage(projectId, newStage, note, context.employeeName, context.employeeId);
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    return apiError(error, "انتقال مرحله پروژه در پایپ‌لاین");
  }
}
