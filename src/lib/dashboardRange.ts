import { getBusinessDateTimeParts, getJalaliPresetRange, gregorianToJalali, parseReportDateParam, tehranDateTimeToUtc, toLatinDigits } from "./dateUtils";

export const dashboardPresets = [
  ["today", "امروز"], ["this_week", "این هفته"], ["this_month", "این ماه"],
  ["last_3_months", "۳ ماه اخیر"], ["last_6_months", "۶ ماه اخیر"],
  ["this_year", "سال جاری"], ["custom", "بازه دلخواه"],
] as const;
export type DashboardRange = { start: Date; end: Date };
const civilDay = (value: Date) => {
  const p = getBusinessDateTimeParts(value);
  return Date.UTC(p.year, p.month - 1, p.day);
};
export function shiftBusinessDays(value: Date, days: number) {
  const civil = new Date(civilDay(value) + days * 86400000);
  return tehranDateTimeToUtc({ year: civil.getUTCFullYear(), month: civil.getUTCMonth() + 1, day: civil.getUTCDate() });
}
export function dashboardRangeDays(range: DashboardRange) {
  return Math.round((civilDay(range.end) - civilDay(range.start)) / 86400000) + 1;
}
export function parseDashboardRange(start: string | null, end: string | null): DashboardRange {
  if (start === null && end === null) return getJalaliPresetRange("this_month")!;
  if (![start, end].every(value => value && /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(toLatinDigits(value.trim())))) throw new Error("تاریخ شروع و پایان معتبر الزامی است.");
  const from = parseReportDateParam(start), to = parseReportDateParam(end, true);
  if (!from || !to) throw new Error("تاریخ شروع و پایان معتبر الزامی است.");
  if (from > to) throw new Error("تاریخ شروع نباید بعد از تاریخ پایان باشد.");
  const range = { start: from, end: to };
  // Reject dates beyond the existing Jalali library's supported calendar.
  gregorianToJalali(from); gregorianToJalali(to);
  if (dashboardRangeDays(range) > 3660) throw new Error("بازه گزارش نباید بیش از ۱۰ سال باشد.");
  return range;
}
export function previousDashboardRange(range: DashboardRange): DashboardRange {
  return { start: shiftBusinessDays(range.start, -dashboardRangeDays(range)), end: new Date(+range.start - 1) };
}
export function inDashboardRange(value: Date | string | null | undefined, range: DashboardRange) {
  if (!value) return false;
  const instant = +new Date(value);
  return Number.isFinite(instant) && instant >= +range.start && instant <= +range.end;
}
