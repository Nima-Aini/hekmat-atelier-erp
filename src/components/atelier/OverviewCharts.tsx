"use client";

import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartNoAxesCombined, ChartPie } from "lucide-react";
import {
  OverviewCard,
  OverviewEmpty,
  overviewMoney,
  tones,
} from "./OverviewUi";

export type FlowPoint = {
  key: string;
  label: string;
  incoming: number;
  outgoing: number;
};
const chartTooltip = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-dark)",
  borderRadius: 12,
  color: "#e2e8f0",
  fontSize: 12,
  direction: "rtl" as const,
};
const compactMoney = (value: number) =>
  new Intl.NumberFormat("fa-IR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export function CashChart({
  months,
  days,
  dashboard = false,
}: {
  months: FlowPoint[];
  days?: FlowPoint[];
  dashboard?: boolean;
}) {
  const [range, setRange] = useState(dashboard ? "30d" : "6m");
  const gradient = useId().replace(/:/g, "");
  const ranges = dashboard
    ? [
        ["7d", "۷ روز"],
        ["30d", "۳۰ روز"],
        ["3m", "۳ ماه"],
        ["6m", "۶ ماه"],
      ]
    : [
        ["3m", "۳ ماه"],
        ["6m", "۶ ماه"],
        ["12m", "۱۲ ماه"],
      ];
  const points = range.endsWith("d")
    ? (days || []).slice(-parseInt(range))
    : months.slice(-parseInt(range));
  const hasValues = points.some(
    (row) => row.incoming !== 0 || row.outgoing !== 0,
  );
  const shared = (
    <>
      <CartesianGrid stroke="var(--border-dark)" strokeOpacity={0.55} vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fill: "#94a3b8", fontSize: 11 }}
        axisLine={{ stroke: "var(--border-dark)" }}
        tickLine={false}
        minTickGap={28}
        tickMargin={12}
      />
      <YAxis
        width={62}
        tick={{ fill: "#94a3b8", fontSize: 11 }}
        tickFormatter={compactMoney}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip
        contentStyle={chartTooltip}
        labelStyle={{ color: "#f1f5f9", marginBottom: 8 }}
        formatter={(value, name) => [overviewMoney(value), name]}
        cursor={{
          fill: "rgba(161,161,170,.05)",
          stroke: "#71717a",
          strokeDasharray: "3 3",
        }}
      />
    </>
  );
  return (
    <OverviewCard
      title={dashboard ? "روند دریافت و پرداخت" : "نمودار درآمد و هزینه"}
      icon={ChartNoAxesCombined}
      action={
        <div className="flex flex-wrap gap-1" aria-label="بازه نمودار">
          {ranges.map(([key, label]) => (
            <button
              key={key}
              aria-pressed={range === key}
              onClick={() => setRange(key)}
              className={`overview-range ${range === key ? "is-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-300">
        <span className="flex items-center gap-2">
          <i className="h-2 w-2 rounded-full bg-emerald-400" />
          دریافت
        </span>
        <span className="flex items-center gap-2">
          <i className="h-2 w-2 rounded-full bg-rose-500" />
          پرداخت
        </span>
        <span className="mr-auto text-slate-500">تومان</span>
      </div>
      {hasValues ? (
        <div className="overview-chart" dir="ltr">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {dashboard ? (
              <AreaChart
                data={points}
                margin={{ top: 10, right: 12, left: 0, bottom: 8 }}
              >
                <defs>
                  {[
                    ["in", tones.green],
                    ["out", tones.red],
                  ].map(([key, color]) => (
                    <linearGradient
                      key={key}
                      id={`${gradient}-${key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                      <stop
                        offset="100%"
                        stopColor={color}
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  ))}
                </defs>
                {shared}
                <Area
                  name="دریافت"
                  dataKey="incoming"
                  type="monotone"
                  stroke={tones.green}
                  strokeWidth={2.5}
                  fill={`url(#${gradient}-in)`}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Area
                  name="پرداخت"
                  dataKey="outgoing"
                  type="monotone"
                  stroke={tones.red}
                  strokeWidth={2.5}
                  fill={`url(#${gradient}-out)`}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            ) : (
              <BarChart
                data={points}
                barGap={5}
                margin={{ top: 10, right: 12, left: 0, bottom: 8 }}
              >
                {shared}
                <Bar
                  name="دریافت"
                  dataKey="incoming"
                  fill={tones.green}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
                <Bar
                  name="پرداخت"
                  dataKey="outgoing"
                  fill={tones.red}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <OverviewEmpty>
          در این بازه دریافت یا پرداختی ثبت نشده است. با تغییر بازه، سابقه مالی
          را بررسی کنید.
        </OverviewEmpty>
      )}
    </OverviewCard>
  );
}

type Distribution = {
  id?: string;
  name: string;
  value: number;
  color?: string;
};
export function DistributionChart({
  title,
  rows,
  total,
  centerLabel,
  money = false,
  onSelect,
}: {
  title: string;
  rows: Distribution[];
  total: number;
  centerLabel: string;
  money?: boolean;
  onSelect?: (id: string) => void;
}) {
  const palette = money
    ? ["#f43f55", "#fb7185", "#fda4af", "#fecdd3", "#9f1239"]
    : [tones.amber, tones.green, tones.blue, tones.purple, tones.red];
  const positive = rows.filter((row) => row.value > 0);
  const positiveTotal = positive.reduce((sum, row) => sum + row.value, 0);
  return (
    <OverviewCard title={title} icon={ChartPie}>
      {positiveTotal > 0 ? (
        <div className="overview-distribution">
          <div className="relative h-52 min-w-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={positive}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="69%"
                  outerRadius="94%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                  onClick={(_row, index) =>
                    positive[index]?.id && onSelect?.(positive[index].id!)
                  }
                >
                  {positive.map((row, i) => (
                    <Cell
                      key={row.id || row.name}
                      fill={row.color || palette[i % palette.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={chartTooltip}
                  formatter={(value) =>
                    money
                      ? overviewMoney(value)
                      : Number(value).toLocaleString("fa-IR")
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
              dir="rtl"
            >
              <strong
                className={`break-words font-extrabold ${money ? "text-lg" : "text-3xl"}`}
              >
                {Number(total).toLocaleString("fa-IR")}
              </strong>
              {money && <span className="text-xs text-slate-300">تومان</span>}
              <span className="mt-2 text-xs text-slate-400">{centerLabel}</span>
            </div>
          </div>
          <div className="space-y-3">
            {rows.map((row) => {
              const i = positive.indexOf(row);
              const content = (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    <i
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background:
                          row.color ||
                          palette[(i >= 0 ? i : 0) % palette.length],
                      }}
                    />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="text-left tabular-nums">
                    <b className="block text-xs font-medium text-slate-200">
                      {money
                        ? overviewMoney(row.value)
                        : row.value.toLocaleString("fa-IR")}
                    </b>
                    <span className="text-[11px] text-slate-500">
                      {row.value > 0
                        ? ((row.value / positiveTotal) * 100).toLocaleString(
                            "fa-IR",
                            { maximumFractionDigits: 1 },
                          )
                        : "۰"}
                      ٪
                    </span>
                  </span>
                </>
              );
              return onSelect && row.id ? (
                <button
                  key={row.id}
                  className="flex w-full items-center justify-between gap-3 rounded-lg text-right text-xs text-slate-300 hover:text-white"
                  onClick={() => onSelect(row.id!)}
                >
                  {content}
                </button>
              ) : (
                <div
                  key={row.name}
                  className="flex items-center justify-between gap-3 text-xs text-slate-300"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <OverviewEmpty>
          {money
            ? "هنوز موجودی مثبت در حساب‌ها ثبت نشده است."
            : "هنوز قراردادی برای نمایش وضعیت ثبت نشده است."}
        </OverviewEmpty>
      )}
      {money && rows.some((row) => row.value < 0) && (
        <p className="mt-3 text-xs leading-5 text-amber-400">
          حساب‌های با موجودی منفی در سهم نمودار نمایش داده نمی‌شوند؛ کل موجودی
          شامل آن‌هاست.
        </p>
      )}
    </OverviewCard>
  );
}
