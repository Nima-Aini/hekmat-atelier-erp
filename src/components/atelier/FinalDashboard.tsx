"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  Camera,
  FileSignature,
  RefreshCw,
  WalletCards,
} from "lucide-react";
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
import { toJalaliDate } from "@/lib/dateUtils";

const money = (value: unknown) =>
  value === null || value === undefined
    ? "—"
    : `${Number(value).toLocaleString("fa-IR")} تومان`;
const date = (value: unknown) => (value ? toJalaliDate(value as string) : "—");
const COLORS = [
  "#ef233c",
  "#9f1239",
  "#f97316",
  "#fb7185",
  "#7f1d1d",
  "#f59e0b",
];

function Empty({ children }: { children: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-zinc-800 text-xs text-zinc-600">
      {children}
    </div>
  );
}

export function FinalDashboard({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    fetch("/api/atelier/dashboard")
      .then((response) => response.json())
      .then((value) =>
        value.success
          ? setData(value.dashboard)
          : setError(value.error || "دریافت اطلاعات ممکن نشد."),
      )
      .catch(() => setError("ارتباط با سرور برقرار نشد."));
  };
  useEffect(load, []);
  if (error)
    return (
      <div className="atelier-panel p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p>{error}</p>
        <button onClick={load} className="atelier-button mt-5">
          <RefreshCw className="h-4 w-4" />
          تلاش دوباره
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div
            key={item}
            className="h-40 animate-pulse rounded-2xl border border-zinc-900 bg-zinc-950"
          />
        ))}
      </div>
    );

  return (
    <div className="space-y-5">
      <section className="atelier-panel-red relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -left-12 -top-20 h-60 w-60 rounded-full border-[28px] border-red-950/30 shadow-[0_0_90px_rgba(239,35,60,.15),inset_0_0_55px_rgba(239,35,60,.12)]" />
        <div className="pointer-events-none absolute left-12 top-12 h-px w-1/3 rotate-[-12deg] bg-gradient-to-r from-transparent via-red-500/60 to-transparent shadow-[0_0_12px_#ef233c]" />
        <div className="relative grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="atelier-kicker">STUDIO CONTROL</p>
            <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
              داشبورد حکمت آتلیه
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-400">
              نمای واقعی قراردادها، برنامه‌های پیش‌رو و وضعیت دریافتی آتلیه؛
              بدون داده نمایشی.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
            <button
              onClick={() => onNavigate("contracts")}
              className="rounded-2xl border border-red-950 bg-black/50 p-3"
            >
              <FileSignature className="mx-auto h-5 w-5 text-red-400" />
              <strong className="mt-2 block text-lg">
                {data.pendingContracts.length.toLocaleString("fa-IR")}
              </strong>
              <span className="text-[10px] text-zinc-500">در انتظار</span>
            </button>
            <button
              onClick={() => onNavigate("planning")}
              className="rounded-2xl border border-zinc-800 bg-black/50 p-3"
            >
              <CalendarClock className="mx-auto h-5 w-5 text-orange-400" />
              <strong className="mt-2 block text-lg">
                {data.approvedContracts.length.toLocaleString("fa-IR")}
              </strong>
              <span className="text-[10px] text-zinc-500">برنامه نزدیک</span>
            </button>
            <div className="col-span-2 rounded-2xl border border-zinc-800 bg-black/50 p-3 sm:col-span-1">
              <WalletCards className="mx-auto h-5 w-5 text-emerald-400" />
              <strong className="mt-2 block text-sm">
                {money(data.finance?.remaining)}
              </strong>
              <span className="text-[10px] text-zinc-500">کل مانده</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="atelier-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="atelier-kicker">نیازمند اقدام</p>
              <h2 className="mt-1 font-black">قرارداد های در انتظار</h2>
            </div>
            <button
              onClick={() => onNavigate("contracts")}
              className="text-xs text-red-400"
            >
              مشاهده همه
            </button>
          </div>
          {!data.pendingContracts.length ? (
            <Empty>قرارداد در انتظاری وجود ندارد.</Empty>
          ) : (
            <div className="space-y-2">
              {data.pendingContracts.map((contract: any) => (
                <button
                  key={contract.id}
                  onClick={() => {
                    onNavigate("contracts");
                    setTimeout(
                      () =>
                        window.dispatchEvent(
                          new CustomEvent("akma:navigate-item", {
                            detail: {
                              type: "studio_contract",
                              id: contract.id,
                            },
                          }),
                        ),
                      50,
                    );
                  }}
                  className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-xl border border-zinc-900 bg-black/30 p-3 text-right transition hover:border-red-950 hover:bg-red-950/10"
                >
                  <span>
                    <strong className="block text-sm">
                      {contract.customer.name}
                    </strong>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {contract.projectType.title} • ثبت{" "}
                      {date(contract.createdAt)}
                    </span>
                  </span>
                  <span className="text-left">
                    <strong className="block text-xs text-zinc-200">
                      {money(contract.totalAmount)}
                    </strong>
                    <span className="mt-1 block text-[10px] text-orange-400">
                      در انتظار
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="atelier-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="atelier-kicker">بر اساس تاریخ برنامه</p>
              <h2 className="mt-1 font-black">قرارداد های تایید شده اخیر</h2>
            </div>
            <button
              onClick={() => onNavigate("planning")}
              className="text-xs text-red-400"
            >
              برنامه ریزی
            </button>
          </div>
          {!data.approvedContracts.length ? (
            <Empty>قرارداد تاییدشده‌ای ثبت نشده است.</Empty>
          ) : (
            <div className="space-y-2">
              {data.approvedContracts.map((contract: any) => (
                <button
                  key={contract.id}
                  onClick={() => onNavigate("planning")}
                  className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-xl border border-zinc-900 bg-black/30 p-3 text-right transition hover:border-red-950"
                >
                  <span>
                    <strong className="block text-sm">
                      {contract.customer.name}
                    </strong>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {contract.projectType.title} •{" "}
                      {money(contract.totalAmount)}
                    </span>
                  </span>
                  <span className="rounded-lg border border-red-950 bg-red-950/20 px-2 py-1 text-xs text-red-300">
                    {date(contract.programDate)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="atelier-panel p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="atelier-kicker">کارهای سبک آتلیه</p>
            <h2 className="mt-1 font-black">۳ مراجعه اخیر روزانه</h2>
          </div>
          <button
            onClick={() => onNavigate("daily_visits")}
            className="text-xs text-red-400"
          >
            ثبت و مدیریت
          </button>
        </div>
        {!data.recentDailyVisits.length ? (
          <Empty>هنوز مراجعه روزانه‌ای ثبت نشده است.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {data.recentDailyVisits.map((visit: any) => (
              <button
                key={visit.id}
                onClick={() => onNavigate("daily_visits")}
                className="rounded-2xl border border-zinc-900 bg-gradient-to-br from-zinc-950 to-black p-4 text-right"
              >
                <Camera className="h-5 w-5 text-red-400" />
                <strong className="mt-3 block text-sm">{visit.title}</strong>
                <span className="mt-1 block text-xs text-zinc-500">
                  {visit.customerName} • {date(visit.visitDate)}
                </span>
                <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                  <span>
                    پرداخت{" "}
                    <b className="block text-emerald-400">
                      {money(visit.paidAmount)}
                    </b>
                  </span>
                  <span>
                    مانده{" "}
                    <b className="block text-red-400">
                      {money(visit.remainingAmount)}
                    </b>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="قراردادها بر اساس نوع پروژه">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.charts.projectTypes}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={3}
              >
                {data.charts.projectTypes.map((_: any, index: number) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#09090b",
                  border: "1px solid #3f161d",
                  borderRadius: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="روند قراردادها">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.charts.contractTrend}>
              <defs>
                <linearGradient id="redArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ef233c" stopOpacity={0.5} />
                  <stop offset="1" stopColor="#ef233c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f1f22" vertical={false} />
              <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 10 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: "#09090b",
                  border: "1px solid #3f161d",
                  borderRadius: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#ef233c"
                fill="url(#redArea)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="دریافتی و مانده">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.finance}>
              <CartesianGrid stroke="#1f1f22" vertical={false} />
              <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 10 }} />
              <YAxis hide />
              <Tooltip
                formatter={(value) => money(value)}
                contentStyle={{
                  background: "#09090b",
                  border: "1px solid #3f161d",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {data.charts.finance.map((_: any, index: number) => (
                  <Cell key={index} fill={index ? "#ef233c" : "#22c55e"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="حجم برنامه روزهای آینده">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.workload}>
              <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 9 }} />
              <YAxis
                allowDecimals={false}
                stroke="#71717a"
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#09090b",
                  border: "1px solid #3f161d",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="atelier-panel min-w-0 p-4">
      <h3 className="mb-3 text-xs font-black text-zinc-300">{title}</h3>
      {children}
    </section>
  );
}
