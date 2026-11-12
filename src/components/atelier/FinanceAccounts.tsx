"use client";

import { useState } from "react";
import {
  CreditCard,
  Landmark,
  Plus,
  Search,
  Star,
  WalletCards,
} from "lucide-react";
import { atelierConfirm } from "@/lib/atelierFeedback";
import { atelierLabel } from "@/lib/atelierLabels";
import { AtelierModal } from "./AtelierModal";
import { OverviewCard, OverviewEmpty, overviewMoney } from "./OverviewUi";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { NeonStatus } from "./FinanceControls";

export function FinanceAccounts({
  accounts,
  busy,
  mutate,
  onAdjust,
}: {
  accounts: any[];
  busy: boolean;
  mutate: (
    url: string,
    body: Record<string, unknown>,
    method?: string,
  ) => Promise<boolean>;
  onAdjust: (row: any) => void;
}) {
  const [editing, setEditing] = useState<any>(null),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all");
  const rows = accounts.filter(
    (row) =>
      `${row.name} ${row.bankName || ""}`.includes(query) &&
      (type === "all" || row.type === type),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <Search className="absolute right-3 top-3 h-4 w-4 text-slate-500" />
          <input
            aria-label="جستجوی حساب"
            className="atelier-input w-full py-2.5 pr-9"
            placeholder="نام حساب یا بانک"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="نوع حساب"
          className="atelier-input py-2.5"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">همه حساب‌ها</option>
          <option value="bank">بانکی</option>
          <option value="cash">صندوق نقدی</option>
          <option value="pos">کارت‌خوان</option>
        </select>
        <button
          className="atelier-button"
          onClick={() => setEditing({ name: "", type: "bank", balance: 0 })}
        >
          <Plus className="h-4 w-4" />
          حساب جدید
        </button>
      </div>
      {rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const Icon =
              row.type === "cash"
                ? WalletCards
                : row.type === "pos"
                  ? CreditCard
                  : Landmark;
            return (
              <OverviewCard key={row.id}>
                <div className="flex items-start gap-3">
                  <span className="rounded-xl border border-blue-800/60 bg-blue-950/30 p-3 text-blue-400">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-bold">{row.name}</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {row.bankName || atelierLabel(row.type)}
                    </p>
                  </div>
                  {row.isDefault && (
                    <NeonStatus tone="info">پیش‌فرض</NeonStatus>
                  )}
                </div>
                <p className="my-5 text-xl font-extrabold">
                  {overviewMoney(row.balance)}
                </p>
                {row.accountNumber && (
                  <p
                    className="mb-4 text-xs tracking-wider text-slate-500"
                    dir="ltr"
                  >
                    •••• {String(row.accountNumber).slice(-4)}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                  <button
                    className="overview-range"
                    onClick={() => setEditing(row)}
                  >
                    ویرایش
                  </button>
                  <button
                    className="overview-range"
                    onClick={() => onAdjust(row)}
                  >
                    اصلاح موجودی
                  </button>
                  {!row.isDefault && (
                    <button
                      className="overview-range"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          "/api/accounts",
                          { id: row.id, isDefault: true },
                          "PUT",
                        )
                      }
                    >
                      <Star className="inline h-3 w-3" /> پیش‌فرض
                    </button>
                  )}
                  <button
                    className="overview-range !text-rose-400"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await atelierConfirm(
                          `حساب «${row.name}» حذف یا طبق قواعد سرور بایگانی شود؟`,
                        )
                      )
                        await mutate(
                          `/api/accounts?id=${row.id}`,
                          {},
                          "DELETE",
                        );
                    }}
                  >
                    حذف / بایگانی
                  </button>
                </div>
              </OverviewCard>
            );
          })}
        </div>
      ) : (
        <OverviewEmpty>حسابی با این مشخصات پیدا نشد.</OverviewEmpty>
      )}
      {editing && (
        <AccountForm
          row={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            if (
              await mutate("/api/accounts", body, editing.id ? "PUT" : "POST")
            )
              setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function AccountForm({
  row,
  busy,
  onClose,
  onSave,
}: {
  row: any;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState(row);
  const field = (key: string, value: unknown) =>
    setForm({ ...form, [key]: value });
  return (
    <AtelierModal
      title={row.id ? "ویرایش حساب" : "حساب جدید"}
      onClose={onClose}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const {
            id,
            name,
            type,
            bankName,
            accountNumber,
            isDefault,
            balance,
          } = form;
          onSave({
            id,
            name,
            type,
            bankName,
            accountNumber,
            isDefault,
            ...(id ? {} : { balance }),
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="atelier-label">نام حساب *</span>
            <input
              required
              className="atelier-input w-full py-2.5"
              value={form.name}
              onChange={(e) => field("name", e.target.value)}
            />
          </label>
          <label>
            <span className="atelier-label">نوع حساب</span>
            <select
              className="atelier-input w-full py-2.5"
              value={form.type}
              onChange={(e) => field("type", e.target.value)}
            >
              <option value="bank">بانکی</option>
              <option value="cash">صندوق نقدی</option>
              <option value="pos">کارت‌خوان</option>
              <option value="other">سایر</option>
            </select>
          </label>
          <label>
            <span className="atelier-label">نام بانک</span>
            <input
              className="atelier-input w-full py-2.5"
              value={form.bankName || ""}
              onChange={(e) => field("bankName", e.target.value)}
            />
          </label>
          <label>
            <span className="atelier-label">شماره حساب / کارت</span>
            <input
              className="atelier-input w-full py-2.5"
              dir="ltr"
              value={form.accountNumber || ""}
              onChange={(e) => field("accountNumber", e.target.value)}
            />
          </label>
          {!row.id && (
            <div>
              <span className="atelier-label">موجودی اولیه</span>
              <MoneyInput
                value={form.balance}
                onChange={(value) => field("balance", value)}
                unit="تومان"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.isDefault)}
              onChange={(e) => field("isDefault", e.target.checked)}
            />
            حساب پیش‌فرض
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            className="atelier-button-secondary"
            onClick={onClose}
          >
            انصراف
          </button>
          <button disabled={busy} className="atelier-button">
            ذخیره حساب
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}
