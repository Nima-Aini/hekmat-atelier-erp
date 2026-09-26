"use client";

import React, { useEffect, useRef, useState } from "react";
import { BarChart3, Bot, MessageSquare, RefreshCw, Send, ShieldCheck, Sparkles, Trash2, User, Zap } from "lucide-react";

interface AiAssistantViewProps { selectedProjectId: string | null; }
interface ChatMsg { role: "user" | "model" | "assistant"; content: string; timestamp?: string; modelUsed?: string; }

const timeLabel = () => new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
const welcome = (): ChatMsg => ({
  role: "model",
  content: "سلام؛ من دستیار حکمت آتلیه هستم. می‌توانم قراردادهای امروز، برنامه‌های فردا، رزروهای نزدیک، تجهیزات اجاره‌ای و مانده مشتریان را بر اساس دسترسی شما خلاصه کنم. برای امنیت مالی و عملیاتی، هیچ داده‌ای را مستقیم تغییر نمی‌دهم.",
  timestamp: timeLabel(),
});

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({ selectedProjectId }) => {
  const [mode, setMode] = useState<"chat" | "analysis">("chat");
  const [messages, setMessages] = useState<ChatMsg[]>([welcome()]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [analysisQuestion, setAnalysisQuestion] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (mode === "chat") chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, mode]);

  const appendError = (message: string) => setMessages(previous => [...previous, { role: "model", content: `⚠️ ${message}`, timestamp: timeLabel() }]);
  const handleSendChat = async (suggestion?: string) => {
    const text = (suggestion || chatInput).trim();
    if (!text || chatLoading) return;
    const userMessage: ChatMsg = { role: "user", content: text, timestamp: timeLabel() };
    const history = [...messages, userMessage];
    setMessages(history); setChatInput(""); setChatLoading(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", messages: history.map(message => ({ role: message.role === "assistant" ? "model" : message.role, content: message.content })), projectId: selectedProjectId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) appendError(result.error || "پاسخی از دستیار دریافت نشد.");
      else setMessages(previous => [...previous, { role: "model", content: result.reply, modelUsed: result.modelUsed, timestamp: timeLabel() }]);
    } catch (error) { appendError(error instanceof Error ? error.message : "ارتباط با سرور برقرار نشد."); }
    finally { setChatLoading(false); }
  };

  const handleAnalysis = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!analysisQuestion.trim() || analysisLoading) return;
    setAnalysisLoading(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analysis", question: analysisQuestion, projectId: selectedProjectId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "تحلیل انجام نشد.");
      setAnalysisResult(result.result);
    } catch (error) { alert(error instanceof Error ? error.message : "ارتباط با سرور برقرار نشد."); }
    finally { setAnalysisLoading(false); }
  };

  const prompts = ["قرارداد های امروز را بگو", "فردا چه برنامه هایی داریم؟", "چه تجهیزاتی باید اجاره شوند؟", "کدام رزروها نزدیک هستند؟", "کدام مشتری بیشترین مانده را دارد؟", "امروز چه پرسنلی درگیر هستند؟"];

  return <div className="space-y-6">
    <section className="atelier-panel-red p-4 sm:flex sm:items-center sm:justify-between">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-white"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-700/50 bg-red-950/40"><Bot className="h-6 w-6 text-red-300" /></span>دستیار هوش مصنوعی</h2><p className="mr-12 mt-1 text-xs text-zinc-500">پاسخ فارسی و فقط خواندنی درباره وضعیت واقعی آتلیه</p></div>
      <div className="mt-4 flex rounded-xl border border-red-950 bg-black/50 p-1 sm:mt-0">
        <button onClick={() => setMode("chat")} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold ${mode === "chat" ? "bg-red-700 text-white" : "text-zinc-400"}`}><MessageSquare className="h-3.5 w-3.5" />گفتگو</button>
        <button onClick={() => setMode("analysis")} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold ${mode === "analysis" ? "bg-red-700 text-white" : "text-zinc-400"}`}><BarChart3 className="h-3.5 w-3.5" />جمع‌بندی</button>
      </div>
    </section>

    {mode === "chat" && <section className="flex h-[650px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3"><div className="flex items-center gap-2 text-xs"><ShieldCheck className="h-4 w-4 text-emerald-400" /><strong className="text-white">حالت تحلیل امن</strong><span className="text-emerald-400">بدون تغییر مستقیم اطلاعات</span></div><button onClick={() => setMessages([welcome()])} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" />گفتگوی جدید</button></header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">{messages.map((message, index) => { const user = message.role === "user"; return <div key={`${index}-${message.timestamp}`} className={`flex gap-3 ${user ? "flex-row-reverse" : "flex-row"}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${user ? "bg-blue-600 text-white" : "border border-purple-500/30 bg-purple-600/30 text-purple-300"}`}>{user ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div><div className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-6 ${user ? "rounded-tr-none bg-blue-600 text-white" : "rounded-tl-none border border-slate-800 bg-slate-950 text-slate-200"}`}><p className="whitespace-pre-wrap">{message.content}</p><div className="mt-2 flex justify-between border-t border-slate-800/50 pt-1 text-[9px] opacity-70"><span>{message.timestamp}</span>{message.modelUsed && <span>{message.modelUsed}</span>}</div></div></div>; })}{chatLoading && <div className="flex items-center gap-2 text-xs text-slate-400"><RefreshCw className="h-4 w-4 animate-spin text-purple-400" />در حال تحلیل داده‌های مجاز…</div>}<div ref={chatBottomRef} /></div>
      <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-800/80 bg-slate-950/40 px-4 py-2 text-[11px]"><span className="flex shrink-0 items-center gap-1 text-slate-500"><Zap className="h-3 w-3 text-amber-400" />پرسش سریع:</span>{prompts.map(prompt => <button key={prompt} onClick={() => void handleSendChat(prompt)} className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-slate-300 hover:border-red-700">{prompt}</button>)}</div>
      <form onSubmit={event => { event.preventDefault(); void handleSendChat(); }} className="flex items-center gap-2 border-t border-slate-800 bg-slate-950 p-3"><input aria-label="پرسش از دستیار" placeholder="درباره قرارداد، رزرو، برنامه یا تجهیزات بپرسید…" value={chatInput} onChange={event => setChatInput(event.target.value)} disabled={chatLoading} className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none" /><button type="submit" disabled={chatLoading || !chatInput.trim()} className="flex shrink-0 items-center gap-2 rounded-xl bg-red-700 px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />ارسال</button></form>
    </section>}

    {mode === "analysis" && <div className="space-y-6"><form onSubmit={handleAnalysis} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl sm:flex-row"><input aria-label="موضوع تحلیل" placeholder="مثلاً: وضعیت سودآوری و کارهای عقب‌افتاده این ماه چگونه است؟" value={analysisQuestion} onChange={event => setAnalysisQuestion(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs text-white focus:border-purple-500 focus:outline-none" /><button type="submit" disabled={analysisLoading || !analysisQuestion.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{analysisLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}تحلیل</button></form>
      {analysisResult && <section className="space-y-5 rounded-2xl border border-purple-500/30 bg-slate-900/80 p-5 text-xs"><div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-300"><Bot className="h-4 w-4" />جمع‌بندی تحلیلی</h3><p className="whitespace-pre-wrap leading-7 text-slate-200">{analysisResult.answer}</p></div><div><h3 className="mb-2 font-bold text-purple-300">حقایق عملیاتی</h3><ul className="list-inside list-disc space-y-1 text-slate-300">{analysisResult.facts?.map((fact: string) => <li key={fact}>{fact}</li>)}</ul></div><div className="border-t border-slate-800 pt-4"><h3 className="mb-2 font-bold text-emerald-400">پیشنهادهای قابل بررسی</h3><div className="space-y-2">{analysisResult.recommendations?.map((recommendation: string) => <div key={recommendation} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-200">{recommendation}</div>)}</div></div></section>}
    </div>}
  </div>;
};
