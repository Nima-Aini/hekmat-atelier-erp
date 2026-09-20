"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, Edit3, Eye, Plus, Search, Trash2 } from "lucide-react";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  getBusinessDateTimeParts,
  tehranDateTimeToUtc,
  toBusinessGregorianDateString,
  toJalaliDate,
} from "@/lib/dateUtils";
import { AtelierModal } from "./AtelierModal";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";
import { atelierConfirm, atelierToast } from "@/lib/atelierFeedback";

const money = (value: unknown) =>
  `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
type Kind = "daily-visits" | "reservations";

export function SimpleRecordsView({ kind }: { kind: Kind }) {
  const reservation = kind === "reservations";
  const title = reservation ? "رزرو" : "مراجعات روزانه";
  const [records, setRecords] = useState<any[]>([]),
    [accounts, setAccounts] = useState<any[]>([]),
    [personnel, setPersonnel] = useState<any[]>([]),
    [dailyVisitTitles, setDailyVisitTitles] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [payment, setPayment] = useState("all"),
    [filterDate, setFilterDate] = useState<Date | null>(null),
    [editing, setEditing] = useState<any | "new" | null>(null),
    [converting, setConverting] = useState<any | null>(null),
    [viewing, setViewing] = useState<any | null>(null),
    [paying, setPaying] = useState<any | null>(null),
    [saving, setSaving] = useState(false);
  const load = () => {
    setLoading(true);
    setError("");
    fetch(`/api/atelier/${kind}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success)
          throw new Error(data.error || "دریافت اطلاعات ممکن نشد.");
        setRecords(data.visits || data.reservations || []);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [kind]);
  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/studio/personnel?pageSize=100").then((r) => r.json()),
      fetch("/api/atelier/settings").then((r) => r.json()),
    ]).then(([accountBody, personnelBody, settingsBody]) => {
      if (accountBody.success) setAccounts(accountBody.accounts || []);
      if (personnelBody.success) setPersonnel((personnelBody.personnel || []).filter((person: any) => person.status === "active"));
      if (settingsBody.success) setDailyVisitTitles((settingsBody.dailyVisitTitles || []).filter((item: any) => item.active));
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent).detail?.id;
      const found = records.find((record) => record.id === id);
      if (found) setEditing(found);
    };
    window.addEventListener("akma:navigate-item", listener);
    return () => window.removeEventListener("akma:navigate-item", listener);
  }, [records]);
  const filtered = useMemo(
    () =>
      records.filter(
        (row) =>
          (!query ||
            `${row.title} ${row.customerName} ${row.mobile}`.includes(query)) &&
          (payment === "all" ||
            (payment === "paid"
              ? Number(row.remainingAmount) === 0
              : Number(row.remainingAmount) > 0)) &&
          (!filterDate ||
            toBusinessGregorianDateString(
              reservation ? row.reservedAt : row.visitDate,
            ) === toBusinessGregorianDateString(filterDate)),
      ),
    [records, query, payment, filterDate, reservation],
  );
  const remove = async (row: any) => {
    if (!(await atelierConfirm(`${reservation ? "رزرو" : "مراجعه"} «${row.title}» برای همیشه حذف شود؟`)))
      return;
    const data = await fetch(`/api/atelier/${kind}/${row.id}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (!data.success) return atelierToast(data.error || "حذف انجام نشد.", "error");
    atelierToast("رکورد حذف شد.", "success");
    load();
  };
  const complete = async (row: any) => {
    if (!(await atelierConfirm(`رزرو «${row.title}» تکمیل و برای همیشه حذف شود؟`, "تکمیل شده و حذف"))) return;
    const data = await fetch(`/api/atelier/reservations/${row.id}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete_delete" }),
    }).then((r) => r.json());
    if (!data.success)
      return atelierToast(data.error || "تکمیل رزرو انجام نشد.", "error");
    atelierToast("رزرو تکمیل و حذف شد.", "success");
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="atelier-kicker">
            {reservation
              ? "یادداشت قرارهای ساده"
              : "کارهای سبک بدون قرارداد رسمی"}
          </p>
          <h1 className="mt-1 text-2xl font-black">{title}</h1>
          <p className="mt-2 text-xs text-zinc-500">
            {reservation
              ? "رزرو مستقل است و برای تکمیل، تبدیل به قرارداد لازم ندارد."
              : "این اطلاعات مشتری رسمی قرارداد ایجاد نمی‌کند."}
          </p>
        </div>
        <button onClick={() => setEditing("new")} className="atelier-button">
          <Plus className="h-4 w-4" />
          {reservation ? "رزرو جدید" : "مراجعه جدید"}
        </button>
      </div>
      <div className="atelier-panel grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جستجو در عنوان، مشتری یا شماره تماس"
            className="atelier-input w-full py-2.5 pr-9"
          />
        </label>
        {!reservation && <select
          value={payment}
          onChange={(event) => setPayment(event.target.value)}
          className="atelier-input min-w-40 py-2.5"
        >
          <option value="all">همه وضعیت‌ها</option>
          <option value="paid">تسویه شده</option>
          <option value="due">دارای مانده</option>
        </select>}
        <JalaliDatePicker
          value={filterDate}
          onChange={setFilterDate}
          placeholder="فیلتر تاریخ"
          className="min-w-48"
        />
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState text={error} retry={load} />
      ) : !filtered.length ? (
        <EmptyState text={`هنوز ${title} ثبت نشده است.`} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <article key={row.id} className="atelier-panel p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-black">{row.title}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.customerName} • {row.mobile}
                  </p>
                </div>
                {reservation && (
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] ${row.status === "completed" ? "bg-emerald-950 text-emerald-400" : "bg-orange-950 text-orange-400"}`}
                  >
                    {row.status === "completed" ? "تکمیل شده" : "در انتظار"}
                  </span>
                )}
              </div>
              <p className="mt-4 text-xs text-zinc-400">
                {toJalaliDate(reservation ? row.reservedAt : row.visitDate, {
                  showTime: reservation,
                })}
              </p>
              {!reservation && <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-black/30 p-3 text-[10px]">
                <span>
                  قیمت<b className="block text-zinc-200">{money(row.price)}</b>
                </span>
                <span>
                  پرداخت
                  <b className="block text-emerald-400">
                    {money(row.paidAmount)}
                  </b>
                </span>
                <span>
                  مانده
                  <b className="block text-red-400">
                    {money(row.remainingAmount)}
                  </b>
                </span>
              </div>}
              {!reservation && (
                <div className="mt-3 rounded-xl border border-zinc-900 bg-black/20 p-3 text-xs">
                  <div className="flex justify-between text-zinc-500"><span>هزینه پرسنل</span><b className="text-orange-300">{money(row.personnelCost)}</b></div>
                  <div className="mt-2 flex justify-between text-zinc-500"><span>سود اولیه</span><b className={Number(row.preliminaryProfit || 0) >= 0 ? "text-emerald-400" : "text-red-400"}>{money(row.preliminaryProfit)}</b></div>
                  {!!row.personnelAssignments?.length && <p className="mt-2 text-[10px] leading-5 text-zinc-600">{row.personnelAssignments.map((item: any) => `${item.personnelNameSnapshot} — ${item.workTitle}`).join("، ")}</p>}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={() => setViewing(row)} className="atelier-button-secondary flex-1"><Eye className="h-4 w-4" />نمایش</button>
                <button
                  onClick={() => setEditing(row)}
                  className="atelier-button-secondary flex-1"
                >
                  <Edit3 className="h-4 w-4" />
                  ویرایش
                </button>
                {!reservation && Number(row.remainingAmount) > 0 && <button onClick={() => setPaying(row)} className="atelier-button flex-1"><Banknote className="h-4 w-4" />ثبت پرداخت</button>}
                {reservation && <button onClick={() => void complete(row)} className="atelier-button flex-1"><CheckCircle2 className="h-4 w-4" />تکمیل شده و حذف</button>}
                {reservation && <button onClick={() => setConverting(row)} className="atelier-button-secondary flex-1">تکمیل شده و انتقال به مراجعات روزانه</button>}
                <button
                  onClick={() => void remove(row)}
                  className={reservation ? "atelier-button-secondary flex-1 text-red-400" : "atelier-icon-button text-red-400"}
                >
                  <Trash2 className="h-4 w-4" />{reservation && "لغو و حذف رزرو"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <RecordForm
          reservation={reservation}
          initial={editing === "new" ? null : editing}
          accounts={accounts}
          personnel={personnel}
          dailyVisitTitles={dailyVisitTitles}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            setSaving(true);
            try {
              const url =
                editing === "new"
                  ? `/api/atelier/${kind}`
                  : `/api/atelier/${kind}/${editing.id}`;
              const data = await fetch(url, {
                method: editing === "new" ? "POST" : "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }).then((r) => r.json());
              if (!data.success)
                throw new Error(data.error || "ذخیره انجام نشد.");
              setEditing(null);
              load();
            } catch (reason) {
              atelierToast(reason instanceof Error ? reason.message : "ذخیره انجام نشد.", "error");
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
      {converting && <RecordForm reservation={false} initial={{ ...converting, visitDate: converting.reservedAt, price: 0, paidAmount: 0, personnelAssignments: [] }} accounts={accounts} personnel={personnel} dailyVisitTitles={dailyVisitTitles} saving={saving} onClose={() => setConverting(null)} onSave={async (dailyVisit) => { setSaving(true); try { const data = await fetch(`/api/atelier/reservations/${converting.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "convert_to_daily_visit", dailyVisit }) }).then((response) => response.json()); if (!data.success) throw new Error(data.error || "انتقال انجام نشد."); setConverting(null); atelierToast("رزرو به مراجعه روزانه منتقل و سپس حذف شد.", "success"); load(); } catch (reason) { atelierToast(reason instanceof Error ? reason.message : "انتقال انجام نشد.", "error"); } finally { setSaving(false); } }} />}
      {viewing && <AtelierModal title={reservation ? "جزئیات رزرو" : "جزئیات مراجعه روزانه"} onClose={() => setViewing(null)} wide><div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2"><p><span className="text-zinc-500">عنوان:</span> {viewing.title}</p><p><span className="text-zinc-500">مشتری:</span> {viewing.customerName} — {viewing.mobile}</p><p><span className="text-zinc-500">تاریخ:</span> {toJalaliDate(reservation ? viewing.reservedAt : viewing.visitDate, { showTime: reservation })}</p><p><span className="text-zinc-500">توضیحات:</span> {viewing.notes || "—"}</p></div>{!reservation && <><div className="grid gap-3 rounded-2xl border border-red-900 bg-red-950/20 p-5 text-base sm:grid-cols-2 lg:grid-cols-5"><b>کل: {money(viewing.price)}</b><b className="text-emerald-400">دریافت: {money(viewing.paidAmount)}</b><b className="text-red-400">مانده: {money(viewing.remainingAmount)}</b><b className="text-orange-300">هزینه پرسنل: {money(viewing.personnelCost)}</b><b>سود: {money(viewing.preliminaryProfit)}</b></div><section><h3 className="font-black">پرسنل</h3>{viewing.personnelAssignments?.map((row: any) => <p key={row.id} className="mt-2 text-sm">{row.personnelNameSnapshot} — {row.workTitle} — {money(row.wageSnapshot)}</p>) || null}</section><section><h3 className="font-black">تاریخچه پرداخت‌ها</h3>{viewing.paymentHistory?.map((row: any) => <p key={row.id} className="mt-2 rounded-xl border border-zinc-800 p-3 text-sm">{toJalaliDate(row.paymentDate)} — {money(row.amount)} — {row.accountName} — {row.notes || "بدون توضیح"}</p>)}{!viewing.paymentHistory?.length && <p className="mt-2 text-sm text-zinc-600">پرداختی ثبت نشده است.</p>}</section></>}</div></AtelierModal>}
      {paying && <DailyVisitPaymentForm visit={paying} accounts={accounts} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
    </div>
  );
}

function RecordForm({
  reservation,
  initial,
  accounts,
  personnel,
  dailyVisitTitles,
  saving,
  onClose,
  onSave,
}: {
  reservation: boolean;
  initial: any;
  accounts: any[];
  personnel: any[];
  dailyVisitTitles: any[];
  saving: boolean;
  onClose: () => void;
  onSave: (body: any) => Promise<void>;
}) {
  const originalDate = initial
    ? new Date(reservation ? initial.reservedAt : initial.visitDate)
    : new Date();
  const [title, setTitle] = useState(initial?.title || ""),
    [date, setDate] = useState<Date | null>(originalDate),
    [time, setTime] = useState(
      initial && reservation
        ? new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Tehran",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(originalDate)
        : "10:00",
    ),
    [price, setPrice] = useState(Number(initial?.price || 0)),
    [customerName, setCustomerName] = useState(initial?.customerName || ""),
    [mobile, setMobile] = useState(initial?.mobile || ""),
    [paidAmount, setPaidAmount] = useState(Number(initial?.paidAmount || 0)),
    [accountId, setAccountId] = useState(accounts[0]?.id || ""),
    [notes, setNotes] = useState(initial?.notes || ""),
    [assignments, setAssignments] = useState<any[]>(initial?.personnelAssignments?.map((item: any) => ({
      id: item.id,
      personnelId: item.personnelId,
      workTitle: item.workTitle,
      wageAmount: Number(item.wageSnapshot || 0),
    })) || []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!date) return;
    let final = date;
    if (reservation) {
      const parts = getBusinessDateTimeParts(date);
      const [hour, minute] = time.split(":").map(Number);
      final = tehranDateTimeToUtc({ ...parts, hour, minute });
    }
    await onSave({
      title,
      date: final.toISOString(),
      price: reservation ? undefined : price,
      customerName,
      mobile,
      paidAmount: reservation ? undefined : paidAmount,
      accountId: !reservation && paidAmount > 0 ? accountId : undefined,
      paymentMethod: reservation ? undefined : "card_transfer",
      notes,
      personnelAssignments: reservation ? undefined : assignments,
    });
  };
  return (
    <AtelierModal
      title={`${initial ? "ویرایش" : "ثبت"} ${reservation ? "رزرو" : "مراجعه روزانه"}`}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {!reservation && dailyVisitTitles.length ? (
            <label>
              <span className="atelier-label">عنوان *</span>
              <select value={dailyVisitTitles.some((item) => item.title === title) ? title : "custom"} onChange={(event) => setTitle(event.target.value === "custom" ? "" : event.target.value)} className="atelier-input w-full py-2.5">
                <option value="">انتخاب عنوان</option>
                {dailyVisitTitles.map((item) => <option key={item.id} value={item.title}>{item.title}</option>)}
                <option value="custom">عنوان سفارشی</option>
              </select>
              {!dailyVisitTitles.some((item) => item.title === title) && <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="عنوان سفارشی" className="atelier-input mt-2 w-full py-2.5" />}
            </label>
          ) : <Input label="عنوان" value={title} set={setTitle} required />}
          <JalaliDatePicker
            label="تاریخ"
            value={date}
            onChange={setDate}
            required
          />
          {reservation && (
            <Input
              label="ساعت"
              value={time}
              set={setTime}
              type="time"
              required
            />
          )}
          <Input
            label="اسم مشتری"
            value={customerName}
            set={setCustomerName}
            required
          />
          <Input
            label="شماره تماس"
            value={mobile}
            set={setMobile}
            required
            dir="ltr"
          />
          {!reservation && <div>
            <label className="atelier-label">قیمت *</label>
            <MoneyInput
              value={price}
              onChange={setPrice}
              unit="تومان"
              className="!rounded-xl !border-zinc-800 !bg-black"
            />
          </div>}
          {!reservation && <div>
            <label className="atelier-label">مبلغ پرداخت شده *</label>
            <MoneyInput
              value={paidAmount}
              onChange={setPaidAmount}
              disabled={Boolean(initial && Number(initial.paidAmount) > 0)}
              unit="تومان"
              className="!rounded-xl !border-zinc-800 !bg-black"
            />
          </div>}
          {!reservation && paidAmount > 0 && !initial && (
            <label>
              <span className="atelier-label">حساب مقصد *</span>
              <select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="atelier-input w-full py-2.5">
                <option value="">انتخاب حساب</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          )}
          {!reservation && <div className="rounded-xl border border-red-950 bg-red-950/10 p-3 text-xs">
            <span className="text-zinc-500">مبلغ مانده</span>
            <b className="mt-1 block text-red-400">
              {money(Math.max(0, price - paidAmount))}
            </b>
            <small className="text-zinc-600">محاسبه قطعی در سرور</small>
          </div>}
        </div>
        {!reservation && (
          <fieldset className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <legend className="font-black">پرسنل و دستمزد این مراجعه</legend>
              <button type="button" onClick={() => setAssignments((current) => [...current, { personnelId: "", workTitle: "", wageAmount: 0 }])} className="atelier-button-secondary"><Plus className="h-4 w-4" />افزودن پرسنل</button>
            </div>
            <div className="mt-4 space-y-3">
              {assignments.map((assignment, index) => (
                <div key={assignment.id || index} className="grid gap-3 rounded-xl border border-zinc-900 p-3 sm:grid-cols-2">
                  <label><span className="atelier-label">پرسنل *</span><select required value={assignment.personnelId} onChange={(event) => setAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, personnelId: event.target.value } : item))} className="atelier-input w-full py-2.5"><option value="">انتخاب پرسنل</option>{personnel.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
                  <Input label="عنوان فعالیت" value={assignment.workTitle} set={(workTitle) => setAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, workTitle } : item))} required />
                  <label><span className="atelier-label">دستمزد این مراجعه</span><MoneyInput value={assignment.wageAmount} onChange={(wageAmount) => setAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, wageAmount } : item))} unit="تومان" className="!rounded-xl !border-zinc-800 !bg-black" /></label>
                  <button type="button" onClick={() => setAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="atelier-button-secondary self-end text-red-400"><Trash2 className="h-4 w-4" />حذف تخصیص</button>
                </div>
              ))}
              {!assignments.length && <p className="text-xs text-zinc-600">برای این مراجعه هنوز پرسنلی تخصیص داده نشده است.</p>}
            </div>
          </fieldset>
        )}
        <label className="block">
          <span className="atelier-label">توضیحات</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="atelier-input min-h-24 w-full py-3"
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-zinc-900 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="atelier-button-secondary"
          >
            انصراف
          </button>
          <button disabled={saving} className="atelier-button">
            {saving ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}

function DailyVisitPaymentForm({ visit, accounts, onClose, onSaved }: { visit: any; accounts: any[]; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(Number(visit.remainingAmount || 0));
  const [date, setDate] = useState<Date | null>(new Date());
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [method, setMethod] = useState("card_transfer");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  return <AtelierModal title="ثبت پرداخت مراجعه روزانه" onClose={onClose}><form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!date) return; setSaving(true); try { const data = await fetch(`/api/atelier/daily-visits/${visit.id}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount, paidAt: date.toISOString(), accountId, paymentMethod: method, notes, idempotencyKey: crypto.randomUUID() }) }).then((response) => response.json()); if (!data.success) throw new Error(data.error || "ثبت پرداخت انجام نشد."); atelierToast("پرداخت مراجعه ثبت شد.", "success"); onSaved(); } catch (reason) { atelierToast(reason instanceof Error ? reason.message : "ثبت پرداخت انجام نشد.", "error"); } finally { setSaving(false); } }}><div><label className="atelier-label">مبلغ *</label><MoneyInput value={amount} onChange={setAmount} unit="تومان" className="!rounded-xl !border-zinc-800 !bg-black" /></div><JalaliDatePicker label="تاریخ پرداخت" value={date} onChange={setDate} required /><label><span className="atelier-label">حساب *</span><select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="atelier-input w-full py-2.5"><option value="">انتخاب حساب</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label><span className="atelier-label">روش پرداخت *</span><select value={method} onChange={(event) => setMethod(event.target.value)} className="atelier-input w-full py-2.5"><option value="cash">نقدی</option><option value="card_transfer">کارت به کارت</option><option value="pos">کارت‌خوان</option><option value="bank_transfer">انتقال بانکی</option></select></label><label><span className="atelier-label">یادداشت</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="atelier-input min-h-24 w-full py-3" /></label><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="atelier-button-secondary">انصراف</button><button disabled={saving} className="atelier-button">{saving ? "در حال ثبت…" : "ثبت پرداخت"}</button></div></form></AtelierModal>;
}

function Input({
  label,
  value,
  set,
  type = "text",
  required,
  dir,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  type?: string;
  required?: boolean;
  dir?: "ltr" | "rtl";
}) {
  return (
    <label>
      <span className="atelier-label">
        {label}
        {required && " *"}
      </span>
      <input
        value={value}
        onChange={(event) => set(event.target.value)}
        type={type}
        required={required}
        dir={dir}
        className="atelier-input w-full py-2.5"
      />
    </label>
  );
}
