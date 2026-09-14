"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getJalaliMonthLength,
  gregorianToJalali,
  jalaliToGregorian,
  toBusinessGregorianDateString,
  toJalaliDate,
} from "@/lib/dateUtils";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";

const MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
const WEEKDAYS = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
];

export function FinalCalendar() {
  const today = gregorianToJalali(new Date());
  const [view, setView] = useState({ year: today.year, month: today.month });
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<any>(null);
  const load = () => {
    setError("");
    fetch("/api/atelier/calendar")
      .then((r) => r.json())
      .then((value) =>
        value.success
          ? setData(value.calendar)
          : setError(value.error || "دریافت تقویم ممکن نشد."),
      )
      .catch(() => setError("ارتباط با سرور برقرار نشد."));
  };
  useEffect(load, []);
  const dayMap = useMemo(
    () => new Map((data?.days || []).map((day: any) => [day.date, day])),
    [data],
  );
  const move = (amount: number) => {
    const zero = view.year * 12 + view.month - 1 + amount;
    setView({
      year: Math.floor(zero / 12),
      month: (((zero % 12) + 12) % 12) + 1,
    });
    setSelected(null);
  };
  if (!data && !error) return <LoadingState />;
  if (error) return <ErrorState text={error} retry={load} />;
  const first = jalaliToGregorian({ ...view, day: 1 });
  const leading = (first.getUTCDay() + 1) % 7;
  const cells = [
    ...Array(leading).fill(null),
    ...Array.from(
      { length: getJalaliMonthLength(view.year, view.month) },
      (_, index) => index + 1,
    ),
  ];
  const level = (count: number) =>
    count >= data.thresholds.heavy
      ? "border-red-600 bg-red-950/55 text-red-100 shadow-[inset_0_0_24px_rgba(239,35,60,.13)]"
      : count >= data.thresholds.medium
        ? "border-orange-700 bg-orange-950/30 text-orange-100"
        : count >= data.thresholds.light
          ? "border-emerald-800 bg-emerald-950/25 text-emerald-100"
          : "border-zinc-900 bg-[#0b0b0d] text-zinc-400";
  return (
    <div className="space-y-5">
      <div>
        <p className="atelier-kicker">تقویم فارسی قراردادهای تایید شده</p>
        <h1 className="mt-1 text-2xl font-black">تقویم</h1>
        <p className="mt-2 text-xs text-zinc-500">
          سبز: سبک • نارنجی: متوسط • قرمز: سنگین
        </p>
      </div>
      <section className="atelier-panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-zinc-900 p-4">
          <button onClick={() => move(-1)} className="atelier-icon-button">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="text-center">
            <h2 className="font-black">
              {MONTHS[view.month - 1]}{" "}
              {view.year.toLocaleString("fa-IR", { useGrouping: false })}
            </h2>
            <button
              onClick={() => setView({ year: today.year, month: today.month })}
              className="mt-1 text-[10px] text-red-400"
            >
              بازگشت به امروز
            </button>
          </div>
          <button onClick={() => move(1)} className="atelier-icon-button">
            <ChevronLeft className="h-5 w-5" />
          </button>
        </header>
        <div className="grid grid-cols-7 border-b border-zinc-900 bg-black/30 text-center text-[9px] text-zinc-600 sm:text-xs">
          {WEEKDAYS.map((day) => (
            <div key={day} className="p-2 sm:p-3">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-zinc-900">
          {cells.map((day, index) => {
            if (!day)
              return (
                <div
                  key={`empty-${index}`}
                  className="min-h-16 bg-[#070708] sm:min-h-28"
                />
              );
            const date = jalaliToGregorian({ ...view, day });
            const key = toBusinessGregorianDateString(date);
            const info = dayMap.get(key) as any;
            const count = info?.count || 0;
            const isToday =
              view.year === today.year &&
              view.month === today.month &&
              day === today.day;
            return (
              <button
                key={day}
                onClick={() =>
                  setSelected(info || { date: key, count: 0, contracts: [] })
                }
                className={`relative min-h-16 border p-1.5 text-right transition hover:z-10 hover:border-red-500 sm:min-h-28 sm:p-3 ${level(count)}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${isToday ? "bg-red-600 text-white" : ""}`}
                >
                  {day.toLocaleString("fa-IR")}
                </span>
                {count > 0 && (
                  <div className="mt-2 text-center">
                    <strong className="block text-lg sm:text-2xl">
                      {count.toLocaleString("fa-IR")}
                    </strong>
                    <span className="hidden text-[10px] opacity-70 sm:block">
                      قرارداد
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>
      {selected && (
        <section className="atelier-panel-red p-4">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-red-400" />
            <h2 className="font-black">
              برنامه‌های{" "}
              {toJalaliDate(new Date(`${selected.date}T12:00:00+03:30`))}
            </h2>
          </div>
          {!selected.contracts.length ? (
            <EmptyState text="قرارداد تاییدشده‌ای برای این روز وجود ندارد." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {selected.contracts.map((contract: any) => (
                <article
                  key={contract.id}
                  className="rounded-xl border border-zinc-800 bg-black/35 p-3"
                >
                  <strong>{contract.customer.name}</strong>
                  <p className="mt-1 text-xs text-zinc-500">
                    {contract.projectType.title} •{" "}
                    {toJalaliDate(contract.programDate, { showTime: true })}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {contract.executionLocation || "محل ثبت نشده"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
