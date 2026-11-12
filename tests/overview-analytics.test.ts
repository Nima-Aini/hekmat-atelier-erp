import { describe, expect, it } from "vitest";
import { buildOverviewAnalytics } from "../src/services/studio/overviewAnalytics";

describe("canonical overview reporting", () => {
  it("uses Tehran Jalali month boundaries, includes each movement once and excludes future payments", () => {
    const now = new Date("2026-09-26T10:00:00Z");
    const analytics = buildOverviewAnalytics([
      { amount: 100, paymentDate: "2026-09-22T20:29:59Z" }, // Last second of Shahrivar in Tehran.
      { amount: 200, paymentDate: "2026-09-22T20:30:00Z" }, // Mehr 1, midnight Tehran.
      { amount: 400, paymentDate: "2026-09-26T09:00:00Z" },
      { amount: 999, paymentDate: "2026-10-01T00:00:00Z" },
    ], [{ amount: 75, paymentDate: "2026-09-24T12:00:00Z" }], now);
    expect(analytics.months).toHaveLength(12);
    expect(analytics.days).toHaveLength(30);
    expect(analytics.months[10]).toMatchObject({ key: "1405-6", incoming: 100 });
    expect(analytics.months[11]).toMatchObject({ key: "1405-7", incoming: 600, outgoing: 75 });
    expect(analytics.currentMonth).toMatchObject({ incoming: 600, outgoing: 75, net: 525 });
    expect(analytics.days.reduce((sum,row) => sum + row.incoming, 0)).toBe(700);
  });

  it("zero-fills periods only from the reporting calendar, without invented financial values", () => {
    const analytics = buildOverviewAnalytics([], [], new Date("2026-03-21T12:00:00Z"));
    expect(analytics.months[11].key).toBe("1405-1");
    expect(analytics.months[10].key).toBe("1404-12");
    expect(analytics.currentMonth).toMatchObject({ incoming: 0, outgoing: 0, net: 0 });
    expect(analytics.months.every((row) => row.incoming === 0 && row.outgoing === 0)).toBe(true);
  });
});
