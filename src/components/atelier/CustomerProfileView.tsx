"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Edit3, FileSignature, RefreshCw, UsersRound, WalletCards } from "lucide-react";
import { toJalaliDate } from "@/lib/dateUtils";
import { customerPaymentMethods, customerProfileStatus, customerProfileTabs, type CustomerProfileData } from "@/lib/customerProfile";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";
import { MetricCard, OverviewCard, overviewMoney } from "./OverviewUi";

const date = (value: string | null) => value ? toJalaliDate(value) : "تاریخ تعیین نشده";
const dateTime = (value: string | null) => value ? `${toJalaliDate(value)} · ${new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(value))}` : "زمان تعیین نشده";
const count = (value: number) => value.toLocaleString("fa-IR");
const status = (value: string) => customerProfileStatus[value] || value;
type Navigate = (section: string, id: string | null) => void;

export function CustomerProfileView({ id, revision = 0, onBack, onNavigate, onEdit }: {
  id: string; revision?: number; onBack: () => void; onNavigate: Navigate;
  onEdit: (customer: { id: string; name: string; mobile: string }) => void;
}) {
  const [profile, setProfile] = useState<CustomerProfileData | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [tab, setTab] = useState(0);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/atelier/customers/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "دریافت پرونده ممکن نشد.");
      if (!controller.signal.aborted) setProfile(body.profile);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "دریافت پرونده ممکن نشد.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load, revision]);
  const back = <button type="button" className="atelier-button-secondary inline-flex items-center gap-2" onClick={onBack}><ArrowRight className="h-4 w-4" />بازگشت به مشتریان</button>;
  if (!profile || profile.customer.studio.id !== id) return <div className="space-y-4">{back}{error ? <ErrorState text={error} retry={load} /> : <LoadingState />}</div>;
  const c = profile.customer, s = c.studio, finance = profile.financial;
  return <div className="overview-page min-w-0 space-y-5 [overflow-wrap:anywhere]">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><p className="atelier-kicker">پرونده مشتری</p><h1 className="mt-1 break-words text-2xl font-black">{c.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400"><span dir="ltr">{c.mobile}</span><Badge>{status(c.status)}</Badge></div>
        <p className="mt-2 text-xs text-zinc-500">اطلاعات در محدوده دسترسی شما · آخرین دریافت اطلاعات: {dateTime(profile.generatedAt)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{back}
        {profile.access.canEdit && <button type="button" className="atelier-button-secondary inline-flex items-center gap-2" onClick={() => onEdit({ id: s.id, name: c.name, mobile: c.mobile })}><Edit3 className="h-4 w-4" />ویرایش مشتری</button>}
        <button type="button" aria-label="به‌روزرسانی پرونده مشتری" title="به‌روزرسانی" className="atelier-icon-button" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>
    </header>
    {error && <ErrorState text={error} retry={load} />}
    {loading && <p role="status" className="text-xs text-zinc-400">در حال به‌روزرسانی پرونده؛ اطلاعات قبلی همچنان نمایش داده می‌شود.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="پروژه‌های مشتری" value={count(profile.summary.projects)} context="پروژه‌های قابل‌مشاهده" icon={FileSignature} tone="blue" />
      <MetricCard title="برنامه‌های آینده" value={count(profile.summary.upcoming)} context="برنامه‌های انجام‌نشده و لغونشده" icon={CalendarDays} tone="purple" />
      {finance && <><MetricCard title="مانده مشتری" value={overviewMoney(finance.summary.remaining)} context="مانده فاکتورهای فعال؛ اقساط دوباره جمع نمی‌شوند" icon={WalletCards} tone="red" />
        <MetricCard title="تسویه روی فاکتورها" value={overviewMoney(finance.summary.paid)} context="مبلغ تسویه‌شده روی فاکتورهای فعال" icon={WalletCards} tone="green" /></>}
    </div>
    <div role="tablist" aria-label="بخش‌های پرونده مشتری" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-zinc-800 p-1">
      {customerProfileTabs.map((title, index) => <button type="button" role="tab" key={title} aria-selected={tab === index} aria-controls={`customer-profile-panel-${index}`} id={`customer-profile-tab-${index}`} onClick={() => setTab(index)} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${tab === index ? "bg-red-950 text-red-200" : "text-zinc-400 hover:bg-zinc-900"}`}>{title}</button>)}
    </div>
    <div role="tabpanel" id={`customer-profile-panel-${tab}`} aria-labelledby={`customer-profile-tab-${tab}`} className="min-w-0 space-y-5">
      {tab === 0 && <>
        <OverviewCard title="اطلاعات مشتری" icon={UsersRound}>
          <dl className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {([
              ["نام", c.name], ["کد مشتری", c.code], ["شماره همراه", c.mobile], ["تلفن دوم", c.phone], ["ایمیل", c.email], ["نام مجموعه", c.storeName],
              ["شهر", c.city], ["منطقه", c.region], ["کد پستی", c.postalCode], ["آدرس", c.address], ["عرض جغرافیایی", c.latitude], ["طول جغرافیایی", c.longitude],
              ["مسئول مشتری", c.assignedEmployeeName], ["وضعیت", status(c.status)], ["امتیاز ارتباط با مشتری", count(c.healthScore)],
              ["وضعیت ارتباط", ({ green: "مناسب", yellow: "نیازمند توجه", red: "نیازمند پیگیری" } as Record<string, string>)[c.healthStatus] || c.healthStatus],
              ["نوع مشتری", ({ wedding: "عروسی", portrait: "پرتره", commercial: "تجاری", family: "خانوادگی", industrial: "صنعتی", event: "مراسم", child: "کودک", modeling: "مدلینگ" } as Record<string, string>)[s.customerType] || s.customerType],
              ["نام داماد", s.groomName], ["نام عروس", s.brideName], ["نقش مخاطب", ({ groom: "داماد", bride: "عروس", father: "پدر", mother: "مادر", manager: "مدیر", self: "خود مشتری", other: "سایر" } as Record<string, string>)[s.contactPersonRole || ""]],
              ["تاریخ مناسبت", s.anniversaryDate ? date(s.anniversaryDate) : null], ["شبکه اجتماعی", s.socialMedia], ["منبع آشنایی", s.referrer],
              ["سطح مشتری", ({ standard: "استاندارد", gold: "طلایی", platinum: "پلاتینیوم", vip: "ویژه" } as Record<string, string>)[s.vipLevel] || s.vipLevel],
              ["رضایت انتشار تصاویر", s.socialConsent ? "بله" : "خیر"], ["ترجیحات ویژه", s.specialPreferences], ["یادداشت مشتری", c.notes], ["یادداشت آتلیه", s.notes],
              ["مهلت پرداخت", c.paymentTermsDays === null ? null : `${count(c.paymentTermsDays)} روز`], ["سقف اعتبار", c.creditLimit === null ? null : overviewMoney(c.creditLimit)],
              ["ثبت مشتری", dateTime(c.createdAt)], ["ثبت پرونده آتلیه", dateTime(s.createdAt)], ["آخرین تغییر مشتری", dateTime(c.updatedAt)], ["آخرین تغییر پرونده", dateTime(s.updatedAt)],
            ] as Array<[string, string | null | undefined]>).filter(([, value]) => value != null && value.trim() !== "" && value !== "{}" && value !== "[]").map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{value}</dd></div>)}
          </dl>
        </OverviewCard>
        <Projects profile={profile} onNavigate={onNavigate} />
      </>}
      {tab === 1 && <>
        {!profile.access.planning && <EmptyState text="دسترسی نمایش برنامه‌ریزی این مشتری برای شما فعال نیست." />}
        <Schedule profile={profile} onNavigate={onNavigate} />
        <Projects profile={profile} onNavigate={onNavigate} />
      </>}
      {tab === 2 && (finance ? <Financial finance={finance} onNavigate={onNavigate} /> : <EmptyState text="دسترسی مالی این مشتری برای شما فعال نیست." />)}
      {tab === 3 && <OverviewCard title="تاریخچه ثبت‌شده">
        {!profile.history.length ? <EmptyState text="رویداد قابل‌نمایشی در تاریخچه ثبت نشده است." /> : <ol className="divide-y divide-zinc-800 px-4">{profile.history.map(event => <li key={event.id} className="space-y-1 py-4">
          <strong className="block text-sm">{event.title}</strong><p className="text-xs text-zinc-500">{dateTime(event.date)} · {event.projectTitle}{event.author ? ` · ${event.author}` : ""}</p>
          {event.description && <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{event.description}</p>}
        </li>)}</ol>}
      </OverviewCard>}
    </div>
  </div>;
}

function Badge({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${warning ? "border-amber-800 bg-amber-950/30 text-amber-300" : "border-zinc-700 bg-zinc-900 text-zinc-300"}`}>{children}</span>;
}
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <span className="min-w-0 text-xs text-zinc-500">{label}<b className="mt-1 block break-words text-sm font-medium text-zinc-200">{children}</b></span>;
}
function Projects({ profile, onNavigate }: { profile: CustomerProfileData; onNavigate: Navigate }) {
  return <OverviewCard title="پروژه‌ها و قراردادهای مشتری" icon={FileSignature}>
    {!profile.projects.length ? <EmptyState text="پروژه‌ای برای این مشتری ثبت نشده است." /> : <div className="space-y-3 p-4">{profile.projects.map(project => <article key={project.id} className="min-w-0 rounded-xl border border-zinc-800 p-3">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="break-words text-sm font-bold">{project.title}</h3><Badge>{project.archived ? "بایگانی‌شده" : status(project.status)}</Badge></div>
      <p className="mt-2 text-xs text-zinc-500">{project.number} · {date(project.date)}{project.location ? ` · ${project.location}` : ""}</p>
      {!project.contracts.length ? <p className="mt-3 text-xs text-zinc-500">قرارداد قابل‌نمایشی برای این پروژه موجود نیست.</p> : project.contracts.map(contract => <div key={contract.id} className="mt-3 space-y-3 rounded-lg bg-zinc-950 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs">{contract.number}{contract.typeTitle ? ` · ${contract.typeTitle}` : ""}</strong><Badge>{status(contract.status)}</Badge></div>
        <div className="grid gap-3 sm:grid-cols-3"><Detail label="تاریخ قرارداد">{date(contract.date)}</Detail><Detail label="برنامه">{date(contract.programDate)}</Detail><Detail label="تعهد تحویل">{date(contract.deliveryDate)}</Detail>
          {contract.amount !== null && <><Detail label="مبلغ قرارداد">{overviewMoney(contract.amount)}</Detail><Detail label="تسویه فاکتور">{contract.paid === null ? "فاکتور ثبت نشده" : overviewMoney(contract.paid)}</Detail><Detail label="مانده فاکتور">{contract.remaining === null ? "فاکتور ثبت نشده" : overviewMoney(contract.remaining)}</Detail></>}
        </div>
        <button type="button" className="atelier-button-secondary text-xs" onClick={() => onNavigate("contracts", contract.id)}>مشاهده قرارداد</button>
      </div>)}
    </article>)}</div>}
  </OverviewCard>;
}
function Schedule({ profile, onNavigate }: { profile: CustomerProfileData; onNavigate: Navigate }) {
  const now = new Date(profile.generatedAt).getTime();
  const groups = [
    { title: "برنامه‌های آینده", rows: profile.schedule.filter(r => r.date && +new Date(r.date) >= now && !r.completed && !r.cancelled) },
    { title: "برنامه‌های گذشته و انجام‌شده", rows: profile.schedule.filter(r => r.date && (+new Date(r.date) < now || r.completed || r.cancelled)).reverse() },
    { title: "برنامه‌های بدون تاریخ", rows: profile.schedule.filter(r => !r.date) },
  ];
  if (!profile.schedule.length) return <EmptyState text="برنامه یا خدمت قابل‌نمایشی برای این مشتری ثبت نشده است." />;
  return <>{groups.filter(g => g.rows.length).map(group => <OverviewCard key={group.title} title={group.title} icon={CalendarDays}><div className="space-y-3 p-4">{group.rows.map(row => <article key={row.id} className={`min-w-0 space-y-3 rounded-xl border p-3 ${row.overdue ? "border-amber-900/70" : "border-zinc-800"}`}>
    <div className="flex flex-wrap justify-between gap-2"><h3 className="break-words text-sm font-bold">{row.title}</h3><div className="flex flex-wrap gap-1"><Badge>{row.completed ? "انجام‌شده" : status(row.status)}</Badge>{row.overdue && <Badge warning>نیازمند پیگیری</Badge>}</div></div>
    <p className="text-xs text-zinc-500">{row.kind}{row.projectTitle ? ` · ${row.projectTitle}` : ""}</p>
    <p className="text-sm text-zinc-200">{dateTime(row.date)}{row.endDate ? ` تا ${dateTime(row.endDate)}` : ""}</p>
    {row.location && <p className="break-words text-xs text-zinc-400">محل: {row.location}</p>}
    {row.personnel.length > 0 && <div className="space-y-2"><p className="text-xs text-zinc-500">پرسنل اختصاص‌یافته</p>{row.personnel.map((person, index) => <p key={index} className="break-words text-xs text-zinc-300">{person.name}{person.start ? ` · ${dateTime(person.start)}` : ""}{person.end ? ` تا ${dateTime(person.end)}` : ""}{person.notes ? ` · ${person.notes}` : ""}</p>)}</div>}
    {row.equipment.length > 0 && <p className="break-words text-xs text-zinc-300">تجهیزات: {row.equipment.map(v => v.split(" · ").map(part => status(part)).join(" · ")).join("، ")}</p>}
    {row.notes && <p className="whitespace-pre-wrap break-words text-xs leading-6 text-zinc-400">{row.notes}</p>}
    {row.target && <button type="button" className="atelier-button-secondary text-xs" onClick={() => onNavigate(row.target!.section, row.target!.id)}>مشاهده در برنامه‌ریزی</button>}
  </article>)}</div></OverviewCard>)}</>;
}
function Financial({ finance, onNavigate }: { finance: NonNullable<CustomerProfileData["financial"]>; onNavigate: Navigate }) {
  const f = finance.summary;
  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["مبلغ فاکتورهای فعال", f.total, "پس از تخفیف؛ پیش‌نویس و سند باطل‌شده محاسبه نمی‌شوند"],
        ["تسویه فاکتورها", f.paid, "تسویه ثبت‌شده در فاکتور اصلی"], ["مانده مشتری", f.remaining, "مانده ثبت‌شده فاکتور اصلی"],
        ["اقساط باقی‌مانده", f.remainingInstallments, "بخشی از مانده؛ به بدهی دوباره اضافه نمی‌شود"],
      ].map(([title, value, caption]) => <MetricCard key={String(title)} title={String(title)} value={overviewMoney(value)} context={String(caption)} icon={WalletCards} tone="red" />)}
    </div>
    <OverviewCard title="خلاصه مالی"><div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <Detail label="کل دریافت تکمیل‌شده">{overviewMoney(f.received)}</Detail><Detail label="دریافت تخصیص‌نیافته">{overviewMoney(f.unapplied)}</Detail><Detail label="تخفیف اسناد فعال">{overviewMoney(f.discount)}</Detail><Detail label="مطالبات سررسیدگذشته">{overviewMoney(f.overdue)}</Detail>
    </div><p className="px-4 pb-4 text-xs leading-6 text-zinc-500">دریافت نقدی و تسویه فاکتور دو شاخص متفاوت‌اند. دریافت تخصیص‌نیافته یا مربوط به سند تاریخی، دوباره از مانده فاکتور کم نمی‌شود.</p></OverviewCard>
    <OverviewCard title="اقساط مشتری">
      {!finance.installments.length ? <EmptyState text="قسطی برای این مشتری ثبت نشده است." /> : <div className="space-y-3 p-4">{finance.installments.map((i, index) => <article key={i.id} className="min-w-0 space-y-3 rounded-xl border border-zinc-800 p-3">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{count(index + 1)}. {i.title}</strong><div className="flex flex-wrap gap-1"><Badge warning={i.isOverdue && i.active}>{status(i.status)}</Badge>{i.isOverdue && i.active && i.status === "partial" && <Badge warning>سررسید گذشته</Badge>}{!i.active && <Badge>سند غیرفعال؛ خارج از جمع مانده</Badge>}</div></div>
        <p className="text-xs text-zinc-500">{i.contractNumber} · {i.projectTitle}</p>
        <div className="grid gap-3 sm:grid-cols-4"><Detail label="مبلغ قسط">{overviewMoney(i.amount)}</Detail><Detail label="سررسید">{date(i.dueDate)}</Detail><Detail label="پرداخت‌شده">{overviewMoney(i.paidAmount)}</Detail><Detail label="مانده">{overviewMoney(i.remainingAmount)}</Detail></div>
        {i.payments.map(p => <p key={p.paymentId} className="break-words text-xs text-zinc-400">{p.number} · {dateTime(p.date)} · {overviewMoney(p.amount)}</p>)}
        <button type="button" className="atelier-button-secondary text-xs" onClick={() => onNavigate("finance", i.contractId)}>مشاهده اقساط در مالی</button>
      </article>)}</div>}
    </OverviewCard>
    <OverviewCard title="فاکتورها">
      {!finance.invoices.length ? <EmptyState text="فاکتوری برای این مشتری ثبت نشده است." /> : <div className="space-y-3 p-4">{finance.invoices.map(i => <article key={i.id} className="min-w-0 space-y-3 rounded-xl border border-zinc-800 p-3">
        <div className="flex flex-wrap justify-between gap-2"><strong className="break-all text-sm">{i.number}</strong><Badge>{status(i.status)} · {status(i.paymentStatus)}</Badge></div>
        <p className="text-xs text-zinc-500">{i.projectTitle} · {date(i.date)}{!i.active ? " · خارج از جمع مانده" : ""}</p>
        <div className="grid gap-3 sm:grid-cols-3"><Detail label="مبلغ نهایی">{overviewMoney(i.amount)}</Detail><Detail label="تسویه">{overviewMoney(i.paid)}</Detail><Detail label="مانده">{overviewMoney(i.remaining)}</Detail>
          <Detail label="تخفیف">{overviewMoney(i.discount)}</Detail>{i.dueDate && <Detail label="سررسید">{date(i.dueDate)}</Detail>}{i.settlementDate && <Detail label="تاریخ تسویه">{date(i.settlementDate)}</Detail>}
        </div>
        {i.contractId && <button type="button" className="atelier-button-secondary text-xs" onClick={() => onNavigate("finance", i.contractId)}>مشاهده پرونده مالی قرارداد</button>}
      </article>)}</div>}
    </OverviewCard>
    <OverviewCard title="تاریخچه دریافت‌ها و اسناد پرداخت">
      {!finance.receipts.length ? <EmptyState text="دریافت یا سند پرداختی برای این مشتری ثبت نشده است." /> : <div className="space-y-3 p-4">{finance.receipts.map(r => <article key={r.id} className="min-w-0 space-y-3 rounded-xl border border-zinc-800 p-3">
        <div className="flex flex-wrap justify-between gap-2"><strong className="break-all text-sm">{r.number}</strong><Badge>{status(r.status)}</Badge></div>
        <div className="grid gap-3 sm:grid-cols-3"><Detail label={r.scopeLimited ? "مبلغ تخصیص قابل‌مشاهده" : "مبلغ سند"}>{overviewMoney(r.amount)}</Detail><Detail label="نوع سند">{({ customer_receipt: "دریافت مشتری", supplier_payment: "پرداخت تأمین‌کننده", expense_payment: "پرداخت هزینه", commission_payout: "پرداخت پورسانت", salary_payout: "پرداخت دستمزد" } as Record<string, string>)[r.type] || r.type}</Detail><Detail label="تاریخ">{dateTime(r.date)}</Detail><Detail label="روش پرداخت">{customerPaymentMethods[r.method] || r.method}</Detail><Detail label="حساب مقصد">{r.accountName}</Detail>{r.reference && <Detail label="شماره پیگیری">{r.reference}</Detail>}</div>
        {r.allocations.length > 0 ? <div className="space-y-1"><p className="text-xs text-zinc-500">تخصیص به فاکتورها</p>{r.allocations.map(a => <p key={a.invoiceId} className="break-all text-xs text-zinc-300">{a.invoiceNumber} · {overviewMoney(a.amount)}</p>)}</div> : <p className="text-xs text-zinc-500">{r.directInvoiceNumber ? `اتصال مستقیم به ${r.directInvoiceNumber}` : "تخصیص به فاکتور ثبت نشده است."}</p>}
        {r.installments.map(i => <p key={i.id} className="text-xs text-zinc-300">قسط {i.title} · {overviewMoney(i.amount)}</p>)}
        {r.status === "completed" && r.type === "customer_receipt" && r.unappliedAmount > 0 && <Badge warning>تخصیص‌نیافته: {overviewMoney(r.unappliedAmount)}</Badge>}
        {r.notes && <p className="whitespace-pre-wrap break-words text-xs text-zinc-400">{r.notes}</p>}
      </article>)}</div>}
    </OverviewCard>
  </>;
}
