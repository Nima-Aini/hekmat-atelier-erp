"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CalendarClock,
  Clock3,
  FileSignature,
  UsersRound,
  WalletCards,
  RefreshCw,
  Zap,
  AlertCircle,
  Camera,
} from "lucide-react";
import { toJalaliDate } from "@/lib/dateUtils";
import { canSeeAtelierSection } from "@/lib/atelierNavigation";
import { CashChart, DistributionChart } from "./OverviewCharts";
import {
  MetricCard,
  OverviewCard,
  OverviewEmpty,
  OverviewSkeleton,
  OverviewTable,
  overviewMoney,
  tones,
  type Tone,
} from "./OverviewUi";
import { NeonStatus } from "./FinanceControls";

export function FinalDashboard({
  onNavigate,
  userName = "مدیر سیستم",
  permissions = [],
}: {
  onNavigate: (tab: string) => void;
  userName?: string;
  permissions?: string[];
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/atelier/dashboard", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error || "دریافت اطلاعات ممکن نشد.");
      setData(body.dashboard);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "ارتباط با سرور برقرار نشد.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const overview = data?.overview;
  const finance = overview?.finance;
  const navigate = (tab: string) => {
    if (canSeeAtelierSection(tab, permissions)) onNavigate(tab);
  };
  const quickActions = [
    {
      tab: "contracts",
      title: "مدیریت قراردادها",
      subtitle: "ثبت و پیگیری قرارداد",
      icon: FileSignature,
      tone: "purple",
    },
    {
      tab: "reservations",
      title: "رزروهای آتلیه",
      subtitle: "ثبت و مدیریت رزرو",
      icon: CalendarDays,
      tone: "amber",
    },
    {
      tab: "customers",
      title: "مشتریان",
      subtitle: "پرونده و سوابق مشتری",
      icon: UsersRound,
      tone: "blue",
    },
    {
      tab: "finance",
      title: "ثبت دریافت و هزینه",
      subtitle: "مرکز مالی آتلیه",
      icon: WalletCards,
      tone: "green",
    },
  ].filter((row) => canSeeAtelierSection(row.tab, permissions));
  return (
    <div className="overview-page space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 py-1">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">
            سلام، {userName}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            خلاصه‌ای از وضعیت امروز آتلیه
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="overview-secondary-surface flex items-center gap-3 rounded-xl border px-4 py-2.5">
            <CalendarDays className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-400">امروز</p>
              <time className="mt-1 block text-xs font-bold">
                {toJalaliDate(new Date(), { format: "words" })}
              </time>
            </div>
          </div>
          <button
            aria-label="به‌روزرسانی داشبورد"
            onClick={() => void load()}
            disabled={loading}
            className="atelier-icon-button"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="overview-card flex flex-wrap items-center gap-3 text-sm text-red-300"
        >
          <AlertCircle className="h-5 w-5" />
          <span className="flex-1">{error}</span>
          <button
            className="atelier-button-secondary"
            onClick={() => void load()}
          >
            تلاش دوباره
          </button>
        </div>
      )}
      {!data ? (
        loading && <OverviewSkeleton />
      ) : (
        <>
          <div
            className={`grid gap-4 sm:grid-cols-2 ${finance ? "overview-dashboard-metrics xl:grid-cols-5" : "xl:grid-cols-4"}`}
          >
            <MetricCard
              title="پروژه‌های فعال"
              value={overview.activeProjects.toLocaleString("fa-IR")}
              context="قراردادهای تأییدشده در برنامه‌ریزی"
              icon={Camera}
              tone="blue"
              onClick={() => navigate("planning")}
            />
            <MetricCard
              title="رزروهای پیش رو"
              value={overview.upcomingReservations.toLocaleString("fa-IR")}
              context="رزروهای در انتظار در ۳۰ روز آینده"
              icon={CalendarClock}
              tone="amber"
              onClick={() => navigate("reservations")}
            />
            {finance && (
              <MetricCard
                title="دریافت ماه جاری"
                value={overviewMoney(finance.analytics.currentMonth.incoming)}
                context={finance.analytics.currentMonth.label}
                icon={WalletCards}
                tone="green"
                onClick={() => navigate("finance")}
              />
            )}
            <MetricCard
              title="قراردادهای در انتظار"
              value={overview.pendingContracts.toLocaleString("fa-IR")}
              context="نیازمند بررسی و تأیید"
              icon={FileSignature}
              tone="red"
              onClick={() => navigate("contracts")}
            />
            <MetricCard
              title="مشتریان قراردادها"
              value={overview.customerCount.toLocaleString("fa-IR")}
              context={`${overview.contractCount.toLocaleString("fa-IR")} قرارداد ثبت‌شده`}
              icon={UsersRound}
              tone="purple"
              onClick={() => navigate("customers")}
            />
          </div>
          <div className="overview-analytics-grid grid items-stretch gap-5 lg:grid-cols-[1.7fr_1fr]">
            {finance ? (
              <CashChart
                dashboard
                months={finance.analytics.months}
                days={finance.analytics.days}
              />
            ) : (
              <OverviewCard
                title="برنامه‌های ۳۰ روز آینده"
                icon={CalendarClock}
              >
                <OverviewTable
                  headers={["مشتری", "نوع برنامه", "تاریخ"]}
                  rows={overview.upcoming.map((row: any) => [
                    row.customer.name,
                    row.projectType.title,
                    toJalaliDate(row.programDate),
                  ])}
                />
              </OverviewCard>
            )}
            <DistributionChart
              title="وضعیت قراردادها"
              rows={overview.statuses.map((row: { id: string; name: string; value: number }) => ({
                ...row,
                color: ({ draft: tones.amber, signed: tones.green, completed: tones.blue, cancelled: tones.red } as Record<string, string>)[row.id] || tones.purple,
              }))}
              total={overview.contractCount}
              centerLabel="کل قراردادها"
            />
          </div>
          {quickActions.length > 0 && (
            <OverviewCard title="دسترسی سریع" icon={Zap}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {quickActions.map(
                  ({ tab, title, subtitle, icon: Icon, tone }) => (
                    <button
                      key={tab}
                      onClick={() => navigate(tab)}
                      className="overview-secondary-surface group flex items-center gap-3 rounded-xl border p-3 text-right transition"
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                        style={{
                          color: tones[tone as Tone],
                          borderColor: `${tones[tone as Tone]}55`,
                          background: `${tones[tone as Tone]}13`,
                        }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-xs">{title}</b>
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {subtitle}
                        </span>
                      </span>
                      <ArrowLeft className="h-4 w-4 text-slate-500 group-hover:text-white" />
                    </button>
                  ),
                )}
              </div>
            </OverviewCard>
          )}
          <div className="overview-analytics-grid grid gap-5 xl:grid-cols-[1.5fr_1fr_1fr]">
            <OverviewCard
              title="آخرین قراردادها"
              icon={FileSignature}
              action={
                <button
                  onClick={() => navigate("contracts")}
                  className="overview-range"
                >
                  مشاهده همه
                </button>
              }
            >
              <OverviewTable
                headers={["شماره / مشتری", "نوع پروژه", "وضعیت", "تاریخ"]}
                rows={overview.recentContracts.map((row: any) => [
                  <span key="customer">
                    <b className="block">{row.customer.name}</b>
                    <small className="text-slate-500">
                      {row.contractNumber}
                    </small>
                  </span>,
                  row.projectType.title,
                  <NeonStatus
                    key="status"
                    tone={
                      row.status === "signed"
                        ? "success"
                        : row.status === "draft"
                          ? "warning"
                          : "info"
                    }
                  >
                    {row.status === "signed"
                      ? "تأیید شده"
                      : row.status === "draft"
                        ? "در انتظار"
                        : row.status === "cancelled"
                          ? "لغو شده"
                          : "تکمیل شده"}
                  </NeonStatus>,
                  toJalaliDate(row.createdAt),
                ])}
              />
            </OverviewCard>
            <OverviewCard title="فعالیت‌های اخیر" icon={Clock3}>
              {overview.activities.length ? (
                <div className="divide-y divide-slate-800">
                  {overview.activities.map((row: any) => (
                    <button
                      key={row.id}
                      onClick={() => navigate(row.tab)}
                      className="flex w-full items-start gap-3 py-3 text-right first:pt-0 last:pb-0"
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: tones[row.tone as Tone] }}
                      />
                      <span className="min-w-0">
                        <b className="block text-xs">{row.title}</b>
                        <span className="mt-1 block text-xs leading-5 text-slate-400">
                          {row.detail}
                        </span>
                        <time className="mt-1 block text-[11px] text-slate-500">
                          {toJalaliDate(row.date, { showTime: true })}
                        </time>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <OverviewEmpty>هنوز فعالیتی ثبت نشده است.</OverviewEmpty>
              )}
            </OverviewCard>
            <OverviewCard
              title="برنامه‌های نزدیک"
              icon={CalendarClock}
              action={
                <button
                  onClick={() => navigate("planning")}
                  className="text-xs text-slate-400"
                >
                  ۳۰ روز آینده
                </button>
              }
            >
              {overview.upcoming.length ? (
                <div className="space-y-3">
                  {overview.upcoming.map((row: any) => (
                    <button
                      key={row.id}
                      onClick={() => navigate("planning")}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 p-3 text-right"
                    >
                      <span>
                        <b className="block text-xs">{row.customer.name}</b>
                        <span className="mt-1 block text-xs text-slate-400">
                          {row.projectType.title}
                        </span>
                      </span>
                      <span className="text-xs text-amber-300">
                        {toJalaliDate(row.programDate, { format: "short" })}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <OverviewEmpty>
                  در ۳۰ روز آینده برنامه‌ای ثبت نشده است.
                </OverviewEmpty>
              )}
              {finance && (
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-800 pt-4 text-xs">
                  <span className="text-slate-400">مطالبات باز</span>
                  <button
                    onClick={() => navigate("finance")}
                    className="font-bold text-amber-300"
                  >
                    {overviewMoney(finance.summary.receivable)}
                  </button>
                </div>
              )}
            </OverviewCard>
          </div>
        </>
      )}
    </div>
  );
}
