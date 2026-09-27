import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JalaliDatePicker } from "../src/components/ui/JalaliDatePicker";
import { dashboardPresets, dashboardRangeDays, inDashboardRange, parseDashboardRange, previousDashboardRange } from "../src/lib/dashboardRange";
import { getBusinessWeekday, getJalaliPresetRange, parseJalaliString, parseReportDateParam, toBusinessGregorianDateString } from "../src/lib/dateUtils";
import { buildRangeAnalytics } from "../src/services/studio/overviewAnalytics";

afterEach(() => vi.useRealTimers());
describe("Dashboard Tehran civil ranges", () => {
  it("renders the Gregorian civil day and calendar weekday in Tehran, not UTC", () => {
    const date = parseJalaliString("1405/01/01")!;
    expect(getBusinessWeekday(date)).toBe(6);
    const markup = renderToStaticMarkup(createElement(JalaliDatePicker, { value: date, onChange: () => {} }));
    expect(markup).toContain("2026-03-21");
    expect(markup).not.toContain("2026-03-20");
  });
  it("offers all six real presets and custom range", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
    expect(dashboardPresets.map(([id]) => id)).toEqual(["today", "this_week", "this_month", "last_3_months", "last_6_months", "this_year", "custom"]);
    for (const [id] of dashboardPresets.slice(0, 6)) {
      const range = getJalaliPresetRange(id)!;
      expect(range.start <= range.end).toBe(true);
      expect(toBusinessGregorianDateString(range.end)).toBe("2026-09-26");
    }
    expect(toBusinessGregorianDateString(getJalaliPresetRange("this_week")!.start)).toBe("2026-09-26");
    expect(toBusinessGregorianDateString(getJalaliPresetRange("this_month")!.start)).toBe("2026-09-23");
    expect(toBusinessGregorianDateString(getJalaliPresetRange("this_year")!.start)).toBe("2026-03-21");
    expect(parseDashboardRange(null, null)).toEqual(getJalaliPresetRange("this_month"));
  });
  it("accepts Persian digits, Nowruz, leap Esfand and inclusive Tehran end of day", () => {
    const range = parseDashboardRange("۱۴۰۵/۰۱/۰۱", "۱۴۰۵/۰۱/۰۲");
    expect(range.start.toISOString()).toBe("2026-03-20T20:30:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-22T20:29:59.999Z");
    expect(dashboardRangeDays(range)).toBe(2);
    expect(inDashboardRange(range.start, range)).toBe(true);
    expect(inDashboardRange(range.end, range)).toBe(true);
    expect(inDashboardRange(new Date(+range.start - 1), range)).toBe(false);
    expect(inDashboardRange(new Date(+range.end + 1), range)).toBe(false);
    expect(parseJalaliString("1403/12/30")).not.toBeNull();
    expect(parseJalaliString("1404/12/30")).toBeNull();
    expect(parseJalaliString("9999/01/01")).toBeNull();
  });
  it.each([["1405/07/31", "1405/08/01"], ["2026-02-31", "2026-03-01"], ["bad", "2026-01-01"], [null, "2026-01-01"], ["2026-01-02", "2026-01-01"], ["2000-01-01", "2026-01-01"]])("rejects invalid, partial, reversed or oversized range %s / %s", (start, end) => {
    expect(() => parseDashboardRange(start, end)).toThrow();
  });
  it("compares equal civil-day periods across historic Tehran DST", () => {
    const range = parseDashboardRange("2021-03-22", "2021-03-24"), previous = previousDashboardRange(range);
    expect(dashboardRangeDays(previous)).toBe(3);
    expect(previous.end.getTime()).toBe(range.start.getTime() - 1);
    expect(toBusinessGregorianDateString(previous.start)).toBe("2021-03-19");
    expect(parseReportDateParam("1405/07/31")).toBeNull();
  });
});

describe("Dashboard canonical range aggregation", () => {
  it("filters movements before aggregation, excludes future/invalid values and uses real previous totals", () => {
    const range = parseDashboardRange("2026-09-23", "2026-09-24");
    expect(range.start.toISOString()).toBe("2026-09-22T20:30:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-24T20:29:59.999Z");
    const result = buildRangeAnalytics([
      { amount: 50, paymentDate: "2026-09-21T20:30:00Z" },
      { amount: 100, paymentDate: range.start },
      { amount: 200, paymentDate: range.end },
      { amount: 900, paymentDate: new Date(+range.end + 1) },
      { amount: NaN, paymentDate: range.start },
      { amount: 999, paymentDate: "invalid" },
    ], [{ amount: 75, paymentDate: range.end }], range, new Date("2026-09-26T10:00:00Z"));
    expect(result).toMatchObject({ incoming: 300, outgoing: 75, net: 225, incomingChangePercent: 500, previous: { incoming: 50 } });
    expect(result.points).toHaveLength(2);
    expect(result.points.reduce((sum, point) => sum + point.incoming, 0)).toBe(300);
    const future = buildRangeAnalytics([{ amount: 500, paymentDate: "2026-09-24T10:00:00Z" }], [], range, new Date("2026-09-23T10:00:00Z"));
    expect(future.incoming).toBe(0);
  });
  it("zero fills empty calendars and never invents a comparison percentage", () => {
    const result = buildRangeAnalytics([], [], parseDashboardRange("1405/01/01", "1405/06/31"));
    expect(result.points).toHaveLength(6);
    expect(result.points.every(point => point.incoming === 0 && point.outgoing === 0)).toBe(true);
    expect(result.incomingChangePercent).toBeNull();
    expect(result.net).toBe(0);
  });
});
