import { dashboardPresets, parseDashboardRange, type DashboardRange } from "./dashboardRange";
import { getJalaliPresetRange, toBusinessGregorianDateString, toJalaliDate } from "./dateUtils";

export type DashboardPreset = typeof dashboardPresets[number][0];
export type DashboardDateSelection = { preset: DashboardPreset | "single"; range: DashboardRange };
export function dashboardPresetSelection(preset: Exclude<DashboardPreset, "custom">): DashboardDateSelection {
  return { preset, range: getJalaliPresetRange(preset)! };
}
export function dashboardDaySelection(date: Date): DashboardDateSelection {
  const day = toBusinessGregorianDateString(date);
  return { preset: day === toBusinessGregorianDateString(new Date()) ? "today" : "single", range: parseDashboardRange(day, day) };
}
export function dashboardCustomSelection(start: Date, end: Date): DashboardDateSelection {
  return { preset: "custom", range: parseDashboardRange(toBusinessGregorianDateString(start), toBusinessGregorianDateString(end)) };
}
export function dashboardSelectionLabel(selection: DashboardDateSelection): string {
  const { preset, range } = selection;
  const start = toJalaliDate(range.start, { format: "words" });
  if (preset === "today" || preset === "single") return `${toBusinessGregorianDateString(range.start) === toBusinessGregorianDateString(new Date()) ? "امروز، " : ""}${start}`;
  if (preset === "custom") return `${start} تا ${toJalaliDate(range.end, { format: "words" })}`;
  return dashboardPresets.find(([id]) => id === preset)![1];
}
