"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Search, UsersRound } from "lucide-react";
import { toJalaliDate } from "@/lib/dateUtils";
import { AtelierModal } from "./AtelierModal";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";

const money = (value: unknown) =>
  value === null || value === undefined ? "—" : `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
type Sort = "newest" | "oldest" | "contracts" | "total" | "remaining" | "next";

export function ContractCustomersView() {
  const [customers, setCustomers] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState<Sort>("newest"),
    [editing, setEditing] = useState<any>(null);
  const load = () => {
    setLoading(true);
    fetch("/api/atelier/customers")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success)
          throw new Error(data.error || "دریافت مشتریان ممکن نشد.");
        setCustomers(data.customers || []);
        setError("");
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const rows = useMemo(
    () =>
      customers
        .filter((row) => `${row.name} ${row.mobile}`.includes(query))
        .sort((a, b) =>
          sort === "newest"
            ? +new Date(b.lastContract) - +new Date(a.lastContract)
            : sort === "oldest"
              ? +new Date(a.lastContract) - +new Date(b.lastContract)
              : sort === "contracts"
                ? b.contractCount - a.contractCount
                : sort === "total"
                  ? b.total - a.total
                  : sort === "remaining"
                    ? b.remaining - a.remaining
                    : +(a.nextProgram
                        ? new Date(a.nextProgram)
                        : new Date(8640000000000000)) -
                      +(b.nextProgram
                        ? new Date(b.nextProgram)
                        : new Date(8640000000000000)),
        ),
    [customers, query, sort],
  );
  return (
    <div className="space-y-5">
      <div>
        <p className="atelier-kicker">فقط مشتریان دارای قرارداد رسمی</p>
        <h1 className="mt-1 text-2xl font-black">مشتریان</h1>
        <p className="mt-2 text-xs text-zinc-500">
          مشتری جدید فقط هنگام ثبت قرارداد ساخته یا به پرونده موجود متصل می‌شود.
        </p>
      </div>
      <div className="atelier-panel grid gap-3 p-3 sm:grid-cols-[1fr_auto]">
        <label className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جستجوی نام یا شماره تماس"
            className="atelier-input w-full py-2.5 pr-9"
          />
        </label>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
          className="atelier-input py-2.5"
        >
          <option value="newest">جدیدترین</option>
          <option value="oldest">قدیمی‌ترین</option>
          <option value="contracts">بیشترین قرارداد</option>
          <option value="total">بیشترین مبلغ</option>
          <option value="remaining">بیشترین مانده</option>
          <option value="next">نزدیک‌ترین برنامه</option>
        </select>
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState text={error} retry={load} />
      ) : !rows.length ? (
        <EmptyState text="مشتری دارای قرارداد یافت نشد." />
      ) : (
        <div className="space-y-2">
          {rows.map((customer) => (
            <article
              key={customer.id}
              className="atelier-panel grid gap-3 p-4 sm:grid-cols-[1.2fr_.7fr_.8fr_.8fr_auto] sm:items-center"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-950 bg-red-950/20">
                  <UsersRound className="h-4 w-4 text-red-400" />
                </span>
                <span>
                  <strong className="block text-sm">{customer.name}</strong>
                  <span className="text-xs text-zinc-500" dir="ltr">
                    {customer.mobile}
                  </span>
                </span>
              </div>
              <Info
                label="تعداد قرارداد"
                value={customer.contractCount.toLocaleString("fa-IR")}
              />
              <Info
                label="آخرین قرارداد"
                value={
                  customer.lastContract
                    ? toJalaliDate(customer.lastContract)
                    : "—"
                }
              />
              <Info
                label="نزدیک‌ترین برنامه"
                value={
                  customer.nextProgram
                    ? toJalaliDate(customer.nextProgram)
                    : "—"
                }
              />
              <div className="flex items-center gap-3 sm:justify-end">
                <span className="text-[10px] text-zinc-500">
                  جمع {money(customer.total)}
                  <b className="mt-1 block text-red-400">
                    مانده {money(customer.remaining)}
                  </b>
                </span>
                <button
                  onClick={() => setEditing(customer)}
                  className="atelier-icon-button"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <CustomerEdit
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[10px] text-zinc-600">
      {label}
      <b className="mt-1 block text-xs text-zinc-300">{value}</b>
    </span>
  );
}
function CustomerEdit({
  customer,
  onClose,
  onSaved,
}: {
  customer: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer.name),
    [mobile, setMobile] = useState(customer.mobile),
    [saving, setSaving] = useState(false);
  return (
    <AtelierModal title="ویرایش مشتری" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const data = await fetch(`/api/studio/customers/${customer.id}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, mobile }),
            }).then((r) => r.json());
            if (!data.success)
              throw new Error(data.error || "ویرایش انجام نشد.");
            onSaved();
          } catch (reason) {
            window.alert(
              reason instanceof Error ? reason.message : "ویرایش انجام نشد.",
            );
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-4"
      >
        <label>
          <span className="atelier-label">نام مشتری *</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="atelier-input w-full py-2.5"
          />
        </label>
        <label>
          <span className="atelier-label">شماره تماس *</span>
          <input
            required
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
            className="atelier-input w-full py-2.5"
            dir="ltr"
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
          <button disabled={saving} className="atelier-button">
            ذخیره
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}
