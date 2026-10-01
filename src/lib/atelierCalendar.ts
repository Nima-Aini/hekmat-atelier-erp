import { getBusinessWeekday, getJalaliMonthLength, jalaliToGregorian, toBusinessGregorianDateString } from "./dateUtils";

export const CALENDAR_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export const CALENDAR_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
export type CalendarMonth = { year: number; month: number };
export type CalendarDay = {
  date: string;
  count: number;
  contracts: Array<{ id: string; programDate: string; customer: { name: string }; projectType: { title: string }; executionLocation?: string | null }>;
};
export type CalendarThresholds = { light: number; medium: number; heavy: number };

export function moveCalendarMonth(view: CalendarMonth, amount: number): CalendarMonth {
  const zero = view.year * 12 + view.month - 1 + amount;
  return { year: Math.floor(zero / 12), month: ((zero % 12 + 12) % 12) + 1 };
}

export function calendarMonthCells(view: CalendarMonth): Array<{ day: number; key: string } | null> {
  const first = jalaliToGregorian({ ...view, day: 1 });
  // Tehran midnight can be the preceding UTC date. Never use getUTCDay here.
  const leading = (getBusinessWeekday(first) + 1) % 7;
  return [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: getJalaliMonthLength(view.year, view.month) }, (_, index) => ({
      day: index + 1,
      key: toBusinessGregorianDateString(jalaliToGregorian({ ...view, day: index + 1 })),
    })),
  ];
}

export function calendarDayTone(count: number, thresholds?: CalendarThresholds) {
  if (!count) return "border-zinc-800 bg-[#0b0b0d] text-zinc-400";
  if (thresholds && count >= thresholds.heavy) return "border-red-600 bg-red-950/55 text-red-100";
  if (thresholds && count >= thresholds.medium) return "border-orange-700 bg-orange-950/30 text-orange-100";
  return "border-emerald-800 bg-emerald-950/25 text-emerald-100";
}
