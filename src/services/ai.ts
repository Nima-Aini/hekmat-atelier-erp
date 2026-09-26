import { GoogleGenAI } from "@google/genai";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAtelierReports } from "@/services/studio/reports";
import { getStudioDashboard } from "@/services/studio/dashboard";
import { getAtelierFinanceCenter } from "@/services/studio/financeCenter";

export interface AIAnalysisResult {
  answer: string;
  facts: string[];
  calculatedMetrics: Record<string, unknown>;
  assumptions: string[];
  recommendations: string[];
  proposalAction: null;
}
export interface ChatMessage {
  role: "user" | "model" | "assistant";
  content: string;
}
const CANDIDATE_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.7-flash",
  "gemini-flash-latest",
];

async function getGeminiApiKey() {
  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "main_config"))
    .limit(1);
  const key = process.env.GEMINI_API_KEY || settings?.openaiApiKey;
  if (!key)
    throw new Error(
      "کلید Gemini تنظیم نشده است. مقدار GEMINI_API_KEY را فقط در محیط اجرا یا تنظیمات امن وارد کنید.",
    );
  return key;
}
function parseGeminiJson(text: string): Record<string, any> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed;
  } catch {
    /* prose fallback */
  }
  return {
    answer: text,
    reply: text,
    facts: [],
    recommendations: [],
    assumptions: [],
  };
}
async function atelierContext(
  coreIds: string[] | null,
  actorId: string,
  unscoped: boolean,
  access: { finance: boolean; wages: boolean },
) {
  const [reports, dashboard, financeCenter] = await Promise.all([
    getAtelierReports(coreIds, actorId, unscoped, access),
    getStudioDashboard(coreIds, access.finance, actorId, unscoped),
    access.finance ? getAtelierFinanceCenter(coreIds) : null,
  ]);
  const safeFinance = financeCenter ? {
    summary: financeCenter.summary,
    forecast: financeCenter.forecast,
    receivables: financeCenter.receivableSources.slice(0, 10).map((row) => ({ title: row.title, remainingAmount: row.remainingAmount, dueDate: row.dueDate })),
    payables: financeCenter.payables.slice(0, 10).map((row) => ({ title: row.title, remainingAmount: row.remainingAmount, dueDate: row.dueDate })),
    profitability: financeCenter.profitability.slice(0, 10).map((row) => ({ contractNumber: row.contractNumber, projectTitle: row.projectTitle, profit: row.profit, margin: row.margin })),
  } : null;
  return { reports, dashboard, financeCenter: safeFinance };
}
async function generate(prompt: string, systemInstruction: string) {
  const ai = new GoogleGenAI({
    apiKey: await getGeminiApiKey(),
    httpOptions: { headers: { "User-Agent": "hekmat-atelier" } },
  });
  let lastError = "";
  for (const model of CANDIDATE_GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction, responseMimeType: "application/json" },
      });
      if (response.text)
        return { content: parseGeminiJson(response.text), model };
    } catch (cause) {
      lastError =
        cause instanceof Error
          ? `Model ${model}: ${cause.message}`
          : String(cause);
    }
  }
  throw new Error(`پاسخی از هوش مصنوعی دریافت نشد. ${lastError}`);
}

export async function queryAIAssistant(
  question: string,
  coreIds: string[] | null,
  actorId: string,
  unscoped: boolean,
  access: { finance: boolean; wages: boolean },
): Promise<AIAnalysisResult> {
  const context = await atelierContext(coreIds, actorId, unscoped, access);
  const facts = [
    `قرارداد و برنامه فعال: ${context.reports.projects.active}`,
    `کار عقب‌افتاده: ${context.dashboard.attention.overdue.length}`,
    ...(context.reports.finance
      ? [
          `مبلغ قراردادها: ${context.reports.finance.contracted.toLocaleString("fa-IR")} تومان`,
          `دریافتی: ${context.reports.finance.collected.toLocaleString("fa-IR")} تومان`,
          `مانده: ${context.reports.finance.outstanding.toLocaleString("fa-IR")} تومان`,
          `سود قراردادها: ${context.reports.finance.profit.toLocaleString("fa-IR")} تومان`,
          `نقدینگی فعلی: ${context.financeCenter?.summary.liquidity.toLocaleString("fa-IR") || "۰"} تومان`,
          `دریافت این ماه: ${context.financeCenter?.summary.receivedThisMonth.toLocaleString("fa-IR") || "۰"} تومان`,
          `پرداخت این ماه: ${context.financeCenter?.summary.paidThisMonth.toLocaleString("fa-IR") || "۰"} تومان`,
        ]
      : []),
  ];
  const metrics = {
    projects: context.reports.projects,
    crm: context.reports.crm,
    finance: context.reports.finance,
    today: context.dashboard.today,
    attention: context.dashboard.attention,
    financeCenter: context.financeCenter,
  };
  const instruction = `شما دستیار فقط‌خواندنی «حکمت آتلیه» هستید. فقط با واژگان فارسی محصول درباره قراردادهای امروز، برنامه‌های فردا، رزروهای نزدیک، تجهیزات اجاره‌ای، پرسنل درگیر و مانده مشتریان توضیح دهید. واژه‌های فنی و نام بخش‌های قدیمی را به کاربر نشان ندهید. هرگز ادعای تغییر داده، ارسال پیامک یا ثبت مالی نکنید. پاسخ JSON با answer، facts، recommendations و assumptions باشد.`;
  const result = await generate(
    `پرسش: ${question.trim()}\nحقایق: ${facts.join("\n")}\nداده scoped: ${JSON.stringify(metrics)}`,
    instruction,
  );
  return {
    answer:
      typeof result.content.answer === "string"
        ? result.content.answer
        : "پاسخی دریافت نشد.",
    facts:
      Array.isArray(result.content.facts) && result.content.facts.length
        ? result.content.facts
        : facts,
    calculatedMetrics: metrics,
    assumptions: Array.isArray(result.content.assumptions)
      ? result.content.assumptions
      : ["تحلیل فقط بر اساس داده‌های مجاز فعلی انجام شده است."],
    recommendations: Array.isArray(result.content.recommendations)
      ? result.content.recommendations
      : [],
    proposalAction: null,
  };
}

export async function chatWithAI(
  messages: ChatMessage[],
  coreIds: string[] | null,
  actorId: string,
  unscoped: boolean,
  access: { finance: boolean; wages: boolean },
): Promise<{ reply: string; modelUsed: string; actionProposal: null }> {
  const context = await atelierContext(coreIds, actorId, unscoped, access);
  const history = messages
    .slice(-12)
    .map(
      (message) =>
        `${message.role === "user" ? "کاربر" : "دستیار"}: ${message.content}`,
    )
    .join("\n");
  const instruction = `شما دستیار فقط‌خواندنی مدیریت آتلیه هستید. به فارسی و بر اساس داده‌های مجاز پاسخ دهید. تمرکز: قرارداد، برنامه، رزرو، مراجعه روزانه، مشتری، پرسنل، تجهیزات و مانده. واژه‌های فنی داخلی را نمایش ندهید. تغییر داده یا عملیات مالی ممنوع است. پاسخ JSON با کلید reply و actionProposal:null باشد.`;
  const result = await generate(
    `${history}\n\nداده عملیاتی: ${JSON.stringify({ today: context.dashboard.today, attention: context.dashboard.attention, projects: context.reports.projects, crm: context.reports.crm, finance: context.reports.finance, financeCenter: context.financeCenter })}`,
    instruction,
  );
  return {
    reply:
      typeof result.content.reply === "string"
        ? result.content.reply
        : result.content.answer || "پاسخی دریافت نشد.",
    modelUsed: result.model,
    actionProposal: null,
  };
}
