"use client";
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useUrlState } from "./useUrlState";
import { dashboardPresetSelection, type DashboardDateSelection } from "./dashboardDateSelection";
import { dashboardPresets, parseDashboardRange } from "./dashboardRange";
import { toBusinessGregorianDateString } from "./dateUtils";
export function useUrlDateSelection(): [DashboardDateSelection, Dispatch<SetStateAction<DashboardDateSelection>>] {
 const today = dashboardPresetSelection("today");
 const serialize = (selection: DashboardDateSelection) => ({ preset: selection.preset, from: toBusinessGregorianDateString(selection.range.start), to: toBusinessGregorianDateString(selection.range.end) });
 const [raw, setRaw] = useUrlState("range", serialize(today), value => {
  try { if (!value || (value.preset !== "single" && !dashboardPresets.some(([id]) => id === value.preset))) return false; parseDashboardRange(value.from, value.to); return true; } catch { return false; }
 });
 const selection = useMemo(() => ({ preset: raw.preset, range: parseDashboardRange(raw.from, raw.to) }), [raw.preset, raw.from, raw.to]);
 return [selection, next => setRaw(serialize(typeof next === "function" ? next(selection) : next))];
}
