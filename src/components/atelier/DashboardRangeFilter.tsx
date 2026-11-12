"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { toJalaliDate } from "@/lib/dateUtils";
import { dashboardPresets } from "@/lib/dashboardRange";
import { dashboardCustomSelection, dashboardDaySelection, dashboardPresetSelection, dashboardSelectionLabel, type DashboardDateSelection } from "@/lib/dashboardDateSelection";

export function DashboardRangeFilter({ selection, onChange, context = "داشبورد" }: { selection: DashboardDateSelection; onChange: (selection: DashboardDateSelection) => void; context?: string }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [start, setStart] = useState<Date | null>(null), [end, setEnd] = useState<Date | null>(null);
  const [validStart, setValidStart] = useState(true), [validEnd, setValidEnd] = useState(true);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<CSSProperties>({});
  const anchor = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const customButton = useRef<HTMLButtonElement>(null);
  const label = dashboardSelectionLabel(selection);
  const rangeLabel = `${toJalaliDate(selection.range.start)} — ${toJalaliDate(selection.range.end)}`;
  const close = () => { setCustomOpen(false); customButton.current?.focus(); };
  useEffect(() => {
    if (!customOpen) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect(); if (!rect) return;
      const width = Math.min(420, window.innerWidth - 24), height = panel.current?.offsetHeight || 280;
      setPosition({ position: "fixed", width, left: Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width)), top: Math.max(12, Math.min(window.innerHeight - height - 12, rect.bottom + 8)), maxHeight: "calc(100dvh - 24px)", overflowY: "auto" });
    };
    const outside = (event: MouseEvent | FocusEvent) => {
      const target = event.target as Element;
      if (!anchor.current?.contains(target) && !panel.current?.contains(target) && !customButton.current?.contains(target) && !target.closest?.("[data-jalali-calendar]")) setCustomOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setCustomOpen(false); customButton.current?.focus(); } };
    place(); panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", outside); document.addEventListener("focusin", outside); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("mousedown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape); };
  }, [customOpen]);
  return <div className="flex min-w-0 max-w-full flex-col gap-2 lg:flex-row lg:items-center" aria-label={`انتخاب تاریخ ${context}`}>
    <div ref={anchor} className="min-w-0 max-w-full shrink-0 lg:max-w-[330px]">
      <JalaliDatePicker value={selection.range.start} onOpenChange={open => { if (open) setCustomOpen(false); }} onChange={date => { if (date) { setCustomOpen(false); onChange(dashboardDaySelection(date)); } }} triggerLabel={`انتخاب روز ${context}؛ ${label}`} trigger={<>
        <CalendarDays className="h-4 w-4 shrink-0 text-zinc-400" />
        <span className="min-w-0"><b className="block truncate text-xs" title={label}>{label}</b>{selection.preset !== "today" && selection.preset !== "single" && <small className="block text-[10px] text-zinc-400">{rangeLabel}</small>}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
      </>} />
    </div>
    <div role="group" aria-label={`بازه‌های آماده ${context}`} className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-zinc-800/80 p-1 lg:overflow-visible">
      {dashboardPresets.map(([preset, title]) => <button key={preset} ref={preset === "custom" ? customButton : undefined} type="button" aria-pressed={selection.preset === preset} aria-expanded={preset === "custom" ? customOpen : undefined} aria-haspopup={preset === "custom" ? "dialog" : undefined} className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${selection.preset === preset ? "bg-red-950 text-red-200 ring-1 ring-red-800/70" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`} onClick={() => {
        if (preset === "custom") { setStart(selection.range.start); setEnd(selection.range.end); setValidStart(true); setValidEnd(true); setError(""); setCustomOpen(current => !current); }
        else { setCustomOpen(false); onChange(dashboardPresetSelection(preset)); }
      }}>{title}</button>)}
    </div>
    {customOpen && createPortal(<div ref={panel} role="dialog" aria-label={`بازه دلخواه ${context}`} dir="rtl" style={position} className="z-[130] space-y-3 rounded-2xl border border-zinc-800 bg-[#09090b] p-4 text-white shadow-2xl">
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold">بازه دلخواه</h2><button type="button" aria-label="بستن انتخاب بازه" onClick={close} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-red-600"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <JalaliDatePicker label="از تاریخ" value={start} onChange={date => { setStart(date); setValidStart(Boolean(date)); }} onValidityChange={setValidStart} />
        <JalaliDatePicker label="تا تاریخ" value={end} onChange={date => { setEnd(date); setValidEnd(Boolean(date)); }} onValidityChange={setValidEnd} />
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="atelier-button-secondary text-xs" onClick={close}>انصراف</button><button type="button" className="atelier-button text-xs" onClick={() => {
        if (!validStart || !validEnd || !start || !end) { setError("تاریخ شروع و پایان معتبر انتخاب کنید."); return; }
        try { onChange(dashboardCustomSelection(start, end)); close(); } catch (reason) { setError(reason instanceof Error ? reason.message : "بازه تاریخ معتبر نیست."); }
      }}>اعمال بازه</button></div>
    </div>, document.body)}
  </div>;
}
