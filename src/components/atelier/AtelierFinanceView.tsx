"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BanknoteArrowDown,
  RefreshCw,
  Search,
  WalletCards,
  Plus,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { atelierToast } from "@/lib/atelierFeedback";
import { atelierLabel } from "@/lib/atelierLabels";
import { AtelierModal } from "./AtelierModal";
import {
  AccountSelector,
  NeonStatus,
  PaymentMethodSelect,
  type AccountOption,
} from "./FinanceControls";

import { FinanceOverview } from "./FinanceOverview";
import { FinanceAccounts } from "./FinanceAccounts";
import { CashChart } from "./OverviewCharts";
import {
  OverviewCard,
  OverviewSkeleton,
  OverviewTable,
  overviewMoney,
} from "./OverviewUi";

type FinanceData = Record<string, any>;
const TABS = [
  "نمای کلی",
  "حساب‌ها و صندوق‌ها",
  "دریافت‌ها",
  "پرداخت‌ها",
  "هزینه‌ها",
  "مطالبات",
  "اقساط",
  "حقوق و دستمزد",
  "بدهی‌ها",
  "سود قراردادها",
  "گردش نقدینگی",
  "گزارش مالی",
] as const;
const money = overviewMoney;
const date = (value: unknown, showTime = false) =>
  value
    ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        dateStyle: "medium",
        ...(showTime ? { timeStyle: "short" } : {}),
        timeZone: "Asia/Tehran",
      }).format(new Date(String(value)))
    : "—";
const inputClass = "atelier-input w-full px-3 py-2.5 text-sm";

function Empty({
  children = "داده‌ای برای نمایش وجود ندارد.",
}: {
  children?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
function Table(props: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <OverviewCard>
      <OverviewTable {...props} />
    </OverviewCard>
  );
}
function ReportTotals({ rows }: { rows: { label: string; amount: number }[] }) {
  return (
    <OverviewTable
      headers={["عنوان", "مبلغ"]}
      rows={rows.map((row) => [atelierLabel(row.label), money(row.amount)])}
    />
  );
}
const statusTone = (status: string) =>
  status === "paid"
    ? "success"
    : status === "overdue"
      ? "critical"
      : status === "due_soon"
        ? "warning"
        : "info";
const statusLabel = (status: string) =>
  ({
    paid: "پرداخت شده",
    partial: "بخشی پرداخت شده",
    overdue: "سررسید گذشته",
    due_soon: "سررسید نزدیک",
    pending: "در انتظار",
  })[status] || status;

export function AtelierFinanceView({
  initialContractId,
}: {
  initialContractId?: string | null;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("نمای کلی"),
    [data, setData] = useState<FinanceData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [receipt, setReceipt] = useState<any>(null),
    [contract, setContract] = useState<any>(null),
    [schedule, setSchedule] = useState<any>(null),
    [adjust, setAdjust] = useState<any>(null),
    [outgoing, setOutgoing] = useState<any>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("all"),
    [expenseProject, setExpenseProject] = useState("all");
  const [ledgerQuery, setLedgerQuery] = useState(""),
    [ledgerAccount, setLedgerAccount] = useState("all"),
    [ledgerType, setLedgerType] = useState("all"),
    [fromDate, setFromDate] = useState<Date | null>(null),
    [toDate, setToDate] = useState<Date | null>(null);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("nearest"),
    [expense, setExpense] = useState<any>({ paid: false, date: new Date() });
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/atelier/finance", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error || "دریافت اطلاعات مالی ناموفق بود.");
      setData(body.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "خطای نامشخص");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (initialContractId && data) {
      const row = data.contractFinance?.find(
        (item: any) => item.id === initialContractId,
      );
      if (row) {
        setTab("مطالبات");
        setContract(row);
      }
    }
  }, [initialContractId, data]);
  const mutate = async (
    url: string,
    body: Record<string, unknown>,
    method = "POST",
  ) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "ثبت عملیات ناموفق بود.");
      await load();
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "خطای نامشخص";
      setError(message);
      atelierToast(message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const accounts: AccountOption[] = data?.accounts || [],
    sources = data?.receivableSources || [],
    summary = data?.summary || {};
  const action = (label: string, click: () => void, secondary = false) => (
    <button
      type="button"
      disabled={busy}
      onClick={click}
      className={
        secondary
          ? "atelier-button-secondary text-xs"
          : "atelier-button text-xs"
      }
    >
      {label}
    </button>
  );
  const installmentRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("fa-IR");
    return [...(data?.installments || [])]
      .filter(
        (r: any) =>
          (!q ||
            [r.customerName, r.customerMobile, r.contractNumber, r.title].some(
              (v) =>
                String(v || "")
                  .toLocaleLowerCase("fa-IR")
                  .includes(q),
            )) &&
          (filter === "all" ||
            r.status === filter ||
            (filter === "unpaid" && r.status !== "paid")),
      )
      .sort((a: any, b: any) =>
        sort === "highest"
          ? b.amount - a.amount
          : sort === "remaining"
            ? b.remainingAmount - a.remainingAmount
            : sort === "customer"
              ? String(a.customerName).localeCompare(
                  String(b.customerName),
                  "fa",
                )
              : +new Date(a.dueDate) - +new Date(b.dueDate),
      );
  }, [data, search, filter, sort]);
  const ledger = [
    ...(data?.receipts || []).map((row: any) => ({ ...row, incoming: true })),
    ...(data?.payments || []).map((row: any) => ({ ...row, incoming: false })),
  ].sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate));
  const matchesLedger = (row: any, field = "paymentDate") => {
    const stamp = +new Date(row[field]);
    return (
      (!ledgerQuery ||
        [
          row.notes,
          row.title,
          row.source?.title,
          row.accountName,
          row.paymentNumber,
        ].some((value) => String(value || "").includes(ledgerQuery))) &&
      (ledgerAccount === "all" || row.accountId === ledgerAccount) &&
      (!fromDate || stamp >= +fromDate) &&
      (!toDate || stamp < +toDate + 86400000) &&
      (ledgerType === "all" ||
        (ledgerType === "incoming" ? row.incoming : !row.incoming))
    );
  };
  const ledgerFilters = (
    <OverviewCard>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <input
          aria-label="جستجوی گردش مالی"
          placeholder="شرح، قرارداد، حساب…"
          className={inputClass}
          value={ledgerQuery}
          onChange={(e) => setLedgerQuery(e.target.value)}
        />
        <select
          aria-label="فیلتر حساب"
          className={inputClass}
          value={ledgerAccount}
          onChange={(e) => setLedgerAccount(e.target.value)}
        >
          <option value="all">همه حساب‌ها</option>
          {accounts.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          aria-label="نوع تراکنش"
          className={inputClass}
          value={ledgerType}
          onChange={(e) => setLedgerType(e.target.value)}
        >
          <option value="all">همه تراکنش‌ها</option>
          <option value="incoming">دریافت</option>
          <option value="outgoing">پرداخت</option>
        </select>
        <JalaliDatePicker
          label="از تاریخ"
          value={fromDate}
          onChange={setFromDate}
        />
        <JalaliDatePicker
          label="تا تاریخ"
          value={toDate}
          onChange={setToDate}
        />
      </div>
    </OverviewCard>
  );

  const selectTab = (name: string) => setTab(name as (typeof TABS)[number]);
  const overview = data && (
    <FinanceOverview
      data={data}
      onTab={selectTab}
      onReceipt={() => setReceipt({ sourceType: "contract" })}
      onExpense={() => setExpenseOpen(true)}
      onAccount={() => setTab("حساب‌ها و صندوق‌ها")}
      onInstallment={(r) =>
        setReceipt({ ...r, sourceType: "installment", sourceId: r.id })
      }
      onOutgoing={setOutgoing}
    />
  );
  const accountView = (
    <FinanceAccounts
      accounts={accounts}
      busy={busy}
      mutate={mutate}
      onAdjust={setAdjust}
    />
  );
  const receiptView = (
    <div className="space-y-4">
      {ledgerFilters}
      <div className="flex justify-end">
        <button
          onClick={() => setReceipt({ sourceType: "contract" })}
          className="atelier-button !bg-emerald-700"
        >
          <BanknoteArrowDown className="h-4 w-4" />
          ثبت دریافت
        </button>
      </div>
      <Table
        headers={["تاریخ", "منبع", "حساب", "مبلغ", "روش"]}
        rows={(data?.receipts || []).map((r: any) => [
          date(r.paymentDate, true),
          r.source?.title || "دریافت",
          r.accountName,
          money(r.amount),
          atelierLabel(r.paymentMethod),
        ])}
      />
    </div>
  );
  const contractView = (
    <Table
      headers={[
        "مشتری / قرارداد",
        "پروژه",
        "نهایی",
        "دریافت",
        "مانده",
        "عملیات",
      ]}
      rows={(data?.contractFinance || []).map((r: any) => [
        <div key="c">
          <strong>{r.customerName}</strong>
          <p className="text-xs text-zinc-600">
            {r.contractNumber} · {r.customerMobile}
          </p>
        </div>,
        r.projectType || r.projectTitle,
        money(r.finalAmount),
        money(r.paidAmount),
        money(r.remainingAmount),
        <div key="a" className="flex gap-2">
          {action("پرونده مالی", () => setContract(r))}
          {r.remainingAmount > 0 &&
            action(
              "ثبت دریافت",
              () => setReceipt({ sourceType: "contract", sourceId: r.id }),
              true,
            )}
        </div>,
      ])}
    />
  );
  const installmentView = (
    <div className="space-y-4">
      <div className="atelier-card grid gap-3 p-4 md:grid-cols-3">
        <label className="relative">
          <Search className="absolute right-3 top-3 h-4 w-4 text-zinc-600" />
          <input
            className={`${inputClass} pr-9`}
            placeholder="مشتری، موبایل، قرارداد، عنوان"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className={inputClass}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">همه</option>
          <option value="unpaid">پرداخت‌نشده</option>
          <option value="partial">بخشی پرداخت شده</option>
          <option value="paid">پرداخت شده</option>
          <option value="due_soon">سررسید نزدیک</option>
          <option value="overdue">سررسید گذشته</option>
        </select>
        <select
          className={inputClass}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="nearest">نزدیک‌ترین سررسید</option>
          <option value="highest">بیشترین مبلغ</option>
          <option value="remaining">بیشترین مانده</option>
          <option value="customer">نام مشتری</option>
        </select>
      </div>
      <Table
        headers={[
          "مشتری / قرارداد",
          "قسط",
          "مبلغ",
          "پرداخت‌شده",
          "مانده",
          "سررسید",
          "وضعیت",
          "عملیات",
        ]}
        rows={installmentRows.map((r: any) => [
          <div key="c">
            <strong>{r.customerName}</strong>
            <p className="text-xs text-zinc-600">
              {r.contractNumber} · {r.projectType || r.projectTitle}
            </p>
          </div>,
          r.title,
          money(r.amount),
          money(r.paidAmount),
          money(r.remainingAmount),
          <div key="d">
            {date(r.dueDate)}
            <p className="text-xs text-zinc-600">
              برنامه: {date(r.programDate)}
            </p>
          </div>,
          <NeonStatus key="s" tone={statusTone(r.status) as any}>
            {statusLabel(r.status)}
          </NeonStatus>,
          r.remainingAmount > 0
            ? action("پرداخت قسط", () =>
                setReceipt({ ...r, sourceType: "installment", sourceId: r.id }),
              )
            : "—",
        ])}
      />
    </div>
  );
  const expenseView = (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setExpenseOpen(true)} className="atelier-button">
          <Plus className="h-4 w-4" />
          ثبت هزینه
        </button>
      </div>
      {ledgerFilters}
      <OverviewCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            aria-label="فیلتر دسته هزینه"
            className={inputClass}
            value={expenseCategory}
            onChange={(e) => setExpenseCategory(e.target.value)}
          >
            <option value="all">همه دسته‌های هزینه</option>
            {Array.from(
              new Set<string>(
                (data?.expenses || []).map((r: any) => r.category || "general"),
              ),
            ).map((category) => (
              <option key={category} value={category}>
                {atelierLabel(category)}
              </option>
            ))}
          </select>
          <select
            aria-label="فیلتر پروژه هزینه"
            className={inputClass}
            value={expenseProject}
            onChange={(e) => setExpenseProject(e.target.value)}
          >
            <option value="all">همه پروژه‌ها</option>
            <option value="general">بدون پروژه</option>
            {data?.contractFinance
              ?.filter((r: any) => r.coreProjectId)
              .map((r: any) => (
                <option key={r.id} value={r.coreProjectId}>
                  {r.contractNumber} — {r.projectTitle}
                </option>
              ))}
          </select>
        </div>
      </OverviewCard>
      <Table
        headers={["تاریخ", "عنوان", "مبلغ", "پرداخت‌شده", "مانده", "عملیات"]}
        rows={(data?.expenses || [])
          .filter(
            (r: any) =>
              matchesLedger({ ...r, incoming: false }, "expenseDate") &&
              (expenseCategory === "all" ||
                (r.category || "general") === expenseCategory) &&
              (expenseProject === "all" ||
                (expenseProject === "general"
                  ? !r.projectId
                  : r.projectId === expenseProject)),
          )
          .map((r: any) => [
            date(r.expenseDate),
            r.title,
            money(r.amount),
            money(r.paidAmount),
            money(r.remainingAmount),
            r.remainingAmount > 0 ? (
              action("پرداخت", () => setOutgoing({ kind: "expense", row: r }))
            ) : (
              <NeonStatus key="s" tone="success">
                تسویه
              </NeonStatus>
            ),
          ])}
      />
    </div>
  );
  const payments = (
    <div className="space-y-4">
      {ledgerFilters}
      <Table
        headers={["تاریخ", "شرح", "حساب", "مبلغ", "روش"]}
        rows={(data?.payments || [])
          .filter((r: any) => matchesLedger({ ...r, incoming: false }))
          .map((r: any) => [
            date(r.paymentDate, true),
            r.notes || atelierLabel(r.paymentType),
            r.accountName,
            money(r.amount),
            atelierLabel(r.paymentMethod),
          ])}
      />
    </div>
  );
  const salaries = (
    <Table
      headers={["پرسنل", "منبع", "مبلغ", "پرداخت‌شده", "مانده", "عملیات"]}
      rows={(data?.salaries || []).map((r: any) => [
        r.personnelName,
        `${r.sourceLabel} · ${r.sourceTitle}`,
        money(r.totalCalculated),
        money(r.paidAmount),
        money(r.remainingAmount),
        r.remainingAmount > 0 ? (
          action("پرداخت دستمزد", () =>
            setOutgoing({ kind: "personnel_wage", row: r }),
          )
        ) : (
          <NeonStatus key="s" tone="success">
            تسویه
          </NeonStatus>
        ),
      ])}
    />
  );
  const payables = (
    <Table
      headers={["عنوان", "دسته", "کل", "مانده", "عملیات"]}
      rows={(data?.payables || []).map((r: any) => [
        r.title,
        atelierLabel(r.category),
        money(r.amount),
        money(r.remainingAmount),
        action("پرداخت", () =>
          setOutgoing({
            kind: r.sourceType === "rental" ? "rental" : "expense",
            row: r,
          }),
        ),
      ])}
    />
  );
  const profitability = (
    <Table
      headers={["قرارداد", "نوع", "درآمد", "هزینه", "سود", "وضعیت"]}
      rows={(data?.profitability || []).map((r: any) => [
        r.contractNumber,
        r.projectType || r.projectTitle,
        money(r.revenue),
        money(r.costs),
        money(r.profit),
        <NeonStatus key="s" tone={r.profit >= 0 ? "success" : "critical"}>
          {r.profit >= 0 ? "سود مثبت" : "زیان"}
        </NeonStatus>,
      ])}
    />
  );
  const reports = (
    <div className="grid gap-4 lg:grid-cols-3">
      {[
        ["درآمد بر اساس منبع", data?.reports?.incomeBySource],
        ["هزینه بر اساس دسته", data?.reports?.expensesByCategory],
        ["سود بر اساس نوع پروژه", data?.reports?.profitByProjectType],
      ].map(([title, rows]) => (
        <section className="atelier-card p-5" key={String(title)}>
          <div className="mb-4 flex justify-between">
            <h2 className="font-black">{String(title)}</h2>
            <NeonStatus
              tone={String(title).includes("سود") ? "success" : "info"}
            >
              تحلیل
            </NeonStatus>
          </div>
          <ReportTotals rows={(rows as any[]) || []} />
        </section>
      ))}
    </div>
  );
  const content: Record<string, React.ReactNode> = {
    "نمای کلی": overview,
    "حساب‌ها و صندوق‌ها": accountView,
    دریافت‌ها: receiptView,
    پرداخت‌ها: payments,
    هزینه‌ها: expenseView,
    مطالبات: contractView,
    اقساط: installmentView,
    "حقوق و دستمزد": salaries,
    بدهی‌ها: payables,
    "سود قراردادها": profitability,
    "گردش نقدینگی": (
      <div className="space-y-5">
        {data && <CashChart months={data.analytics.months} />}
        {ledgerFilters}
        <Table
          headers={["تاریخ", "شرح", "نوع", "مبلغ", "حساب", "مرتبط با"]}
          rows={ledger
            .filter((r) => matchesLedger(r))
            .map((r) => [
              date(r.paymentDate),
              r.notes || r.paymentNumber,
              <NeonStatus key="s" tone={r.incoming ? "success" : "critical"}>
                {r.incoming ? "دریافت" : "پرداخت"}
              </NeonStatus>,
              <span
                key="a"
                className={r.incoming ? "text-emerald-400" : "text-rose-400"}
              >
                {r.incoming ? "+" : "−"}
                {money(r.amount)}
              </span>,
              r.accountName,
              r.source?.title || "—",
            ])}
        />
      </div>
    ),
    "گزارش مالی": reports,
  };

  return (
    <div className="overview-page space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <WalletCards className="h-6 w-6 text-slate-300" />
            مالی
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            مدیریت حساب‌ها، دریافت‌ها، پرداخت‌ها و وضعیت نقدینگی آتلیه
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setReceipt({ sourceType: "contract" })}
            disabled={!data || busy}
            className="atelier-button !border-emerald-700 !bg-emerald-800"
          >
            <BanknoteArrowDown className="h-4 w-4" />
            ثبت دریافت
          </button>
          <button
            onClick={() => setExpenseOpen(true)}
            disabled={!data || busy}
            className="atelier-button"
          >
            <ArrowUpRight className="h-4 w-4" />
            ثبت هزینه / پرداخت
          </button>
          <button
            aria-label="به‌روزرسانی مالی"
            onClick={() => void load()}
            disabled={busy}
            className="atelier-icon-button"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="overview-card flex flex-wrap items-center justify-between gap-3 text-sm text-red-300"
        >
          <p>{error}</p>
          <button className="overview-range" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </div>
      )}
      <nav
        aria-label="بخش‌های مالی"
        className="flex gap-1 overflow-x-auto border-b border-slate-800 pb-2"
      >
        {TABS.map((name) => (
          <button
            key={name}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => setTab(name)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-3 text-xs transition ${tab === name ? "border-red-700/70 bg-red-950/40 text-white" : "border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-white"}`}
          >
            <FileText className="h-3.5 w-3.5" />
            {name}
          </button>
        ))}
      </nav>
      {!data ? busy && <OverviewSkeleton /> : content[tab]}
      {expenseOpen && (
        <AtelierModal title="ثبت هزینه" onClose={() => setExpenseOpen(false)}>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate("/api/atelier/finance/expenses", {
                  title: expense.title,
                  category: expense.category || "general",
                  amount: expense.amount,
                  expenseDate: expense.date?.toISOString(),
                  paid: expense.paid,
                  accountId: expense.paid ? expense.accountId : null,
                  notes: expense.notes,
                  studioProjectId: expense.studioProjectId || null,
                  idempotencyKey: crypto.randomUUID(),
                })
              ) {
                setExpense({ paid: false, date: new Date() });
                setExpenseOpen(false);
              }
            }}
          >
            <label>
              <span className="atelier-label">عنوان *</span>
              <input
                required
                className={inputClass}
                value={expense.title || ""}
                onChange={(e) =>
                  setExpense({ ...expense, title: e.target.value })
                }
              />
            </label>
            <div>
              <span className="atelier-label">مبلغ *</span>
              <MoneyInput
                value={expense.amount || 0}
                onChange={(amount) => setExpense({ ...expense, amount })}
                unit="تومان"
              />
            </div>
            <JalaliDatePicker
              label="تاریخ"
              value={expense.date}
              onChange={(value) => setExpense({ ...expense, date: value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={expense.paid}
                onChange={(e) =>
                  setExpense({ ...expense, paid: e.target.checked })
                }
              />
              هم‌اکنون پرداخت شده
            </label>
            {expense.paid && (
              <AccountSelector
                accounts={accounts}
                value={expense.accountId}
                onChange={(accountId) => setExpense({ ...expense, accountId })}
                label="حساب پرداخت"
              />
            )}
            <label>
              <span className="atelier-label">دسته هزینه</span>
              <select
                className={inputClass}
                value={expense.category || "general"}
                onChange={(e) =>
                  setExpense({ ...expense, category: e.target.value })
                }
              >
                {!expense.studioProjectId && (
                  <option value="general">عمومی</option>
                )}
                <option value="rental">اجاره</option>
                <option value="personnel">پرسنل</option>
                <option value="location">لوکیشن</option>
                <option value="printing_album">چاپ و آلبوم</option>
                <option value="catering">پذیرایی</option>
                <option value="transport">رفت و آمد</option>
                <option value="retouch_edit">رتوش و تدوین</option>
                <option value="misc">سایر</option>
              </select>
            </label>
            <label>
              <span className="atelier-label">قرارداد مرتبط</span>
              <select
                className={inputClass}
                value={expense.studioProjectId || ""}
                onChange={(e) =>
                  setExpense({
                    ...expense,
                    studioProjectId: e.target.value,
                    category: "misc",
                  })
                }
              >
                <option value="">بدون قرارداد</option>
                {data?.contractFinance?.map((r: any) => (
                  <option key={r.id} value={r.studioProjectId}>
                    {r.contractNumber} — {r.customerName}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="atelier-label">توضیحات</span>
              <textarea
                className={inputClass}
                value={expense.notes || ""}
                onChange={(e) =>
                  setExpense({ ...expense, notes: e.target.value })
                }
              />
            </label>
            <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                className="atelier-button-secondary"
                onClick={() => setExpenseOpen(false)}
              >
                انصراف
              </button>
              <button disabled={busy} className="atelier-button">
                ثبت هزینه
              </button>
            </div>
          </form>
        </AtelierModal>
      )}
      {receipt && (
        <ReceiptModal
          target={receipt}
          sources={sources}
          contracts={data?.contractFinance || []}
          accounts={accounts}
          busy={busy}
          onClose={() => setReceipt(null)}
          onSave={async (body: any) => {
            const url =
              receipt.sourceType === "installment"
                ? `/api/atelier/finance/installments/${receipt.sourceId}/payments`
                : "/api/atelier/finance/receipts";
            if (await mutate(url, body)) {
              setReceipt(null);
              atelierToast("دریافت با موفقیت ثبت شد.", "success");
            }
          }}
        />
      )}
      {contract && (
        <ContractModal
          contract={
            data?.contractFinance?.find((r: any) => r.id === contract.id) ||
            contract
          }
          installments={(data?.installments || []).filter(
            (r: any) => r.contractId === contract.id,
          )}
          busy={busy}
          onClose={() => setContract(null)}
          onSchedule={() => {
            setSchedule(contract);
            setContract(null);
          }}
          onSave={async (body: any) => {
            if (
              await mutate(
                `/api/atelier/finance/contracts/${contract.id}`,
                body,
                "PUT",
              )
            ) {
              setContract(null);
              atelierToast("پرونده مالی اصلاح شد.", "success");
            }
          }}
        />
      )}
      {schedule && (
        <ScheduleModal
          contract={schedule}
          initial={(data?.installments || []).filter(
            (r: any) => r.contractId === schedule.id,
          )}
          busy={busy}
          onClose={() => setSchedule(null)}
          onSave={async (rows: any[]) => {
            if (
              await mutate(
                `/api/atelier/finance/contracts/${schedule.id}/installments`,
                { installments: rows },
                "PUT",
              )
            ) {
              setSchedule(null);
              atelierToast("برنامه اقساط ذخیره شد.", "success");
            }
          }}
        />
      )}
      {adjust && (
        <AdjustmentModal
          account={adjust}
          busy={busy}
          onClose={() => setAdjust(null)}
          onSave={async (body: any) => {
            if (
              await mutate(
                `/api/atelier/finance/accounts/${adjust.id}/adjustments`,
                body,
              )
            ) {
              setAdjust(null);
              atelierToast("سند اصلاح موجودی ثبت شد.", "success");
            }
          }}
        />
      )}
      {outgoing && (
        <OutgoingModal
          target={outgoing}
          accounts={accounts}
          busy={busy}
          onClose={() => setOutgoing(null)}
          onSave={async (body: any) => {
            const r = outgoing.row;
            const url =
              outgoing.kind === "personnel_wage"
                ? `/api/atelier/finance/obligations/personnel_wage/${r.id}`
                : outgoing.kind === "rental"
                  ? `/api/atelier/finance/obligations/rental/${r.sourceId || r.id}`
                  : `/api/atelier/finance/expenses/${r.id}/payments`;
            if (await mutate(url, body)) {
              setOutgoing(null);
              atelierToast("پرداخت ثبت شد.", "success");
            }
          }}
        />
      )}
    </div>
  );
}

function ReceiptModal({
  target,
  sources,
  contracts,
  accounts,
  busy,
  onClose,
  onSave,
}: any) {
  const isInstallment = target.sourceType === "installment";
  const [sourceId, setSourceId] = useState(target.sourceId || ""),
    [amount, setAmount] = useState(Number(target.remainingAmount || 0)),
    [paidAt, setPaidAt] = useState<Date | null>(new Date()),
    [accountId, setAccountId] = useState(""),
    [method, setMethod] = useState("card_transfer"),
    [notes, setNotes] = useState("");
  const source = isInstallment
      ? target
      : sources.find((r: any) => r.sourceId === sourceId),
    contract = contracts.find(
      (r: any) => r.id === (isInstallment ? target.contractId : sourceId),
    );
  return (
    <AtelierModal
      title={isInstallment ? "پرداخت قسط" : "ثبت دریافت"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            sourceType: isInstallment ? undefined : source?.sourceType,
            sourceId: isInstallment ? undefined : sourceId,
            accountId,
            amount,
            paidAt: paidAt?.toISOString(),
            paymentMethod: method,
            notes,
            idempotencyKey: crypto.randomUUID(),
          });
        }}
        className="space-y-5"
      >
        <section className="rounded-2xl border border-cyan-900/60 bg-cyan-950/10 p-4">
          <h3 className="font-black">این دریافت متعلق به چیست؟</h3>
          {!isInstallment && !target.sourceId && (
            <select
              required
              className={`${inputClass} mt-3`}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">انتخاب قرارداد یا مراجعه</option>
              {sources.map((r: any) => (
                <option
                  key={`${r.sourceType}:${r.sourceId}`}
                  value={r.sourceId}
                >
                  {r.title} — مانده {money(r.remainingAmount)}
                </option>
              ))}
            </select>
          )}
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-zinc-500">مشتری:</span>{" "}
              {target.customerName ||
                contract?.customerName ||
                source?.title ||
                "—"}
            </p>
            <p>
              <span className="text-zinc-500">قرارداد:</span>{" "}
              {target.contractNumber || contract?.contractNumber || "—"}
            </p>
            {contract && (
              <>
                <p>مبلغ قرارداد: {money(contract.finalAmount)}</p>
                <p>مانده: {money(contract.remainingAmount)}</p>
              </>
            )}
            {isInstallment && (
              <>
                <p>قسط: {target.title}</p>
                <p>
                  سررسید: {date(target.dueDate)} · مانده{" "}
                  {money(target.remainingAmount)}
                </p>
              </>
            )}
          </div>
        </section>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="atelier-label">مبلغ دریافت *</span>
            <MoneyInput value={amount} onChange={setAmount} unit="تومان" />
          </div>
          <JalaliDatePicker
            required
            label="تاریخ دریافت"
            value={paidAt}
            onChange={setPaidAt}
          />
          <AccountSelector
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            label="حساب دریافت"
          />
          <PaymentMethodSelect value={method} onChange={setMethod} />
          <label className="sm:col-span-2">
            <span className="atelier-label">توضیحات</span>
            <textarea
              className={`${inputClass} min-h-24`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        {amount > 0 && accountId && (
          <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/15 p-3 text-sm text-emerald-200">
            دریافت {money(amount)} به حساب{" "}
            {accounts.find((r: any) => r.id === accountId)?.name} در تاریخ{" "}
            {date(paidAt)} ثبت می‌شود.
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-zinc-900 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="atelier-button-secondary"
          >
            انصراف
          </button>
          <button
            disabled={busy || !source || !accountId || amount <= 0}
            className="atelier-button !bg-emerald-700"
          >
            ثبت نهایی دریافت
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}

function ContractModal({
  contract,
  installments,
  busy,
  onClose,
  onSchedule,
  onSave,
}: any) {
  const [discountAmount, setDiscountAmount] = useState(
      Number(contract.discountAmount || 0),
    ),
    [financialNotes, setFinancialNotes] = useState(
      contract.financialNotes || "",
    );
  const final = Math.max(0, Number(contract.itemsSubtotal) - discountAmount);
  return (
    <AtelierModal
      title={`پرونده مالی قرارداد ${contract.contractNumber}`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ discountAmount, financialNotes });
        }}
        className="space-y-5"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["جمع آیتم‌ها", contract.itemsSubtotal],
            ["تخفیف ثابت", discountAmount],
            ["مبلغ نهایی", final],
            ["دریافت‌شده", contract.paidAmount],
            ["مانده", Math.max(0, final - contract.paidAmount)],
          ].map(([label, value], i) => (
            <div
              key={String(label)}
              className="rounded-xl border border-zinc-800 p-3"
            >
              <p className="text-xs text-zinc-500">{label}</p>
              <b
                className={`mt-2 block ${i === 3 ? "text-emerald-300" : i === 4 ? "text-amber-300" : ""}`}
              >
                {money(value)}
              </b>
            </div>
          ))}
        </div>
        <section className="grid gap-4 rounded-2xl border border-zinc-800 p-4 sm:grid-cols-2">
          <div>
            <span className="atelier-label">تخفیف ثابت</span>
            <MoneyInput
              value={discountAmount}
              onChange={setDiscountAmount}
              unit="تومان"
            />
          </div>
          <label>
            <span className="atelier-label">یادداشت مالی</span>
            <textarea
              className={`${inputClass} min-h-24`}
              value={financialNotes}
              onChange={(e) => setFinancialNotes(e.target.value)}
            />
          </label>
        </section>
        <section className="rounded-2xl border border-zinc-800 p-4">
          <h3 className="mb-3 font-black">تاریخچه دریافت‌ها</h3>
          {contract.receipts?.length ? (
            <div className="space-y-2">
              {contract.receipts.map((r: any) => (
                <div
                  key={r.id}
                  className="grid gap-2 rounded-xl bg-zinc-950 p-3 text-xs sm:grid-cols-4"
                >
                  <span>{date(r.paymentDate, true)}</span>
                  <b className="text-emerald-300">{money(r.amount)}</b>
                  <span>{r.accountName}</span>
                  <span>{atelierLabel(r.paymentMethod)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>دریافتی ثبت نشده است.</Empty>
          )}
        </section>
        <section className="rounded-2xl border border-zinc-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-black">اقساط</h3>
            <button
              type="button"
              onClick={onSchedule}
              className="atelier-button-secondary"
            >
              ویرایش برنامه اقساط
            </button>
          </div>
          {installments.length ? (
            <div className="space-y-2">
              {installments.map((r: any) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950 p-3 text-xs"
                >
                  <span>
                    {r.title} · {date(r.dueDate)}
                  </span>
                  <span>
                    {money(r.amount)} · مانده {money(r.remainingAmount)}
                  </span>
                  <NeonStatus tone={statusTone(r.status) as any}>
                    {statusLabel(r.status)}
                  </NeonStatus>
                </div>
              ))}
            </div>
          ) : (
            <Empty>برنامه اقساط ثبت نشده است.</Empty>
          )}
        </section>
        <section className="rounded-2xl border border-zinc-800 p-4">
          <h3 className="font-black">اصلاحات</h3>
          <div className="mt-3 space-y-2 text-xs text-zinc-400">
            {contract.corrections?.map((r: any) => (
              <p key={r.id}>
                {date(r.createdAt, true)} · {r.userName} ·{" "}
                {r.action === "ATELIER_INSTALLMENTS_UPDATED"
                  ? "اصلاح اقساط"
                  : "اصلاح مبلغ قرارداد"}
              </p>
            ))}
            {!contract.corrections?.length && <p>اصلاح مالی ثبت نشده است.</p>}
          </div>
        </section>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="atelier-button-secondary"
          >
            انصراف
          </button>
          <button
            disabled={busy || final < contract.paidAmount}
            className="atelier-button"
          >
            ذخیره اصلاح مالی
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}

function ScheduleModal({ contract, initial, busy, onClose, onSave }: any) {
  const [rows, setRows] = useState<any[]>(
    initial.length
      ? initial.map((r: any) => ({
          id: r.id,
          title: r.title,
          amount: r.amount,
          dueDate: new Date(r.dueDate),
          paidAmount: r.paidAmount,
        }))
      : [
          {
            title: "بیعانه",
            amount: contract.remainingAmount,
            dueDate: new Date(),
          },
        ],
  );
  const update = (i: number, patch: any) =>
    setRows((old) => old.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  return (
    <AtelierModal
      title={`برنامه اقساط — ${contract.contractNumber}`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(
            rows.map((r) => ({
              id: r.id,
              title: r.title,
              amount: r.amount,
              dueDate: r.dueDate?.toISOString(),
            })),
          );
        }}
        className="space-y-4"
      >
        <p className="text-sm text-zinc-400">
          هر قسط عنوان، مبلغ و تاریخ سررسید شمسی مستقل دارد. قسطی که دریافت دارد
          فقط تا مبلغی برابر یا بیشتر از دریافتی آن قابل اصلاح است.
        </p>
        {rows.map((r, i) => (
          <div
            key={r.id || i}
            className="grid gap-3 rounded-2xl border border-zinc-800 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <label>
              <span className="atelier-label">عنوان *</span>
              <input
                required
                className={inputClass}
                value={r.title}
                onChange={(e) => update(i, { title: e.target.value })}
              />
            </label>
            <div>
              <span className="atelier-label">مبلغ *</span>
              <MoneyInput
                value={r.amount}
                onChange={(amount) => update(i, { amount })}
                unit="تومان"
              />
              {r.paidAmount > 0 && (
                <small className="text-emerald-400">
                  دریافت‌شده: {money(r.paidAmount)}
                </small>
              )}
            </div>
            <JalaliDatePicker
              required
              label="تاریخ سررسید"
              value={r.dueDate}
              onChange={(dueDate) => update(i, { dueDate })}
            />
            <button
              type="button"
              disabled={r.paidAmount > 0}
              onClick={() => setRows((old) => old.filter((_, x) => x !== i))}
              className="atelier-button-secondary self-end !text-red-300 disabled:opacity-40"
            >
              حذف
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setRows((old) => [
                ...old,
                {
                  title: `قسط ${old.length + 1}`,
                  amount: 0,
                  dueDate: new Date(),
                },
              ])
            }
            className="atelier-button-secondary"
          >
            افزودن قسط
          </button>
          <b>
            جمع: {money(rows.reduce((s, r) => s + Number(r.amount || 0), 0))}
          </b>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="atelier-button-secondary"
          >
            انصراف
          </button>
          <button
            disabled={
              busy ||
              !rows.length ||
              rows.some((r) => !r.dueDate || !r.title || r.amount <= 0)
            }
            className="atelier-button"
          >
            ذخیره برنامه
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}

function AdjustmentModal({ account, busy, onClose, onSave }: any) {
  const [newBalance, setNewBalance] = useState(Number(account.balance)),
    [reason, setReason] = useState(""),
    [adjustedAt, setAdjustedAt] = useState<Date | null>(new Date());
  const delta = newBalance - Number(account.balance);
  return (
    <AtelierModal title={`اصلاح موجودی — ${account.name}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            newBalance,
            reason,
            adjustedAt: adjustedAt?.toISOString(),
            idempotencyKey: crypto.randomUUID(),
          });
        }}
        className="space-y-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">موجودی فعلی</p>
            <b>{money(account.balance)}</b>
          </div>
          <div
            className={`rounded-xl border p-3 ${delta >= 0 ? "border-emerald-900 text-emerald-300" : "border-red-900 text-red-300"}`}
          >
            <p className="text-xs opacity-70">مبلغ تعدیل</p>
            <b>
              {delta >= 0 ? "+" : ""}
              {money(delta)}
            </b>
          </div>
        </div>
        <div>
          <span className="atelier-label">موجودی جدید *</span>
          <MoneyInput
            value={newBalance}
            onChange={setNewBalance}
            unit="تومان"
          />
        </div>
        <JalaliDatePicker
          required
          label="تاریخ اصلاح"
          value={adjustedAt}
          onChange={setAdjustedAt}
        />
        <label>
          <span className="atelier-label">دلیل اصلاح *</span>
          <textarea
            required
            minLength={5}
            className={`${inputClass} min-h-24`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/15 p-3 text-sm text-amber-200">
          موجودی از {money(account.balance)} به {money(newBalance)} تغییر می‌کند
          و اختلاف به‌عنوان سند تعدیل ثبت می‌شود.
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="atelier-button-secondary"
          >
            انصراف
          </button>
          <button
            disabled={busy || reason.trim().length < 5 || delta === 0}
            className="atelier-button"
          >
            تأیید اصلاح موجودی
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}

function OutgoingModal({ target, accounts, busy, onClose, onSave }: any) {
  const [amount, setAmount] = useState(Number(target.row.remainingAmount || 0)),
    [accountId, setAccountId] = useState(""),
    [paymentDate, setPaymentDate] = useState<Date | null>(new Date()),
    [method, setMethod] = useState("bank_transfer"),
    [notes, setNotes] = useState("");
  return (
    <AtelierModal title="ثبت پرداخت" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            amount,
            accountId,
            paymentDate: paymentDate?.toISOString(),
            paymentMethod: method,
            notes,
            idempotencyKey: crypto.randomUUID(),
          });
        }}
        className="space-y-4"
      >
        <div className="rounded-xl border border-cyan-900/60 p-3">
          <p className="text-xs text-zinc-500">پرداخت برای</p>
          <b>
            {target.row.title ||
              target.row.personnelName ||
              target.row.sourceTitle}
          </b>
          <p className="text-xs text-zinc-500">
            مانده: {money(target.row.remainingAmount)}
          </p>
        </div>
        <div>
          <span className="atelier-label">مبلغ *</span>
          <MoneyInput value={amount} onChange={setAmount} unit="تومان" />
        </div>
        <JalaliDatePicker
          required
          label="تاریخ پرداخت"
          value={paymentDate}
          onChange={setPaymentDate}
        />
        <AccountSelector
          accounts={accounts}
          value={accountId}
          onChange={setAccountId}
          label="حساب پرداخت"
        />
        <PaymentMethodSelect value={method} onChange={setMethod} />
        <label>
          <span className="atelier-label">توضیحات</span>
          <textarea
            className={`${inputClass} min-h-20`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="atelier-button-secondary"
          >
            انصراف
          </button>
          <button
            disabled={busy || !accountId || amount <= 0}
            className="atelier-button"
          >
            ثبت پرداخت
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}
