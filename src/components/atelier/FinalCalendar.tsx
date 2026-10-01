"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { gregorianToJalali, toJalaliDate } from "@/lib/dateUtils";
import { type CalendarDay, type CalendarThresholds } from "@/lib/atelierCalendar";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";

export function FinalCalendar({ onOpenPlanning }: { onOpenPlanning?: (id: string) => void }) {
  const today = gregorianToJalali(new Date());
  const [view, setView] = useState({ year: today.year, month: today.month });
  const [data, setData] = useState<{ days: CalendarDay[]; thresholds: CalendarThresholds } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/atelier/calendar", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || "دریافت تقویم ممکن نشد.");
        if (!controller.signal.aborted) { setData(body.calendar); setError(""); }
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "ارتباط با سرور برقرار نشد."); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <ErrorState text={error} retry={() => { setError(""); setAttempt(value => value + 1); }} />;
  if (!data) return <LoadingState />;
  return <div className="space-y-5">
    <div>
      <p className="atelier-kicker">تقویم فارسی قراردادهای تایید شده</p>
      <h1 className="mt-1 text-2xl font-black">تقویم</h1>
      <p className="mt-2 text-xs text-zinc-500">سبز: سبک • نارنجی: متوسط • قرمز: سنگین</p>
    </div>
    <CalendarMonthGrid view={view} onViewChange={next => { setView(next); setSelected(null); }} days={data.days} thresholds={data.thresholds} selectedDate={selected?.date} onSelect={setSelected} />
    {selected && <section className="atelier-panel-red p-4">
      <div className="mb-4 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-red-400" /><h2 className="font-black">برنامه‌های {toJalaliDate(new Date(`${selected.date}T12:00:00+03:30`))}</h2></div>
      {!selected.contracts.length ? <EmptyState text="قرارداد تاییدشده‌ای برای این روز وجود ندارد." /> : <div className="grid gap-3 md:grid-cols-2">
        {selected.contracts.map(contract => <button type="button" key={contract.id} onClick={() => onOpenPlanning?.(contract.id)} className="rounded-xl border border-zinc-800 bg-black/35 p-3 text-right">
          <strong>{contract.customer.name}</strong>
          <p className="mt-1 text-xs text-zinc-500">{contract.projectType.title} • {toJalaliDate(contract.programDate, { showTime: true })}</p>
          <p className="mt-1 text-xs text-zinc-500">{contract.executionLocation || "محل ثبت نشده"}</p>
        </button>)}
      </div>}
    </section>}
  </div>;
}
