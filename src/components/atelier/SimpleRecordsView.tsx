"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Edit3, Plus, Search, Trash2 } from "lucide-react";
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

const money = (value: unknown) =>
  `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
type Kind = "daily-visits" | "reservations";

export function SimpleRecordsView({ kind }: { kind: Kind }) {
  const reservation = kind === "reservations";
  const title = reservation ? "رزرو" : "مراجعات روزانه";
  const [records, setRecords] = useState<any[]>([]),
    [accounts, setAccounts] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [payment, setPayment] = useState("all"),
    [filterDate, setFilterDate] = useState<Date | null>(null),
    [editing, setEditing] = useState<any | "new" | null>(null),
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
  useEffect(() => { fetch("/api/accounts").then((r) => r.json()).then((body) => body.success && setAccounts(body.accounts || [])).catch(() => undefined); }, []);
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
    if (
      !window.confirm(
        `${reservation ? "رزرو" : "مراجعه"} «${row.title}» حذف شود؟`,
      )
    )
      return;
    const data = await fetch(`/api/atelier/${kind}/${row.id}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (!data.success) return window.alert(data.error || "حذف انجام نشد.");
    load();
  };
  const complete = async (row: any) => {
    const data = await fetch(`/api/atelier/reservations/${row.id}`, {
      method: "POST",
    }).then((r) => r.json());
    if (!data.success)
      return window.alert(data.error || "تکمیل رزرو انجام نشد.");
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
        <select
          value={payment}
          onChange={(event) => setPayment(event.target.value)}
          className="atelier-input min-w-40 py-2.5"
        >
          <option value="all">همه وضعیت‌ها</option>
          <option value="paid">تسویه شده</option>
          <option value="due">دارای مانده</option>
        </select>
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
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-black/30 p-3 text-[10px]">
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
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setEditing(row)}
                  className="atelier-button-secondary flex-1"
                >
                  <Edit3 className="h-4 w-4" />
                  ویرایش
                </button>
                {reservation && row.status !== "completed" && (
                  <button
                    onClick={() => void complete(row)}
                    className="atelier-button flex-1"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    تکمیل شده
                  </button>
                )}
                <button
                  onClick={() => void remove(row)}
                  className="atelier-icon-button text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
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
              window.alert(
                reason instanceof Error ? reason.message : "ذخیره انجام نشد.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

function RecordForm({
  reservation,
  initial,
  accounts,
  saving,
  onClose,
  onSave,
}: {
  reservation: boolean;
  initial: any;
  accounts: any[];
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
    [notes, setNotes] = useState(initial?.notes || "");
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
      price,
      customerName,
      mobile,
      paidAmount,
      accountId: paidAmount > 0 ? accountId : undefined,
      paymentMethod: "card_transfer",
      notes,
    });
  };
  return (
    <AtelierModal
      title={`${initial ? "ویرایش" : "ثبت"} ${reservation ? "رزرو" : "مراجعه روزانه"}`}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="عنوان" value={title} set={setTitle} required />
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
          <div>
            <label className="atelier-label">قیمت *</label>
            <MoneyInput
              value={price}
              onChange={setPrice}
              unit="تومان"
              className="!rounded-xl !border-zinc-800 !bg-black"
            />
          </div>
          <div>
            <label className="atelier-label">مبلغ پرداخت شده *</label>
            <MoneyInput
              value={paidAmount}
              onChange={setPaidAmount}
              disabled={Boolean(initial && Number(initial.paidAmount) > 0)}
              unit="تومان"
              className="!rounded-xl !border-zinc-800 !bg-black"
            />
          </div>
          {paidAmount > 0 && !initial && (
            <label>
              <span className="atelier-label">حساب مقصد *</span>
              <select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="atelier-input w-full py-2.5">
                <option value="">انتخاب حساب</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          )}
          <div className="rounded-xl border border-red-950 bg-red-950/10 p-3 text-xs">
            <span className="text-zinc-500">مبلغ مانده</span>
            <b className="mt-1 block text-red-400">
              {money(Math.max(0, price - paidAmount))}
            </b>
            <small className="text-zinc-600">محاسبه قطعی در سرور</small>
          </div>
        </div>
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
