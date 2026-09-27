import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dashboardCustomSelection, dashboardDaySelection, dashboardPresetSelection, dashboardSelectionLabel } from "../src/lib/dashboardDateSelection";
import { dashboardPresets, parseDashboardRange } from "../src/lib/dashboardRange";
import { parseJalaliString, toBusinessGregorianDateString } from "../src/lib/dateUtils";
import { DashboardRangeFilter } from "../src/components/atelier/DashboardRangeFilter";
import { JalaliDatePicker } from "../src/components/ui/JalaliDatePicker";

afterEach(() => vi.useRealTimers());
describe("Dashboard unified date selection UX", () => {
  it("normalizes a selected Jalali day to inclusive Tehran boundaries", () => {
    const selection = dashboardDaySelection(parseJalaliString("1405/07/06")!);
    expect(selection.range.start.toISOString()).toBe("2026-09-27T20:30:00.000Z");
    expect(selection.range.end.toISOString()).toBe("2026-09-28T20:29:59.999Z");
    expect(toBusinessGregorianDateString(selection.range.start)).toBe("2026-09-28");
    expect(toBusinessGregorianDateString(selection.range.end)).toBe("2026-09-28");
  });
  it("uses the same active state for the today label and reporting range", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-27T09:00:00Z"));
    const selection = dashboardPresetSelection("today");
    expect(dashboardSelectionLabel(selection)).toBe("امروز، ۵ مهر ۱۴۰۵");
    expect(dashboardDaySelection(selection.range.start).preset).toBe("today");
    expect(dashboardSelectionLabel(dashboardDaySelection(parseJalaliString("1405/06/20")!))).toBe("۲۰ شهریور ۱۴۰۵");
  });
  it("keeps all six presets backed by real ranges and matching labels", () => {
    for (const [preset, label] of dashboardPresets) {
      if (preset === "custom") continue;
      const selection = dashboardPresetSelection(preset);
      expect(selection.preset).toBe(preset);
      expect(selection.range).toEqual(parseDashboardRange(toBusinessGregorianDateString(selection.range.start), toBusinessGregorianDateString(selection.range.end)));
      if (preset !== "today") expect(dashboardSelectionLabel(selection)).toBe(label);
    }
  });
  it("validates custom dates and normalizes the end of the final day", () => {
    const start = parseJalaliString("1405/06/20")!, end = parseJalaliString("1405/06/29")!;
    const selection = dashboardCustomSelection(start, end);
    expect(selection.preset).toBe("custom");
    expect(selection.range).toEqual(parseDashboardRange("1405/06/20", "1405/06/29"));
    expect(dashboardSelectionLabel(selection)).toBe("۲۰ شهریور ۱۴۰۵ تا ۲۹ شهریور ۱۴۰۵");
    expect(() => dashboardCustomSelection(end, start)).toThrow();
    expect(() => dashboardCustomSelection(new Date(NaN), end)).toThrow();
  });
  it("renders one clickable active date and segmented presets without permanent date inputs", () => {
    const markup = renderToStaticMarkup(createElement(DashboardRangeFilter, { selection: dashboardPresetSelection("this_month"), onChange: () => {} }));
    expect(markup).toContain("انتخاب روز داشبورد؛ این ماه");
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-label="بازه‌های آماده داشبورد"');
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("اعمال بازه");
    expect(markup).not.toContain("<select");
  });
  it("preserves the normal form picker while supporting an accessible header trigger", () => {
    const value = parseJalaliString("1405/07/06")!;
    const form = renderToStaticMarkup(createElement(JalaliDatePicker, { value, onChange: () => {} }));
    expect(form).toContain("<input"); expect(form).toContain("2026-09-28");
    const header = renderToStaticMarkup(createElement(JalaliDatePicker, { value, onChange: () => {}, trigger: "۶ مهر ۱۴۰۵", triggerLabel: "انتخاب روز" }));
    expect(header).not.toContain("<input"); expect(header).toContain('aria-expanded="false"');
    expect(header).not.toContain("معادل میلادی");
  });
});
