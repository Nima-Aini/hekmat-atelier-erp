"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bell, ChevronLeft, Siren } from "lucide-react";
import { toJalaliDate } from "@/lib/dateUtils";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";

export function FinalNotificationsView({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const [items, setItems] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = () => {
    setLoading(true);
    fetch("/api/atelier/notifications")
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
  useEffect(load, []);
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
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.tab);
                  setTimeout(
                    () =>
                      window.dispatchEvent(
                        new CustomEvent("akma:navigate-item", {
                          detail: { id: item.entityId },
                        }),
                      ),
                    50,
                  );
                }}
                className={`group flex w-full items-center gap-3 rounded-2xl border p-4 text-right transition ${critical ? "border-red-600/80 bg-red-950/35 shadow-[0_0_30px_rgba(239,35,60,.14)]" : warning ? "border-orange-900/70 bg-orange-950/15" : "border-zinc-800 bg-[#0d0d0f]"}`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${critical ? "bg-red-600 text-white shadow-[0_0_20px_rgba(239,35,60,.35)]" : warning ? "bg-orange-950 text-orange-400" : "bg-zinc-900 text-zinc-400"}`}
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
                <ChevronLeft className="h-4 w-4 text-zinc-700 transition group-hover:text-red-400" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
