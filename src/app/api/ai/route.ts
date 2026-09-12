import { apiError, assertUuid } from "@/lib/apiError";
import { NextResponse } from "next/server";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { queryAIAssistant, chatWithAI } from "@/services/ai";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.projectId) assertUuid(body.projectId);
    const actor = await requirePermission("ai.view", body.projectId || undefined);
    const allowedProjectIds = body.projectId ? [body.projectId] : await getScopedProjectIds();
    const unscoped = allowedProjectIds === null;
    const access = {
      finance: await canAccessPermission(actor, "studio.finance.view", body.projectId || undefined),
      wages: await canAccessPermission(actor, "studio.personnel.wage.view", body.projectId || undefined),
    };

    if (body.action === "execute_action") {
      return NextResponse.json(
        { success: false, error: "دستیار حکمت آتلیه فقط تحلیلی است و اجازه تغییر مستقیم داده‌ها را ندارد." },
        { status: 403 },
      );
    }

    if (body.action === "chat") {
      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return NextResponse.json({ success: false, error: "لیست پیام‌های گفتگو الزامی است." }, { status: 400 });
      }
      const chatRes = await chatWithAI(body.messages, allowedProjectIds, actor.employeeId, unscoped, access);
      return NextResponse.json({ success: true, ...chatRes });
    }

    // Default: Analysis / Question
    if (!body.question) {
      return NextResponse.json({ success: false, error: "متن سوال الزامی است." }, { status: 400 });
    }

    const result = await queryAIAssistant(body.question, allowedProjectIds, actor.employeeId, unscoped, access);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return apiError(error);
  }
}
