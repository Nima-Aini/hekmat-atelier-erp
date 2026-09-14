"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Edit3, FilePlus2, Printer, Trash2 } from "lucide-react";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  getBusinessDateTimeParts,
  tehranDateTimeToUtc,
  toJalaliDate,
} from "@/lib/dateUtils";
import { AtelierModal } from "./AtelierModal";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";

type ItemForm = {
  title: string;
  description: string;
  quantity: number;
  unitPrice: number;
  notes: string;
};
const blankItem = (): ItemForm => ({
  title: "عکاسی",
  description: "",
  quantity: 1,
  unitPrice: 0,
  notes: "",
});
const formatMoney = (value: unknown) =>
  `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
const mergeTime = (date: Date, time: string) => {
  const parts = getBusinessDateTimeParts(date);
  const [hour, minute] = time.split(":").map(Number);
  return tehranDateTimeToUtc({
    ...parts,
    hour: hour || 0,
    minute: minute || 0,
  });
};

export function ContractsView() {
  const [status, setStatus] = useState<"pending" | "approved">("pending");
  const [contracts, setContracts] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const [printing, setPrinting] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [contractData, settingsData, accountData] = await Promise.all([
        fetch(`/api/atelier/contracts?status=${status}`).then((r) => r.json()),
        fetch("/api/atelier/settings").then((r) => r.json()),
        fetch("/api/accounts").then((r) => r.json()),
      ]);
      if (!contractData.success)
        throw new Error(contractData.error || "دریافت قراردادها ممکن نشد.");
      setContracts(contractData.contracts || []);
      setTypes(settingsData.projectTypes || []);
      setConfig(settingsData.config || {});
      setAccounts(accountData.accounts || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "خطای نامشخص");
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent).detail?.id;
      if (id)
        fetch(`/api/atelier/contracts/${id}`)
          .then((r) => r.json())
          .then((data) => data.success && setEditing(data.contract));
    };
    window.addEventListener("akma:navigate-item", listener);
    return () => window.removeEventListener("akma:navigate-item", listener);
  }, []);

  const approve = async (contract: any) => {
    if (
      !window.confirm(
        `قرارداد ${contract.contractNumber} تایید و سند مالی آن ثبت شود؟`,
      )
    )
      return;
    const response = await fetch(
      `/api/atelier/contracts/${contract.id}/approve`,
      { method: "POST" },
    ).then((r) => r.json());
    if (!response.success)
      return window.alert(response.error || "تأیید قرارداد انجام نشد.");
    await load();
  };

  return (
    <>
      <div className="no-print space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="atelier-kicker">قراردادهای رسمی آتلیه</p>
            <h1 className="mt-1 text-2xl font-black">قرارداد</h1>
            <p className="mt-2 text-xs text-zinc-500">
              ثبت، تأیید، ویرایش و چاپ قرارداد با اتصال مالی امن
            </p>
          </div>
          <button onClick={() => setEditing("new")} className="atelier-button">
            <FilePlus2 className="h-4 w-4" />
            قرارداد جدید
          </button>
        </div>
        <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
          <button
            onClick={() => setStatus("approved")}
            className={`rounded-xl px-4 py-2 text-xs font-bold ${status === "approved" ? "bg-red-700 text-white" : "text-zinc-500"}`}
          >
            قرارداد های تایید شده
          </button>
          <button
            onClick={() => setStatus("pending")}
            className={`rounded-xl px-4 py-2 text-xs font-bold ${status === "pending" ? "bg-red-700 text-white" : "text-zinc-500"}`}
          >
            قرارداد های در انتظار
          </button>
        </div>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState text={error} retry={load} />
        ) : !contracts.length ? (
          <EmptyState
            text={
              status === "pending"
                ? "قرارداد در انتظاری ثبت نشده است."
                : "قرارداد تاییدشده‌ای ثبت نشده است."
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {contracts.map((contract) => (
              <article
                key={contract.id}
                className="atelier-panel group p-4 transition hover:border-red-950 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-red-400">
                      {contract.contractNumber}
                    </p>
                    <h2 className="mt-1 font-black">
                      {contract.customer.name}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {contract.projectType.title} • {contract.customer.mobile}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] ${contract.status === "signed" ? "border-emerald-900 bg-emerald-950/30 text-emerald-400" : "border-orange-900 bg-orange-950/30 text-orange-400"}`}
                  >
                    {contract.status === "signed" ? "تایید شده" : "در انتظار"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-black/30 p-3 text-xs">
                  <span className="text-zinc-500">
                    تاریخ ثبت
                    <b className="mt-1 block text-zinc-200">
                      {toJalaliDate(contract.contractDate)}
                    </b>
                  </span>
                  <span className="text-zinc-500">
                    تاریخ برنامه
                    <b className="mt-1 block text-zinc-200">
                      {contract.programDate
                        ? toJalaliDate(contract.programDate)
                        : "—"}
                    </b>
                  </span>
                  <span className="text-zinc-500">
                    مبلغ کل
                    <b className="mt-1 block text-zinc-200">
                      {formatMoney(contract.totalAmount)}
                    </b>
                  </span>
                  <span className="text-zinc-500">
                    مانده
                    <b className="mt-1 block text-red-400">
                      {formatMoney(contract.remainingAmount)}
                    </b>
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setEditing(contract)}
                    className="atelier-button-secondary flex-1"
                  >
                    <Edit3 className="h-4 w-4" />
                    ویرایش
                  </button>
                  {contract.status === "draft" ? (
                    <button
                      onClick={() => void approve(contract)}
                      className="atelier-button flex-1"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      تایید قرارداد
                    </button>
                  ) : (
                    <button
                      onClick={() => setPrinting(contract)}
                      className="atelier-button flex-1"
                    >
                      <Printer className="h-4 w-4" />
                      چاپ قرارداد
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {editing && (
          <ContractForm
            initial={editing === "new" ? null : editing}
            types={types}
            accounts={accounts}
            config={config}
            saving={saving}
            onClose={() => setEditing(null)}
            onSave={async (body) => {
              setSaving(true);
              try {
                const url =
                  editing === "new"
                    ? "/api/atelier/contracts"
                    : `/api/atelier/contracts/${editing.id}`;
                const response = await fetch(url, {
                  method: editing === "new" ? "POST" : "PUT",
                  headers: {
                    "content-type": "application/json",
                    ...(editing === "new"
                      ? { "idempotency-key": crypto.randomUUID() }
                      : {}),
                  },
                  body: JSON.stringify(body),
                }).then((r) => r.json());
                if (!response.success)
                  throw new Error(response.error || "ذخیره انجام نشد.");
                setEditing(null);
                await load();
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
      {printing && (
        <PrintPreview
          contract={printing}
          config={config}
          onClose={() => setPrinting(null)}
        />
      )}
    </>
  );
}

function ContractForm({
  initial,
  types,
  accounts,
  config,
  saving,
  onClose,
  onSave,
}: {
  initial: any;
  types: any[];
  accounts: any[];
  config: any;
  saving: boolean;
  onClose: () => void;
  onSave: (body: any) => Promise<void>;
}) {
  const approved = initial?.status === "signed";
  const [projectTypeId, setProjectTypeId] = useState(
    initial?.projectTypeId || "",
  );
  const selectedType = types.find((type) => type.id === projectTypeId);
  const [customerName, setCustomerName] = useState(
    initial?.customer?.name || "",
  );
  const [mobile, setMobile] = useState(initial?.customer?.mobile || "");
  const [contractDate, setContractDate] = useState<Date>(
    initial?.contractDate ? new Date(initial.contractDate) : new Date(),
  );
  const [programDate, setProgramDate] = useState<Date | null>(
    initial?.programDate ? new Date(initial.programDate) : null,
  );
  const [time, setTime] = useState(
    initial?.programDate
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Tehran",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(initial.programDate))
      : "10:00",
  );
  const [location, setLocation] = useState(initial?.executionLocation || "");
  const [paidAmount, setPaidAmount] = useState(
    Number(initial?.paidAmount || initial?.depositAmount || 0),
  );
  const [accountId, setAccountId] = useState(
    initial?.typeMetadata?.paymentDraft?.accountId || accounts[0]?.id || "",
  );
  const [metadata, setMetadata] = useState<Record<string, string>>(
    initial?.typeMetadata || {},
  );
  const [items, setItems] = useState<ItemForm[]>(
    initial?.items?.length
      ? initial.items.map((item: any) => ({
          title: item.title,
          description: item.description || "",
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          notes: item.notes || "",
        }))
      : [blankItem()],
  );
  const [notes, setNotes] = useState(initial?.notes || "");
  const [terms, setTerms] = useState(
    initial?.termsAndConditions || config?.contract?.defaultTerms || "",
  );
  const total = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      ),
    [items],
  );
  const fields = Array.isArray(selectedType?.fieldSchema)
    ? selectedType.fieldSchema
    : [];
  const updateItem = (index: number, patch: Partial<ItemForm>) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectTypeId || !programDate)
      return window.alert("نوع پروژه و تاریخ برنامه الزامی است.");
    await onSave({
      projectTypeId,
      customerName,
      mobile,
      contractDate: contractDate.toISOString(),
      programDate: mergeTime(programDate, time).toISOString(),
      programEndDate: new Date(
        mergeTime(programDate, time).getTime() + 4 * 3600000,
      ).toISOString(),
      executionLocation: location,
      typeMetadata: metadata,
      items: approved ? undefined : items,
      paidAmount: approved ? undefined : paidAmount,
      paymentAccountId: paidAmount > 0 ? accountId : undefined,
      notes,
      termsAndConditions: terms,
    });
  };

  return (
    <AtelierModal
      title={
        initial ? `ویرایش قرارداد ${initial.contractNumber}` : "قرارداد جدید"
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-6">
        <section>
          <label className="atelier-label">
            نوع پروژه <span className="text-red-400">*</span>
          </label>
          <select
            required
            disabled={Boolean(initial)}
            value={projectTypeId}
            onChange={(event) => {
              setProjectTypeId(event.target.value);
              setMetadata({});
            }}
            className="atelier-input w-full py-3"
          >
            <option value="">ابتدا نوع پروژه را انتخاب کنید</option>
            {types
              .filter((type) => type.active)
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.title}
                </option>
              ))}
          </select>
        </section>
        {projectTypeId && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="نام مشتری"
                required
                value={customerName}
                onChange={setCustomerName}
              />
              <Field
                label="شماره تماس"
                required
                value={mobile}
                onChange={setMobile}
                dir="ltr"
              />
              <JalaliDatePicker
                label="تاریخ ثبت قرارداد"
                required
                value={contractDate}
                onChange={(value) => value && setContractDate(value)}
                disabled={approved}
              />
              <JalaliDatePicker
                label="تاریخ برنامه"
                required
                value={programDate}
                onChange={(value) => setProgramDate(value)}
              />
              <Field
                label="ساعت"
                required
                value={time}
                onChange={setTime}
                type="time"
                dir="ltr"
              />
              <Field label="محل اجرا" value={location} onChange={setLocation} />
            </section>
            {fields.length > 0 && (
              <section className="atelier-panel-red p-4">
                <h3 className="mb-4 text-sm font-black">
                  اطلاعات مخصوص {selectedType?.title}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {fields.map((field: any) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      value={metadata[field.key] || ""}
                      onChange={(value) =>
                        setMetadata((current) => ({
                          ...current,
                          [field.key]: value,
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
            )}
            {!approved && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-black">آیتم های قرارداد</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((current) => [...current, blankItem()])
                    }
                    className="atelier-button-secondary"
                  >
                    افزودن آیتم
                  </button>
                </div>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_.7fr_1fr_auto]"
                    >
                      <Field
                        label="عنوان"
                        required
                        value={item.title}
                        onChange={(value) =>
                          updateItem(index, { title: value })
                        }
                      />
                      <div>
                        <label className="atelier-label">تعداد / مقدار</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(index, {
                              quantity: Number(event.target.value),
                            })
                          }
                          className="atelier-input w-full py-2.5"
                        />
                      </div>
                      <div>
                        <label className="atelier-label">قیمت</label>
                        <MoneyInput
                          value={item.unitPrice}
                          onChange={(value) =>
                            updateItem(index, { unitPrice: value })
                          }
                          unit="تومان"
                          className="!rounded-xl !border-zinc-800 !bg-[#09090b] focus:!border-red-700"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={items.length === 1}
                        onClick={() =>
                          setItems((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                        className="atelier-icon-button self-end text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="atelier-label">مبلغ کل</label>
                <div className="rounded-xl border border-zinc-800 bg-black/40 px-3 py-3 text-sm font-black">
                  {formatMoney(total)}
                </div>
              </div>
              <div>
                <label className="atelier-label">مبلغ پرداخت شده</label>
                <MoneyInput
                  disabled={approved}
                  value={paidAmount}
                  onChange={setPaidAmount}
                  unit="تومان"
                  className="!rounded-xl !border-zinc-800 !bg-[#09090b] focus:!border-red-700"
                />
              </div>
              <div>
                <label className="atelier-label">مبلغ مانده</label>
                <div className="rounded-xl border border-red-950 bg-red-950/15 px-3 py-3 text-sm font-black text-red-400">
                  {formatMoney(Math.max(0, total - paidAmount))}
                  <small className="mt-1 block font-normal text-zinc-600">
                    مقدار قطعی در سرور محاسبه می‌شود.
                  </small>
                </div>
              </div>
              {!approved && paidAmount > 0 && (
                <div className="sm:col-span-3">
                  <label className="atelier-label">حساب دریافت</label>
                  <select
                    required
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    className="atelier-input w-full py-2.5"
                  >
                    <option value="">انتخاب حساب</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="atelier-label">توضیحات</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="atelier-input min-h-24 w-full py-3"
                />
              </div>
              <div>
                <label className="atelier-label">شرایط قرارداد</label>
                <textarea
                  value={terms}
                  onChange={(event) => setTerms(event.target.value)}
                  className="atelier-input min-h-24 w-full py-3"
                />
              </div>
            </section>
            <div className="flex justify-end gap-2 border-t border-zinc-900 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="atelier-button-secondary"
              >
                انصراف
              </button>
              <button disabled={saving} className="atelier-button">
                {saving ? "در حال ذخیره…" : "ذخیره قرارداد"}
              </button>
            </div>
          </>
        )}
      </form>
    </AtelierModal>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  disabled,
  type = "text",
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <label className="block">
      <span className="atelier-label">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      <input
        required={required}
        disabled={disabled}
        type={type}
        dir={dir}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="atelier-input w-full py-2.5 disabled:opacity-50"
      />
    </label>
  );
}

function PrintPreview({
  contract,
  config,
  onClose,
}: {
  contract: any;
  config: any;
  onClose: () => void;
}) {
  const identity = config?.identity || {};
  const contractConfig = config?.contract || {};
  return (
    <AtelierModal title="پیش نمایش چاپ قرارداد" onClose={onClose} wide>
      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="atelier-button">
          <Printer className="h-4 w-4" />
          چاپ قرارداد
        </button>
      </div>
      <article
        className="print-contract mx-auto min-h-[277mm] w-full max-w-[210mm] bg-white p-8 text-right text-black shadow-2xl sm:p-12"
        dir="rtl"
      >
        <header className="border-b-2 border-black pb-5 text-center">
          {identity.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={identity.logoUrl}
              alt="نشان آتلیه"
              className="mx-auto mb-3 h-16 max-w-40 object-contain"
            />
          )}
          <h1 className="text-2xl font-black">
            {identity.name || "حکمت آتلیه"}
          </h1>
          <p className="mt-2 text-sm">قرارداد خدمات عکاسی و فیلمبرداری</p>
          {(identity.phone || identity.address) && (
            <p className="mt-1 text-xs">
              {[identity.phone, identity.address].filter(Boolean).join(" • ")}
            </p>
          )}
          <p className="mt-1 text-xs">
            شماره قرارداد: {contract.contractNumber}
          </p>
        </header>
        <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <p>
            <b>نام مشتری:</b> {contract.customer.name}
          </p>
          <p>
            <b>شماره تماس:</b> {contract.customer.mobile}
          </p>
          <p>
            <b>نوع پروژه:</b> {contract.projectType.title}
          </p>
          <p>
            <b>تاریخ ثبت:</b> {toJalaliDate(contract.contractDate)}
          </p>
          <p>
            <b>تاریخ برنامه:</b> {toJalaliDate(contract.programDate)}
          </p>
          <p>
            <b>محل اجرا:</b> {contract.executionLocation || "—"}
          </p>
        </section>
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr>
              {["ردیف", "عنوان", "تعداد", "قیمت واحد", "جمع"].map((label) => (
                <th key={label} className="border border-black p-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contract.items.map((item: any, index: number) => (
              <tr key={item.id}>
                <td className="border border-black p-2 text-center">
                  {(index + 1).toLocaleString("fa-IR")}
                </td>
                <td className="border border-black p-2">{item.title}</td>
                <td className="border border-black p-2 text-center">
                  {Number(item.quantity).toLocaleString("fa-IR")}
                </td>
                <td className="border border-black p-2">
                  {formatMoney(item.unitPrice)}
                </td>
                <td className="border border-black p-2">
                  {formatMoney(Number(item.quantity) * Number(item.unitPrice))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="mt-6 grid grid-cols-3 gap-3 text-sm">
          <p>
            <b>مبلغ کل:</b>
            <br />
            {formatMoney(contract.totalAmount)}
          </p>
          <p>
            <b>پرداخت شده:</b>
            <br />
            {formatMoney(contract.paidAmount)}
          </p>
          <p>
            <b>مانده:</b>
            <br />
            {formatMoney(contract.remainingAmount)}
          </p>
        </section>
        <section className="mt-8 min-h-24 border-t border-black pt-4 text-sm">
          <b>شرایط و توضیحات:</b>
          <p className="mt-2 whitespace-pre-wrap leading-7">
            {contract.termsAndConditions || contract.notes || "—"}
          </p>
        </section>
        {identity.printInfo && (
          <p className="mt-5 whitespace-pre-wrap border-t border-black/30 pt-3 text-xs leading-6">
            {identity.printInfo}
          </p>
        )}
        <footer className="mt-16 grid grid-cols-2 gap-16 text-center text-sm">
          <div className="border-t border-black pt-3">
            امضا و اثر انگشت مشتری
          </div>
          <div className="border-t border-black pt-3">مهر و امضای آتلیه</div>
        </footer>
        {contractConfig.footer && (
          <p className="mt-8 whitespace-pre-wrap text-center text-xs">
            {contractConfig.footer}
          </p>
        )}
      </article>
    </AtelierModal>
  );
}
