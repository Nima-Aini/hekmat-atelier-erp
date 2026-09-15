import { NextRequest, NextResponse } from "next/server";
import { canAccessPermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioProjectById,
  updateStudioProject,
} from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor, owner } = await requireStudioProjectAccess(id);

    const project: any = await getStudioProjectById(id);
    if (!(await canAccessPermission(actor, "studio.contract.view", owner.coreProjectId))) {
      project.contracts = [];
      project.totalContractValue = null;
    }
    if (!(await canAccessPermission(actor, "studio.finance.view", owner.coreProjectId))) {
      project.payments = [];
      project.expenses = [];
    }
    if (!(await canAccessPermission(actor, "studio.personnel.wage.view", owner.coreProjectId))) {
      project.assignedPersonnel = (project.assignedPersonnel || []).map(({ rateAmount: _rateAmount, totalCalculated: _totalCalculated, ...safe }: any) => safe);
    }
    if (!(await canAccessPermission(actor, "studio.profitability.view", owner.coreProjectId))) project.financialSummary = null;
    return NextResponse.json({ success: true, project });
  } catch (error) {
    return apiError(error, "دریافت پرونده پروژه آتلیه");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor: context } = await requireStudioProjectAccess(id, "studio.projects.manage");
    const body = await req.json();

    const updated = await updateStudioProject(id, { ...body, actorId: context.employeeId, authorName: context.employeeName });
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    return apiError(error, "ویرایش اطلاعات پروژه");
  }
}
