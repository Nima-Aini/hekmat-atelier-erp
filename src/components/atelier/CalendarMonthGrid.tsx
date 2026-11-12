"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { CALENDAR_MONTHS, CALENDAR_WEEKDAYS, calendarDayTone, calendarMonthCells, moveCalendarMonth, type CalendarDay, type CalendarMonth, type CalendarThresholds } from "@/lib/atelierCalendar";
import { gregorianToJalali, toBusinessGregorianDateString } from "@/lib/dateUtils";

/** Shared presentation only; both views consume the authoritative calendar endpoint. */
export function CalendarMonthGrid({ view, onViewChange, days, selectedDate, onSelect, thresholds, compact = false }: {
  view: CalendarMonth;
  onViewChange: (view: CalendarMonth) => void;
  days: CalendarDay[];
  selectedDate?: string;
  onSelect: (day: CalendarDay) => void;
  thresholds?: CalendarThresholds;
  compact?: boolean;
}) {
  const today = new Date();
  const todayKey = toBusinessGregorianDateString(today);
  const dayMap = new Map(days.map(day => [day.date, day]));
  return <section className="atelier-panel min-w-0 overflow-hidden" aria-label="تقویم ماهانه" dir="rtl">
    <header className={`flex items-center justify-between border-b border-zinc-800 ${compact ? "p-2" : "p-4"}`}>
      <button type="button" aria-label="ماه قبل" onClick={() => onViewChange(moveCalendarMonth(view, -1))} className="atelier-icon-button"><ChevronRight className="h-4 w-4" /></button>
      <div className="text-center">
        <h2 aria-live="polite" className="text-sm font-black">{CALENDAR_MONTHS[view.month - 1]} {view.year.toLocaleString("fa-IR", { useGrouping: false })}</h2>
        <button type="button" onClick={() => { const current = gregorianToJalali(today); onViewChange({ year: current.year, month: current.month }); onSelect(dayMap.get(todayKey) || { date: todayKey, count: 0, contracts: [] }); }} className="text-[10px] text-red-400">بازگشت به امروز</button>
      </div>
      <button type="button" aria-label="ماه بعد" onClick={() => onViewChange(moveCalendarMonth(view, 1))} className="atelier-icon-button"><ChevronLeft className="h-4 w-4" /></button>
    </header>
    <div className="grid grid-cols-7 border-b border-zinc-800 bg-black/30 text-center text-[9px] text-zinc-400">
      {CALENDAR_WEEKDAYS.map(day => <div key={day} title={day} className="min-w-0 py-2">{compact ? day.slice(0, 1) : day}</div>)}
    </div>
    <div className="grid grid-cols-7 gap-px bg-zinc-900">
      {calendarMonthCells(view).map((cell, index) => {
        if (!cell) return <div key={`blank-${index}`} className={compact ? "h-9 bg-[#070708]" : "min-h-16 bg-[#070708] sm:min-h-28"} />;
        const info = dayMap.get(cell.key) || { date: cell.key, count: 0, contracts: [] };
        const isToday = cell.key === todayKey;
        return <button key={cell.key} type="button" aria-current={isToday ? "date" : undefined} aria-pressed={selectedDate === cell.key} aria-label={`${cell.day} ${CALENDAR_MONTHS[view.month - 1]}؛ ${info.count} برنامه`} onClick={() => onSelect(info)}
          className={`relative min-w-0 border transition hover:border-red-500 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 ${compact ? "h-9 p-0.5 text-center" : "min-h-16 p-1.5 text-right sm:min-h-28 sm:p-3"} ${calendarDayTone(info.count, thresholds)} ${selectedDate === cell.key ? "ring-1 ring-inset ring-red-400" : ""}`}>
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${isToday ? "bg-red-600 text-white" : ""}`}>{cell.day.toLocaleString("fa-IR")}</span>
          {info.count > 0 && (compact ? <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 h-1 w-1 rounded-full bg-current" /> : <div className="mt-2 text-center"><strong className="block text-lg sm:text-2xl">{info.count.toLocaleString("fa-IR")}</strong><span className="hidden text-[10px] opacity-70 sm:block">قرارداد</span></div>)}
        </button>;
      })}
    </div>
  </section>;
}
