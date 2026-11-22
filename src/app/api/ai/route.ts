import { ApiError, apiError, assertUuid } from "@/lib/apiError";
import { NextResponse } from "next/server";
import { assertAIAdministrator, getEmployeeContext } from "@/services/access";
import { queryAIAssistant, chatWithAI, explainAIReadResult } from "@/services/ai";
import { availableAIOperations, cancelAIOperation, isAIReadOperation, prepareAIOperation, executeAIOperation } from "@/services/aiOperations";

export async function POST(req: Request) {
  try {
    const actor = await getEmployeeContext();
    if (!actor) throw new ApiError(401, "ابتدا وارد حساب کاربری شوید.");
    assertAIAdministrator(actor);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "درخواست دستیار معتبر نیست.");
    if (body.projectId) assertUuid(body.projectId);
    if (body.action === "operations") return NextResponse.json({ success: true, operations: await availableAIOperations(actor) });
    if (body.action === "prepare_operation") return NextResponse.json({ success: true, ...await prepareAIOperation(actor, String(body.operation || ""), body.parameters || {}) });
    if (body.action === "cancel_action") {
      await cancelAIOperation(actor, String(body.confirmationId || ""));
      return NextResponse.json({ success: true });
    }
    if (body.action === "execute_action") return NextResponse.json({ success: true, result: await executeAIOperation(actor, String(body.confirmationId || ""), body.confirmed, body.phrase) });
    const allowedProjectIds = body.projectId ? [body.projectId] : null;
    const unscoped = allowedProjectIds === null;
    const access = { finance: true, wages: true };

    if (body.action === "chat") {
      if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 50 ||
        body.messages.some((message: unknown) => {
          if (!message || typeof message !== "object") return true;
          const { role, content } = message as Record<string, unknown>;
          return !["user", "model", "assistant"].includes(String(role)) || typeof content !== "string" || content.length > 12000;
        })) {
        return NextResponse.json({ success: false, error: "لیست پیام‌های گفتگو الزامی است." }, { status: 400 });
      }
      const chatRes = await chatWithAI(body.messages, allowedProjectIds, actor.employeeId, unscoped, access, await availableAIOperations(actor), true);
      const prepared = chatRes.actionProposal ? await prepareAIOperation(actor, chatRes.actionProposal.operation, chatRes.actionProposal.parameters) : {};
      if (chatRes.actionProposal && isAIReadOperation(chatRes.actionProposal.operation) && "result" in prepared) {
        const answer = await explainAIReadResult(body.messages, chatRes.actionProposal.operation, prepared.result);
        return NextResponse.json({ success: true, ...answer });
      }
      return NextResponse.json({ success: true, ...chatRes, ...prepared });
    }

    // Default: Analysis / Question
    if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 12000) {
      return NextResponse.json({ success: false, error: "متن سوال الزامی است." }, { status: 400 });
    }

    const result = await queryAIAssistant(body.question, allowedProjectIds, actor.employeeId, unscoped, access);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return apiError(error);
  }
}
