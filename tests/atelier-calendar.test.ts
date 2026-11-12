import { describe, expect, it } from "vitest";
import { calendarDayTone, calendarMonthCells, moveCalendarMonth } from "../src/lib/atelierCalendar";

describe("shared Jalali calendar", () => {
  it("positions Tehran midnight on the correct weekday, independent of host timezone", () => {
    const cells = calendarMonthCells({ year: 1405, month: 1 });
    // 1405/01/01 is Saturday 2026-03-21 (Friday evening UTC).
    expect(cells[0]).toEqual({ day: 1, key: "2026-03-21" });
    expect(cells).toHaveLength(31);
  });
  it("handles leading blanks and preserves unique Gregorian date keys", () => {
    const cells = calendarMonthCells({ year: 1405, month: 7 });
    expect(cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(cells[4]).toEqual({ day: 1, key: "2026-09-23" });
    expect(new Set(cells.filter(Boolean).map(cell => cell!.key)).size).toBe(30);
  });
  it("moves across year boundaries in both directions", () => {
    expect(moveCalendarMonth({ year: 1405, month: 1 }, -1)).toEqual({ year: 1404, month: 12 });
    expect(moveCalendarMonth({ year: 1405, month: 12 }, 1)).toEqual({ year: 1406, month: 1 });
  });
  it("handles leap and common Esfand", () => {
    expect(calendarMonthCells({ year: 1403, month: 12 }).filter(Boolean)).toHaveLength(30);
    expect(calendarMonthCells({ year: 1404, month: 12 }).filter(Boolean)).toHaveLength(29);
  });
  it("uses the same server thresholds in both calendar views and keeps empty days neutral", () => {
    const thresholds = { light: 1, medium: 3, heavy: 5 };
    expect(calendarDayTone(0, thresholds)).toContain("text-zinc-400");
    expect(calendarDayTone(1, thresholds)).toContain("text-emerald-100");
    expect(calendarDayTone(3, thresholds)).toContain("text-orange-100");
    expect(calendarDayTone(5, thresholds)).toContain("text-red-100");
  });
});
