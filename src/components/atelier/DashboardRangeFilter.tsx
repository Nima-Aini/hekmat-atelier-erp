"use client";

import { useState } from "react";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { getJalaliPresetRange, toJalaliDate } from "@/lib/dateUtils";
import { dashboardPresets, type DashboardRange } from "@/lib/dashboardRange";

export function DashboardRangeFilter({ range, onChange }: { range: DashboardRange; onChange: (range: DashboardRange) => void }) {
  const [preset, setPreset] = useState("this_month");
  const [start, setStart] = useState<Date | null>(range.start), [end, setEnd] = useState<Date | null>(range.end);
  const [error, setError] = useState("");
  const [validStart, setValidStart] = useState(true), [validEnd, setValidEnd] = useState(true);
  return <div className="min-w-0 max-w-full space-y-2">
    <select aria-label="بازه تاریخ داشبورد" className="atelier-input max-w-full py-2 text-xs" value={preset} onChange={(event) => {
      const value = event.target.value; setPreset(value); setError("");
      const next = getJalaliPresetRange(value);
      if (next) { setStart(next.start); setEnd(next.end); setValidStart(true); setValidEnd(true); onChange(next); }
    }}>{dashboardPresets.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select>
    {preset === "custom" && <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <JalaliDatePicker label="شروع" value={start} onChange={(date) => { setStart(date); setValidStart(Boolean(date)); }} onValidityChange={setValidStart} />
      <JalaliDatePicker label="پایان" value={end} onChange={(date) => { setEnd(date); setValidEnd(Boolean(date)); }} onValidityChange={setValidEnd} />
      <button className="atelier-button-secondary self-end text-xs" onClick={() => {
        if (!validStart || !validEnd || !start || !end || start > end) { setError("تاریخ شروع و پایان معتبر و مرتب انتخاب کنید."); return; }
        onChange({ start, end }); setError("");
      }}>اعمال بازه</button>
    </div>}
    {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : <p className="text-[11px] text-zinc-400">{toJalaliDate(range.start)} تا {toJalaliDate(range.end)}</p>}
  </div>;
}
