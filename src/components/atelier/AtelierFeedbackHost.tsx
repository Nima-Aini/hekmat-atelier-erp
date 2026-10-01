"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { atelierFeedbackEvents, type DialogDetail } from "@/lib/atelierFeedback";

export function AtelierFeedbackHost() {
  const [dialog, setDialog] = useState<DialogDetail | null>(null);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    const onDialog = (event: Event) => {
      const detail = (event as CustomEvent<DialogDetail>).detail;
      setInput(detail.defaultValue || "");
      setDialog(detail);
    };
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setToast(detail);
      window.setTimeout(() => setToast((current) => current === detail ? null : current), 3800);
    };
    window.addEventListener(atelierFeedbackEvents.dialog, onDialog);
    window.addEventListener(atelierFeedbackEvents.toast, onToast);
    return () => {
      window.removeEventListener(atelierFeedbackEvents.dialog, onDialog);
      window.removeEventListener(atelierFeedbackEvents.toast, onToast);
    };
  }, []);

  const finish = (value: boolean | string | null) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  return (
    <>
      {dialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl border border-red-950 bg-[#0b0b0d] p-5 shadow-2xl shadow-black">
            <h2 className="text-lg font-black text-white">{dialog.title}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{dialog.message}</p>
            {dialog.kind === "prompt" && (
              <input autoFocus value={input} onChange={(event) => setInput(event.target.value)} className="atelier-input mt-4 w-full py-3" onKeyDown={(event) => event.key === "Enter" && finish(input)} />
            )}
            <div className="mt-5 flex justify-end gap-2 border-t border-zinc-900 pt-4">
              <button onClick={() => finish(dialog.kind === "confirm" ? false : null)} className="atelier-button-secondary">انصراف</button>
              <button onClick={() => finish(dialog.kind === "confirm" ? true : input)} className="atelier-button">تأیید</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={`fixed bottom-5 left-1/2 z-[130] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl ${toast.tone === "error" ? "border-red-700 bg-red-950 text-red-100" : toast.tone === "success" ? "border-emerald-800 bg-emerald-950 text-emerald-100" : "border-zinc-700 bg-zinc-900 text-zinc-100"}`} role="status">
          {toast.tone === "error" ? <XCircle className="h-4 w-4" /> : toast.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </>
  );
}
