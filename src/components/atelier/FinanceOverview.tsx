"use client";

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BanknoteArrowDown,
  CalendarDays,
  Clock3,
  Landmark,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { toJalaliDate, toBusinessGregorianDateString } from "@/lib/dateUtils";
import { CashChart, DistributionChart } from "./OverviewCharts";
import {
  MetricCard,
  OverviewCard,
  OverviewEmpty,
  OverviewTable,
  overviewMoney,
} from "./OverviewUi";
import { NeonStatus } from "./FinanceControls";

export function FinanceOverview({
  data,
  onTab,
  onReceipt,
  onExpense,
  onAccount,
  onInstallment,
  onOutgoing,
}: {
  data: Record<string, any>;
  onTab: (tab: string) => void;
  onReceipt: () => void;
  onExpense: () => void;
  onAccount: (id: string) => void;
  onInstallment: (row: any) => void;
  onOutgoing: (row: any) => void;
}) {
  const s = data.summary,
    month = data.analytics.currentMonth;
  const transactions = [
    ...data.receipts.map((row: any) => ({ ...row, incoming: true })),
    ...data.payments.map((row: any) => ({ ...row, incoming: false })),
  ]
    .sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate))
    .slice(0, 6);
  const installments = data.installments.filter(
    (row: any) => row.remainingAmount > 0 && row.daysToDue <= 7,
  );
  const today = toBusinessGregorianDateString(new Date());
  const timing = (due: string | null) =>
    !due
      ? "بدون سررسید"
      : toBusinessGregorianDateString(due) < today
        ? "سررسید گذشته"
        : toBusinessGregorianDateString(due) === today
          ? "امروز"
          : toJalaliDate(due, { format: "short" });
  const attention = [
    ...installments.map((row: any) => ({
      id: `installment:${row.id}`,
      title: `${row.customerName || row.contractNumber} · ${row.title}`,
      amount: row.remainingAmount,
      date: row.dueDate,
      kind: "قسط",
      open: () => onInstallment(row),
    })),
    ...data.salaries
      .filter((row: any) => row.remainingAmount > 0)
      .map((row: any) => ({
        id: `salary:${row.id}`,
        title: row.personnelName,
        amount: row.remainingAmount,
        date: null,
        kind: "حقوق",
        open: () => onOutgoing({ kind: "personnel_wage", row }),
      })),
    ...data.payables
      .filter((row: any) => row.remainingAmount > 0)
      .map((row: any) => ({
        id: `payable:${row.id}`,
        title: row.title,
        amount: row.remainingAmount,
        date: row.dueDate,
        kind: row.sourceType === "rental" ? "اجاره" : "هزینه",
        open: () =>
          onOutgoing({
            kind: row.sourceType === "rental" ? "rental" : "expense",
            row,
          }),
      })),
  ]
    .sort(
      (a, b) =>
        (a.date ? +new Date(a.date) : Infinity) -
        (b.date ? +new Date(b.date) : Infinity),
    )
    .slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="موجودی کل"
          value={overviewMoney(s.liquidity)}
          context={`${data.accounts.length.toLocaleString("fa-IR")} حساب و صندوق فعال`}
          icon={Landmark}
          tone="blue"
        />
        <MetricCard
          title="دریافت این ماه"
          value={overviewMoney(month.incoming)}
          context={month.label}
          icon={BanknoteArrowDown}
          tone="green"
        />
        <MetricCard
          title="پرداخت این ماه"
          value={overviewMoney(month.outgoing)}
          context={month.label}
          icon={ArrowUpRight}
          tone="red"
        />
        <MetricCard
          title="جریان نقدی خالص"
          value={overviewMoney(month.net)}
          context="دریافت منهای پرداخت ماه جاری"
          icon={TrendingUp}
          tone={month.net < 0 ? "red" : "purple"}
        />
      </div>
      <div className="overview-analytics-grid grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <CashChart months={data.analytics.months} />
        <DistributionChart
          title="توزیع حساب‌ها و صندوق‌ها"
          rows={data.accounts.map((row: any) => ({
            id: row.id,
            name: row.name,
            value: row.balance,
          }))}
          total={s.liquidity}
          centerLabel="کل موجودی"
          money
          onSelect={onAccount}
        />
      </div>
      <div className="overview-analytics-grid grid items-start gap-5 lg:grid-cols-[1.65fr_1fr]">
        <OverviewCard
          title="آخرین تراکنش‌ها"
          icon={Clock3}
          action={
            <button
              onClick={() => onTab("گردش نقدینگی")}
              className="overview-range"
            >
              مشاهده همه
            </button>
          }
        >
          <OverviewTable
            headers={["تاریخ", "شرح / مرتبط با", "نوع", "مبلغ", "حساب / صندوق"]}
            rows={transactions.map((row: any) => [
              toJalaliDate(row.paymentDate),
              <span key="description" className="block max-w-60">
                {row.source?.title ||
                  row.notes ||
                  (row.incoming ? "دریافت مشتری" : "پرداخت ثبت‌شده")}
                <small className="block text-slate-500">
                  {row.paymentNumber}
                </small>
              </span>,
              <NeonStatus
                key="type"
                tone={row.incoming ? "success" : "critical"}
              >
                {row.incoming ? "دریافت" : "پرداخت"}
              </NeonStatus>,
              <span
                key="amount"
                className={row.incoming ? "text-emerald-400" : "text-rose-400"}
              >
                {row.incoming ? "+" : "−"}
                {overviewMoney(row.amount)}
              </span>,
              row.accountName,
            ])}
          />
        </OverviewCard>
        <div className="space-y-4">
          <OverviewCard title="پیگیری مالی مهم" icon={AlertCircle}>
            {attention.length ? (
              <div className="divide-y divide-slate-800">
                {attention.map((row) => (
                  <button
                    key={row.id}
                    onClick={row.open}
                    className="flex w-full items-start justify-between gap-3 py-3 text-right first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      <span className="text-[11px] text-slate-500">
                        {row.kind}
                      </span>
                      <b className="mt-1 block text-xs leading-5">
                        {row.title}
                      </b>
                      <span
                        className={`mt-1 block text-[11px] ${row.date && toBusinessGregorianDateString(row.date) < today ? "text-rose-400" : "text-amber-300"}`}
                      >
                        {timing(row.date)}
                      </span>
                    </span>
                    <b className="shrink-0 text-xs text-amber-300">
                      {overviewMoney(row.amount)}
                    </b>
                  </button>
                ))}
              </div>
            ) : (
              <OverviewEmpty>
                قسط نزدیک یا تعهد پرداخت‌نشده‌ای وجود ندارد.
              </OverviewEmpty>
            )}
          </OverviewCard>
          <OverviewCard title="تعهدات و مطالبات باز" icon={CalendarDays}>
            <div className="space-y-3 text-sm">
              {[
                ["مطالبات مشتریان", s.receivable, "مطالبات", "text-amber-300"],
                [
                  "بدهی پرسنل",
                  s.personnelDebt,
                  "حقوق و دستمزد",
                  "text-rose-400",
                ],
                ["بدهی اجاره", s.rentalDebt, "بدهی‌ها", "text-rose-400"],
                ["کل تعهدات پرداخت", s.payable, "بدهی‌ها", "text-rose-400"],
              ].map(([label, amount, tab, color]) => (
                <button
                  key={String(label)}
                  onClick={() => onTab(String(tab))}
                  className="flex w-full items-center justify-between gap-3 text-right"
                >
                  <span className="text-xs text-slate-400">{label}</span>
                  <b className={`text-xs ${color}`}>{overviewMoney(amount)}</b>
                </button>
              ))}
            </div>
          </OverviewCard>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onReceipt}
              className="atelier-button !border-emerald-700 !bg-emerald-800"
            >
              <ArrowDownLeft className="h-4 w-4" />
              ثبت دریافت
            </button>
            <button onClick={onExpense} className="atelier-button">
              <ArrowUpRight className="h-4 w-4" />
              ثبت هزینه
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
