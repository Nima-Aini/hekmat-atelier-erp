"use client";
import { useCallback, useEffect, useState } from "react";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { AccountSelector, PaymentMethodSelect, type AccountOption } from "./FinanceControls";
import { atelierToast } from "@/lib/atelierFeedback";

type Wage = { salaryRecordId: string; remaining: number; paid: number; sourceTitle: string; workTitle: string };
export function PersonnelWagePayments({ personId, onPaid }: { personId: string; onPaid: () => void }) {
  const [rows, setRows] = useState<Wage[]>([]), [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selected, setSelected] = useState<Wage | null>(null), [amount, setAmount] = useState(0), [accountId, setAccountId] = useState("");
  const [date, setDate] = useState<Date | null>(new Date()), [method, setMethod] = useState("bank_transfer"), [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false), [requestKey, setRequestKey] = useState("");
  const load = useCallback(() => fetch(`/api/atelier/personnel/${personId}/finance`).then(r => r.json()).then(body => { if (body.success && body.canPay) setRows(body.file.history.filter((row: Wage) => row.remaining > 0)); }).catch(() => atelierToast("دریافت دستمزدها ممکن نشد.", "error")), [personId]);
  useEffect(() => { void load(); }, [load]);
  const choose = async (row: Wage) => {
    const body = await fetch(`/api/atelier/personnel/${personId}/finance/accounts`).then(r => r.json());
    if (!body.success) return atelierToast(body.error || "دریافت حساب‌ها ممکن نشد.", "error");
    setAccounts(body.accounts); setSelected(row); setAmount(row.remaining); setRequestKey(crypto.randomUUID());
  };
  return <section className="space-y-3">{rows.map(row => <div key={row.salaryRecordId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3 text-xs"><span>{row.sourceTitle} — {row.workTitle}<br />پرداخت شده: {row.paid.toLocaleString("fa-IR")} — مانده: {row.remaining.toLocaleString("fa-IR")} تومان</span><button className="atelier-btn atelier-btn-primary" onClick={() => void choose(row)}>پرداخت دستمزد</button></div>)}{selected && <form className="space-y-3 rounded-xl border border-red-900 p-4" onSubmit={async event => {
    event.preventDefault(); if (busy || !date) return; setBusy(true);
    try {
      const body = await fetch(`/api/atelier/personnel/${personId}/finance/${selected.salaryRecordId}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, accountId, paymentDate: date.toISOString(), paymentMethod: method, notes, idempotencyKey: requestKey }) }).then(r => r.json());
      if (!body.success) throw new Error(body.error || "پرداخت انجام نشد.");
      setSelected(null); await load(); onPaid(); atelierToast("پرداخت دستمزد در سیستم مالی ثبت شد.", "success");
    } catch (error) { atelierToast(error instanceof Error ? error.message : "ارتباط برقرار نشد.", "error"); } finally { setBusy(false); }
  }}><p className="text-sm">ثبت پرداخت برای {selected.workTitle}؛ مبلغ از حساب انتخاب‌شده کسر می‌شود.</p><MoneyInput value={amount} onChange={setAmount} /><AccountSelector accounts={accounts} value={accountId} onChange={setAccountId} /><PaymentMethodSelect value={method} onChange={setMethod} /><JalaliDatePicker label="تاریخ پرداخت" value={date} onChange={setDate} /><textarea className="atelier-input w-full" placeholder="یادداشت" value={notes} onChange={event => setNotes(event.target.value)} /><button disabled={busy || !accountId || amount <= 0 || amount > selected.remaining || !date} className="atelier-btn atelier-btn-primary">تأیید و ثبت پرداخت</button><button type="button" disabled={busy} className="atelier-btn" onClick={() => setSelected(null)}>انصراف</button></form>}</section>;
}
