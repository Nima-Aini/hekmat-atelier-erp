"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { gregorianToJalali, jalaliToGregorian, toBusinessGregorianDateString, toJalaliDate } from "@/lib/dateUtils";
import { type CalendarDay, type CalendarThresholds } from "@/lib/atelierCalendar";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { dashboardPresetSelection, type DashboardDateSelection } from "@/lib/dashboardDateSelection";
import { DashboardRangeFilter } from "./DashboardRangeFilter";
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
  const [selection, setSelection] = useState<DashboardDateSelection>(() => dashboardPresetSelection("today"));
  const range = selection.range;
  const [displayedPeriod, setDisplayedPeriod] = useState("");
  const controller = useRef<AbortController | null>(null);
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarThresholds, setCalendarThresholds] = useState<CalendarThresholds>();
  const [calendarError, setCalendarError] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(true);
  const canSeeCalendar = canSeeAtelierSection("calendar", permissions);
  useEffect(() => {
    if (!canSeeCalendar) return;
    const controller = new AbortController();
    fetch("/api/atelier/calendar", { cache: "no-store", signal: controller.signal })
      .then(response => response.json())
      .then(body => { if (!controller.signal.aborted) { if (body.success) { setCalendarDays(body.calendar?.days || []); setCalendarThresholds(body.calendar?.thresholds); setCalendarError(""); } else setCalendarError(body.error || "دریافت تقویم ممکن نشد."); setCalendarLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) { setCalendarError("دریافت تقویم ممکن نشد."); setCalendarLoading(false); } });
    return () => controller.abort();
  }, [canSeeCalendar]);
  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ startDate: toBusinessGregorianDateString(range.start), endDate: toBusinessGregorianDateString(range.end) });
      const response = await fetch(`/api/atelier/dashboard?${params}`, {
        cache: "no-store",
        signal: current.signal,
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error || "دریافت اطلاعات ممکن نشد.");
      if (!current.signal.aborted) {
        setData(body.dashboard);
        setDisplayedPeriod(`${toJalaliDate(range.start)} تا ${toJalaliDate(range.end)} · نمای کلی آتلیه`);
      }
    } catch (reason) {
      if (current.signal.aborted) return;
      setError(
        reason instanceof Error ? reason.message : "ارتباط با سرور برقرار نشد.",
      );
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, [range]);
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
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
      <header className="space-y-3 py-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">
            سلام، {userName}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            هر قاب، یک داستان؛ هر برنامه، گامی برای ثبت ماندگارترین لحظه‌ها.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            خلاصهٔ بازه انتخابی؛ وضعیت جاری و برنامه‌های پیش رو مستقل از بازه هستند.
          </p>
        </div>
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <button
            aria-label="به‌روزرسانی داشبورد"
            title="به‌روزرسانی"
            onClick={() => void load()}
            disabled={loading}
            className="atelier-icon-button"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        </div>
        <DashboardRangeFilter selection={selection} onChange={setSelection} />
      </header>
      {data && (loading || error) && <p role="status" aria-live="polite" className="flex items-center gap-2 text-[11px] text-zinc-400">
        {loading && <RefreshCw className="h-3 w-3 animate-spin" />}
        {loading ? "در حال به‌روزرسانی؛ " : "به‌روزرسانی انجام نشد؛ "}اطلاعات نمایش‌داده‌شده مربوط به {displayedPeriod} است.
      </p>}
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
                title="دریافت بازه انتخابی"
                value={overviewMoney(finance.rangeAnalytics?.incoming)}
                context={`پرداخت‌های تکمیل‌شده · پرداخت بازه: ${overviewMoney(finance.rangeAnalytics?.outgoing)}`}
                icon={WalletCards}
                tone="green"
                onClick={() => navigate("finance")}
              />
            )}
            <MetricCard
              title="پیش‌قراردادها"
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
          {canSeeCalendar && <CalendarPreview days={calendarDays} thresholds={calendarThresholds} error={calendarError} loading={calendarLoading} onOpen={() => navigate("calendar")} />}
          <div className="overview-analytics-grid grid items-stretch gap-5 lg:grid-cols-[1.7fr_1fr]">
            {finance ? (
              <CashChart
                dashboard
                periodPoints={finance.rangeAnalytics?.points}
                periodLabel="بازه انتخابی"
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
              centerLabel="قراردادهای بازه"
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

function CalendarPreview({ days, thresholds, error, loading, onOpen }: { days: CalendarDay[]; thresholds?: CalendarThresholds; error: string; loading: boolean; onOpen: () => void }) {
  const today = gregorianToJalali(new Date());
  const [view, setView] = useState({ year: today.year, month: today.month });
  const [selectedDate, setSelectedDate] = useState(toBusinessGregorianDateString(new Date()));
  const selected = days.find(day => day.date === selectedDate);
  return <OverviewCard title="تقویم" icon={CalendarDays} action={<button type="button" className="overview-range" onClick={onOpen}>مشاهده تقویم</button>}>
    {error ? <p role="alert" className="text-xs text-amber-300">{error}</p> : loading ? <p role="status" className="text-xs text-slate-400">در حال دریافت برنامه‌ها…</p> : <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <CalendarMonthGrid compact view={view} onViewChange={next => { setView(next); setSelectedDate(toBusinessGregorianDateString(jalaliToGregorian({ ...next, day: 1 }))); }} days={days} thresholds={thresholds} selectedDate={selectedDate} onSelect={day => setSelectedDate(day.date)} />
      <section aria-live="polite" className="min-w-0">
        <h3 className="mb-2 text-xs font-bold text-slate-200">برنامه‌های {toJalaliDate(new Date(`${selectedDate}T12:00:00+03:30`))}</h3>
        <p className="mb-2 text-[10px] text-slate-500">مستقل از بازهٔ آمار داشبورد</p>
        {selected?.contracts.length ? <div className="max-h-52 space-y-2 overflow-y-auto">{selected.contracts.map(contract => <button type="button" key={contract.id} onClick={onOpen} className="block w-full min-w-0 rounded-xl border border-slate-800 bg-black/20 p-2 text-right hover:border-red-800">
          <span className="block truncate text-xs font-semibold text-slate-100">{contract.projectType.title}</span>
          <span className="mt-1 block truncate text-[11px] text-slate-400">{contract.customer.name}</span>
          <time className="mt-1 block text-[11px] text-red-300">{toJalaliDate(contract.programDate, { showTime: true })}</time>
        </button>)}</div> : <p className="text-xs text-slate-500">برنامهٔ تأییدشده‌ای برای این روز ثبت نشده است.</p>}
      </section>
    </div>}
  </OverviewCard>;
}
