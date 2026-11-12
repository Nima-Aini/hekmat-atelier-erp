"use client";
import { useEffect, useMemo, useState } from "react";
import { gregorianToJalali, jalaliToGregorian, toBusinessGregorianDateString, toJalaliDate } from "@/lib/dateUtils";
import { calendarMonthCells, moveCalendarMonth } from "@/lib/atelierCalendar";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { ErrorState, LoadingState } from "./StatusView";

type Usage = { id: string; equipmentId: string; equipmentTitle: string; healthStatus: string; locationType: string; reservedFrom: string; reservedTo: string; status: string; projectTitle?: string; personnelName?: string; workTitle?: string };
export function EquipmentUsageCalendar({ equipment = [], equipmentId }: { equipment?: Array<{ id: string; title: string }>; equipmentId?: string }) {
  const [view, setView] = useState(() => { const now = gregorianToJalali(new Date()); return { year: now.year, month: now.month }; });
  const [selected, setSelected] = useState(toBusinessGregorianDateString(new Date()));
  const [filter, setFilter] = useState(equipmentId || "");
  const [usage, setUsage] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ from: jalaliToGregorian({ ...view, day: 1 }).toISOString(), to: jalaliToGregorian({ ...moveCalendarMonth(view, 1), day: 1 }).toISOString() });
    if (filter) query.set("equipmentId", filter);
    setLoading(true);
    fetch(`/api/atelier/equipment/calendar?${query}`, { signal: controller.signal }).then(response => response.json()).then(body => {
      if (!body.success) throw new Error(body.error || "دریافت تقویم ممکن نشد.");
      setUsage(body.usage); setError("");
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [view, filter]);
  const rowsForDay = (key: string) => usage.filter(row => row.status !== "cancelled" && toBusinessGregorianDateString(row.reservedFrom) <= key && toBusinessGregorianDateString(new Date(+new Date(row.reservedTo) - 1)) >= key);
  const days = useMemo(() => calendarMonthCells(view).filter(cell => !!cell).map(cell => ({ date: cell.key, count: usage.filter(row => row.status !== "cancelled" && toBusinessGregorianDateString(row.reservedFrom) <= cell.key && toBusinessGregorianDateString(new Date(+new Date(row.reservedTo) - 1)) >= cell.key).length, contracts: [] })), [view, usage]);
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black">تقویم استفاده تجهیزات</h2>{!equipmentId && <select aria-label="فیلتر تجهیز" className="atelier-input max-w-xs" value={filter} onChange={event => setFilter(event.target.value)}><option value="">همه تجهیزات</option>{equipment.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select>}</div>
    <div className="grid gap-3 lg:grid-cols-2"><CalendarMonthGrid compact view={view} onViewChange={value => { setView(value); setSelected(toBusinessGregorianDateString(jalaliToGregorian({ ...value, day: 1 }))); }} days={days} selectedDate={selected} onSelect={day => setSelected(day.date)} />
      <div className="atelier-panel max-h-96 space-y-2 overflow-y-auto p-3"><h3 className="text-sm font-bold">{toJalaliDate(selected)}</h3>{loading ? <LoadingState /> : error ? <ErrorState text={error} /> : !rowsForDay(selected).length ? <p className="text-xs text-zinc-500">برنامه‌ای برای این روز ثبت نشده است.</p> : rowsForDay(selected).map(row => <article key={row.id} className="rounded-xl border border-zinc-800 p-3 text-xs"><b>{row.equipmentTitle}</b>{(row.healthStatus !== "healthy" || row.locationType === "maintenance") && <strong className="mr-2 text-red-400">نیازمند بررسی / تعمیر</strong>}<p className="mt-2">{row.projectTitle || row.workTitle || "رزرو تجهیز"}</p><p className="mt-1 text-zinc-400">{row.personnelName || "پرسنل تعیین نشده"} · {row.status === "reserved" ? "رزرو" : row.status === "checked_out" ? "در حال استفاده" : "پایان استفاده"}</p><p className="mt-2 text-zinc-400">{toJalaliDate(row.reservedFrom, { showTime: true })} تا {toJalaliDate(row.reservedTo, { showTime: true })}</p></article>)}</div></div>
  </section>;
}
