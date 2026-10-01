import {
  gregorianToJalali,
  jalaliToGregorian,
  toBusinessGregorianDateString,
  toJalaliDate,
} from "@/lib/dateUtils";
import { dashboardRangeDays, inDashboardRange, previousDashboardRange, shiftBusinessDays, type DashboardRange } from "@/lib/dashboardRange";

type Movement = { amount: number; paymentDate: Date | string };

/** Read-only reporting of completed canonical payments; expense recognition is not cash outflow. */
export function buildOverviewAnalytics(
  receipts: Movement[],
  payments: Movement[],
  now = new Date(),
) {
  const current = gregorianToJalali(now);
  const months = Array.from({ length: 12 }, (_, index) => {
    const serial = current.year * 12 + current.month - 1 - (11 - index);
    const year = Math.floor(serial / 12),
      month = (serial % 12) + 1;
    const start = jalaliToGregorian({ year, month, day: 1 });
    return {
      key: `${year}-${month}`,
      label: new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        timeZone: "Asia/Tehran",
        month: "long",
        year: "numeric",
      }).format(start),
      incoming: 0,
      outgoing: 0,
    };
  });
  const today = toBusinessGregorianDateString(now);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(`${today}T12:00:00+03:30`);
    date.setUTCDate(date.getUTCDate() - (29 - index));
    return {
      key: toBusinessGregorianDateString(date),
      label: toJalaliDate(date, { format: "short" }),
      incoming: 0,
      outgoing: 0,
    };
  });
  const add = (rows: Movement[], field: "incoming" | "outgoing") => {
    for (const row of rows) {
      const instant = new Date(row.paymentDate);
      if (!Number.isFinite(+instant) || +instant > +now || !Number.isFinite(Number(row.amount))) continue;
      const j = gregorianToJalali(instant);
      const month = months.find((item) => item.key === `${j.year}-${j.month}`);
      const day = days.find(
        (item) => item.key === toBusinessGregorianDateString(instant),
      );
      if (month) month[field] += Number(row.amount);
      if (day) day[field] += Number(row.amount);
    }
  };
  add(receipts, "incoming");
  add(payments, "outgoing");
  const month = months[11];
  return {
    months,
    days,
    currentMonth: {
      label: month.label,
      incoming: month.incoming,
      outgoing: month.outgoing,
      net: month.incoming - month.outgoing,
    },
  };
}

/** Same canonical completed movements as Finance; filter before aggregating. */
export function buildRangeAnalytics(receipts: Movement[], payments: Movement[], range: DashboardRange, now = new Date()) {
  const monthly = dashboardRangeDays(range) > 90;
  const key = (date: Date) => {
    const j = gregorianToJalali(date);
    return monthly ? `${j.year}-${String(j.month).padStart(2, "0")}` : toBusinessGregorianDateString(date);
  };
  const buckets = new Map<string, { key: string; label: string; incoming: number; outgoing: number }>();
  for (let i = 0; i < dashboardRangeDays(range); i++) {
    const date = shiftBusinessDays(range.start, i), id = key(date);
    if (!buckets.has(id)) buckets.set(id, { key: id, label: monthly ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "long" }).format(date) : toJalaliDate(date, { format: "short" }), incoming: 0, outgoing: 0 });
  }
  const previous = previousDashboardRange(range);
  const totals = { incoming: 0, outgoing: 0 }, previousTotals = { incoming: 0, outgoing: 0 };
  const add = (rows: Movement[], field: "incoming" | "outgoing") => {
    for (const row of rows) {
      const date = new Date(row.paymentDate), amount = Number(row.amount);
      if (!Number.isFinite(+date) || +date > +now || !Number.isFinite(amount)) continue;
      if (inDashboardRange(date, range)) { totals[field] += amount; const bucket = buckets.get(key(date)); if (bucket) bucket[field] += amount; }
      if (inDashboardRange(date, previous)) previousTotals[field] += amount;
    }
  };
  add(receipts, "incoming"); add(payments, "outgoing");
  return { points: [...buckets.values()], ...totals, net: totals.incoming - totals.outgoing, previous: { start: previous.start, end: previous.end, ...previousTotals }, incomingChangePercent: previousTotals.incoming > 0 ? (totals.incoming - previousTotals.incoming) / previousTotals.incoming * 100 : null };
}
