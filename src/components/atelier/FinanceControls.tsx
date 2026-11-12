"use client";

export type AccountOption = { id: string; name: string; type: string; balance: number; bankName?: string | null };

const money = (value: unknown) => `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
const accountType: Record<string, string> = { bank: "بانکی", cash: "صندوق نقدی", pos: "کارت‌خوان", receivable: "دریافتنی", payable: "پرداختنی" };

export function AccountSelector({ accounts, value, onChange, required = true, label = "حساب" }: { accounts: AccountOption[]; value?: string; onChange: (id: string) => void; required?: boolean; label?: string }) {
  return <label className="block"><span className="atelier-label">{label}{required ? " *" : ""}</span><select required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} className="atelier-input w-full py-2.5"><option value="">انتخاب حساب فعال</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {accountType[account.type] || account.type} — موجودی {money(account.balance)}</option>)}</select></label>;
}

export const PAYMENT_METHODS = [
  ["card_transfer", "کارت به کارت"], ["cash", "نقدی"], ["pos", "کارتخوان"], ["bank_transfer", "واریز بانکی"], ["online", "درگاه"], ["other", "سایر"],
] as const;

export function PaymentMethodSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="atelier-label">روش پرداخت *</span><select required value={value} onChange={(event) => onChange(event.target.value)} className="atelier-input w-full py-2.5">{PAYMENT_METHODS.map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select></label>;
}

export function NeonStatus({ tone, children }: { tone: "critical" | "warning" | "success" | "info" | "special"; children: React.ReactNode }) {
  const styles = { critical: "border-red-700/70 bg-red-950/35 text-red-200 shadow-[0_0_12px_rgba(239,68,68,.22)]", warning: "border-amber-600/70 bg-amber-950/25 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,.18)]", success: "border-emerald-700/70 bg-emerald-950/25 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,.18)]", info: "border-cyan-700/70 bg-cyan-950/25 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,.18)]", special: "border-violet-700/70 bg-violet-950/25 text-violet-200 shadow-[0_0_12px_rgba(139,92,246,.18)]" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles[tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />{children}</span>;
}
