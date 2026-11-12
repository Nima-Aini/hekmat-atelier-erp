"use client";
import { useEffect, useState } from "react";
import { AtelierModal } from "./AtelierModal";
import { atelierToast } from "@/lib/atelierFeedback";
import { toJalaliDate } from "@/lib/dateUtils";

type Preview = { total: number; received: number; remaining: number; invoiceStatus: string | null; token: string; receipts: Array<{ id: string; accountName: string; amount: string; paymentDate: string }> };
const money = (amount: number | string) => `${Number(amount).toLocaleString("fa-IR")} تومان`;
export function ContractCancellationDialog({ contract, onClose, onSaved }: { contract: { id: string; status: string; contractNumber: string }; onClose: () => void; onSaved: () => void }) {
  const draft = contract.status === "draft";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (draft) return;
    const controller = new AbortController();
    fetch(`/api/atelier/contracts/${contract.id}/cancellation`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "دریافت اطلاعات ناموفق بود.");
      if (!controller.signal.aborted) setPreview(body.preview);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [contract.id, draft]);
  return <AtelierModal title={`${draft ? "حذف پیش‌قرارداد" : "ابطال قرارداد"} ${contract.contractNumber}`} onClose={busy ? () => undefined : onClose}>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); if (!confirmed || busy || (!draft && !preview)) return;
      setBusy(true); setError("");
      try {
        const response = await fetch(`/api/atelier/contracts/${contract.id}${draft ? "" : "/cancellation"}`, { method: draft ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: draft ? undefined : JSON.stringify({ reason, confirmed: true, token: preview!.token }) });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || "عملیات انجام نشد.");
        atelierToast(draft ? "پیش‌قرارداد حذف شد؛ اطلاعات مشتری حفظ شد." : "قرارداد باطل شد؛ برگشت وجه در سیستم مالی ثبت شد.", "success");
        onSaved();
      } catch (reason) { setError(reason instanceof Error ? reason.message : "عملیات انجام نشد."); }
      finally { setBusy(false); }
    }}>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {draft ? <p className="text-sm leading-7 text-zinc-300">فقط پیش‌قرارداد بدون سند مالی و وابستگی برنامه‌ریزی حذف می‌شود. مشتری و سایر پروژه‌ها حذف نمی‌شوند. این عملیات قابل بازگشت نیست.</p> : !preview ? <p>در حال بررسی دریافت‌های قرارداد…</p> : <>
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 p-3 text-sm"><dt>مبلغ قرارداد</dt><dd>{money(preview.total)}</dd><dt>دریافت ثبت‌شده</dt><dd>{money(preview.received)}</dd><dt>مانده</dt><dd>{money(preview.remaining)}</dd><dt>وضعیت فاکتور</dt><dd>{preview.invoiceStatus === "issued" ? "صادرشده" : preview.invoiceStatus === "corrected" ? "اصلاح‌شده" : preview.invoiceStatus === "cancelled" ? "باطل‌شده" : "نیازمند بررسی"}</dd></dl>
        <div className="max-h-48 space-y-2 overflow-auto">{preview.receipts.map(receipt => <div key={receipt.id} className="rounded-lg border border-zinc-800 p-2 text-xs">{receipt.accountName} · {money(receipt.amount)} · {toJalaliDate(receipt.paymentDate)}</div>)}</div>
        <p className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm leading-7 text-red-200">{preview.received > 0 ? `برای این قرارداد ${money(preview.received)} دریافت ثبت شده است. ابطال قرارداد نیازمند ثبت برگشت این مبلغ در سیستم مالی از حساب‌های دریافت‌کننده است.` : "این قرارداد دریافت ثبت‌شده ندارد."} سابقه دریافت‌ها حفظ می‌شود. این عملیات انتقال بانکی انجام نمی‌دهد. تعهدات دستمزد و اجاره حذف نمی‌شوند.</p>
        <label className="block"><span className="atelier-label">دلیل ابطال</span><textarea required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} className="atelier-input min-h-20 w-full" /></label>
      </>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />پیامدهای این عملیات را خواندم و تأیید می‌کنم.</label>
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="atelier-button-secondary">انصراف</button><button disabled={busy || !confirmed || (!draft && (!preview || reason.trim().length < 3))} className="atelier-button">{busy ? "در حال ثبت…" : draft ? "حذف پیش‌قرارداد" : "تأیید ابطال و ثبت برگشت وجه"}</button></div>
    </form>
  </AtelierModal>;
}
