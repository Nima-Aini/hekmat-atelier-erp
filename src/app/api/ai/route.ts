import { apiError, assertUuid } from "@/lib/apiError";
import { NextResponse } from "next/server";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { queryAIAssistant, chatWithAI } from "@/services/ai";
import { availableAIOperations, prepareAIOperation, executeAIOperation } from "@/services/aiOperations";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.projectId) assertUuid(body.projectId);
    const actor = await requirePermission("ai.use", body.projectId || undefined);
    if (body.action === "operations") return NextResponse.json({ success: true, operations: await availableAIOperations(actor) });
    if (body.action === "prepare_operation") return NextResponse.json({ success: true, ...await prepareAIOperation(actor, String(body.operation || ""), body.parameters || {}) });
    if (body.action === "execute_action") return NextResponse.json({ success: true, result: await executeAIOperation(actor, String(body.confirmationId || ""), body.confirmed) });
    const allowedProjectIds = body.projectId ? [body.projectId] : await getScopedProjectIds();
    const unscoped = allowedProjectIds === null;
    const access = {
      finance: await canAccessPermission(actor, "studio.finance.view", body.projectId || undefined),
      wages: await canAccessPermission(actor, "studio.personnel.wage.view", body.projectId || undefined),
    };

    if (body.action === "chat") {
      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return NextResponse.json({ success: false, error: "لیست پیام‌های گفتگو الزامی است." }, { status: 400 });
      }
      const chatRes = await chatWithAI(body.messages, allowedProjectIds, actor.employeeId, unscoped, access, await availableAIOperations(actor), actor.permissions.has("*"));
      const prepared = chatRes.actionProposal ? await prepareAIOperation(actor, chatRes.actionProposal.operation, chatRes.actionProposal.parameters) : {};
      return NextResponse.json({ success: true, ...chatRes, ...prepared });
    }

    // Default: Analysis / Question
    if (!actor.permissions.has("*")) await requirePermission("reports.view", body.projectId || undefined);
    if (!body.question) {
      return NextResponse.json({ success: false, error: "متن سوال الزامی است." }, { status: 400 });
    }

    const result = await queryAIAssistant(body.question, allowedProjectIds, actor.employeeId, unscoped, access);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return apiError(error);
  }
}
