import {
  gregorianToJalali,
  jalaliToGregorian,
  toBusinessGregorianDateString,
  toJalaliDate,
} from "@/lib/dateUtils";

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
      if (!Number.isFinite(+instant) || +instant > +now) continue;
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
