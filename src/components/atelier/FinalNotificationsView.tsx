"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Archive, Bell, ChevronLeft, RotateCcw, Siren } from "lucide-react";
import { toJalaliDate } from "@/lib/dateUtils";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";
import { atelierToast } from "@/lib/atelierFeedback";

export function FinalNotificationsView({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const [items, setItems] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [archived, setArchived] = useState(false);
  const load = () => {
    setLoading(true);
    fetch(`/api/atelier/notifications${archived ? "?archived=true" : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success)
          throw new Error(data.error || "دریافت اعلانات ممکن نشد.");
        setItems(data.notifications || []);
        setError("");
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [archived]);
  const toggleArchive = async (item: any) => { const data = await fetch("/api/atelier/notifications", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, archived: !archived }) }).then((response) => response.json()); if (!data.success) return atelierToast(data.error || "تغییر آرشیو انجام نشد.", "error"); atelierToast(archived ? "اعلان بازگردانی شد." : "اعلان آرشیو شد.", "success"); load(); };
  return (
    <div className="space-y-5">
      <div>
        <p className="atelier-kicker">هشدارهای عملیاتی و قابل اقدام</p>
        <h1 className="mt-1 text-2xl font-black">اعلانات</h1>
        <p className="mt-2 text-xs text-zinc-500">
          شرایط حل‌شده خودکار از این فهرست حذف می‌شوند و اعلان‌ها تکراری
          نمی‌شوند.
        </p>
      </div>
      <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 p-1"><button onClick={() => setArchived(false)} className={`rounded-xl px-4 py-2 text-xs font-bold ${!archived ? "bg-red-700 text-white" : "text-zinc-500"}`}>اعلان‌های فعال</button><button onClick={() => setArchived(true)} className={`rounded-xl px-4 py-2 text-xs font-bold ${archived ? "bg-red-700 text-white" : "text-zinc-500"}`}>اعلان های آرشیو شده</button></div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState text={error} retry={load} />
      ) : !items.length ? (
        <EmptyState text="اعلان نیازمند اقدامی وجود ندارد." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const critical = item.priority === "critical",
              warning = item.priority === "warning";
            return (
              <div
                key={item.id}
                className={`group flex w-full items-center gap-3 rounded-2xl border p-4 text-right transition ${archived ? "border-emerald-900/70 bg-emerald-950/10" : critical ? "border-red-600/80 bg-red-950/35 shadow-[0_0_30px_rgba(239,35,60,.14)]" : warning ? "border-amber-700/70 bg-amber-950/15 shadow-[0_0_20px_rgba(245,158,11,.1)]" : "border-cyan-900/70 bg-cyan-950/10 shadow-[0_0_20px_rgba(6,182,212,.08)]"}`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${archived ? "bg-emerald-950 text-emerald-300" : critical ? "bg-red-600 text-white shadow-[0_0_20px_rgba(239,35,60,.35)]" : warning ? "bg-amber-950 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,.2)]" : "bg-cyan-950 text-cyan-300 shadow-[0_0_14px_rgba(6,182,212,.16)]"}`}
                >
                  {critical ? (
                    <Siren className="h-5 w-5" />
                  ) : warning ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Bell className="h-5 w-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <strong
                    className={critical ? "text-red-200" : "text-zinc-100"}
                  >
                    {item.title}
                  </strong>
                  <span className="mt-1 block text-xs leading-6 text-zinc-400">
                    {item.message}
                  </span>
                  {item.date && (
                    <span className="mt-1 block text-[10px] text-zinc-600">
                      {toJalaliDate(item.date, { showTime: true })}
                    </span>
                  )}
                </span>
                <button onClick={() => { if (!archived) { if (item.tab === "planning") sessionStorage.setItem("akma:planning-target", item.entityId); onNavigate(item.tab); setTimeout(() => window.dispatchEvent(new CustomEvent("akma:navigate-item", { detail: { id: item.entityId } })), 50); } }} className="atelier-icon-button" aria-label="رفتن به رکورد"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => void toggleArchive(item)} className="atelier-button-secondary text-xs">{archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{archived ? "بازگردانی" : "آرشیو هشدار"}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
