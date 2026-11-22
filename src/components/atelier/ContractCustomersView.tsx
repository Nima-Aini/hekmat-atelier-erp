"use client";
import { useUrlState } from "@/lib/useUrlState";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Eye, Search, UsersRound } from "lucide-react";
import { toJalaliDate } from "@/lib/dateUtils";
import { AtelierModal } from "./AtelierModal";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";
import { atelierToast } from "@/lib/atelierFeedback";
import { CustomerProfileView } from "./CustomerProfileView";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import type { CustomerProfileData } from "@/lib/customerProfile";

const money = (value: unknown) =>
  value === null || value === undefined ? "—" : `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
type CustomerEditTarget = { id: string; name: string; mobile: string; profile?: CustomerProfileData["customer"] };

type Sort = "newest" | "oldest" | "contracts" | "total" | "remaining" | "next";

export function ContractCustomersView({ customerId = null, onViewCustomer, onNavigate }: {
  customerId?: string | null;
  onViewCustomer: (id: string | null) => void;
  onNavigate: (section: string, id: string | null) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [customers, setCustomers] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useUrlState("query", ""),
    [sort, setSort] = useState<Sort>("newest"),
    [editing, setEditing] = useState<CustomerEditTarget | null>(null);
  const load = useCallback(() => {
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
  }, []);
  useEffect(() => { if (!customerId) load(); }, [customerId, load]);
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
  if (customerId) return <>
    <CustomerProfileView id={customerId} revision={revision} onBack={() => onViewCustomer(null)} onNavigate={onNavigate} onEdit={profile => setEditing({ id: profile.studio.id, name: profile.name, mobile: profile.mobile, profile })} />
    {editing && <CustomerEdit customer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRevision(value => value + 1); }} />}
  </>;
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
                <button type="button" className="atelier-button-secondary inline-flex items-center gap-1.5 text-xs" aria-label={`مشاهده مشتری ${customer.name}`} onClick={() => onViewCustomer(customer.id)}><Eye className="h-4 w-4" />مشاهده</button>
                <span className="text-[10px] text-zinc-500">
                  جمع {money(customer.total)}
                  <b className="mt-1 block text-red-400">
                    مانده {money(customer.remaining)}
                  </b>
                </span>
                {customer.canEdit && <button
                  aria-label={`ویرایش مشتری ${customer.name}`}
                  onClick={() => setEditing(customer)}
                  className="atelier-icon-button"
                >
                  <Edit3 className="h-4 w-4" />
                </button>}
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
  customer: CustomerEditTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer.name),
    [mobile, setMobile] = useState(customer.mobile),
    [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Record<string, string | boolean | null>>({});
  const profile = customer.profile;
  const studio = profile?.studio;
  const setField = (name: string, value: string | boolean | null) => setChanges(current => ({ ...current, [name]: value }));
  return (
    <AtelierModal title="ویرایش اطلاعات مشتری" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const data = await fetch(`/api/atelier/customers/${customer.id}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ...changes, ...(name !== customer.name ? { name } : {}), ...(mobile !== customer.mobile ? { mobile } : {}) }),
            }).then((r) => r.json());
            if (!data.success)
              throw new Error(data.error || "ویرایش انجام نشد.");
            atelierToast("اطلاعات مشتری ذخیره شد.", "success");
            onSaved();
          } catch (reason) {
            atelierToast(reason instanceof Error ? reason.message : "ویرایش انجام نشد.", "error");
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
        {profile && studio && <>
          <p className="text-xs text-zinc-500">این اطلاعات برای پرونده مشتری و قراردادهای آینده استفاده می‌شود. جزئیات هر قرارداد را از همان قرارداد ویرایش کنید.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["phone", "تلفن دوم", profile.phone, "tel"],
              ["email", "ایمیل", profile.email, "email"],
              ["storeName", "نام مجموعه", profile.storeName, "text"],
              ["city", "شهر", profile.city, "text"],
              ["region", "منطقه", profile.region, "text"],
              ["postalCode", "کد پستی", profile.postalCode, "text"],
              ["latitude", "عرض جغرافیایی", profile.latitude, "text"],
              ["longitude", "طول جغرافیایی", profile.longitude, "text"],
              ["groomName", "نام داماد", studio.groomName, "text"],
              ["brideName", "نام عروس", studio.brideName, "text"],
              ["socialMedia", "شبکه اجتماعی", studio.socialMedia, "text"],
              ["referrer", "منبع آشنایی", studio.referrer, "text"],
            ] as const).map(([key, label, initial, type]) => (
              <label key={key}>
                <span className="atelier-label">{label}</span>
                <input type={type} className="atelier-input w-full py-2.5" value={String(changes[key] ?? initial ?? "")} onChange={event => setField(key, event.target.value)} />
              </label>
            ))}
            <label>
              <span className="atelier-label">نقش مخاطب</span>
              <select className="atelier-input w-full py-2.5" value={String(Object.hasOwn(changes, "contactPersonRole") ? changes.contactPersonRole ?? "" : studio.contactPersonRole ?? "")} onChange={event => setField("contactPersonRole", event.target.value || null)}>
                <option value="">تعیین نشده</option>
                {Object.entries({ groom: "داماد", bride: "عروس", father: "پدر", mother: "مادر", manager: "مدیر", self: "خود مشتری", other: "سایر" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="atelier-label">سطح مشتری</span>
              <select aria-label="سطح مشتری" className="atelier-input w-full py-2.5" value={String(changes.vipLevel ?? studio.vipLevel)} onChange={event => setField("vipLevel", event.target.value)}>
                {Object.entries({ standard: "استاندارد", gold: "طلایی", platinum: "پلاتینیوم", vip: "ویژه" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <JalaliDatePicker label="تاریخ مناسبت" value={Object.hasOwn(changes, "anniversaryDate") ? (changes.anniversaryDate ? new Date(String(changes.anniversaryDate)) : null) : studio.anniversaryDate ? new Date(studio.anniversaryDate) : null} onChange={value => setField("anniversaryDate", value?.toISOString() ?? null)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(changes.socialConsent ?? studio.socialConsent)} onChange={event => setField("socialConsent", event.target.checked)} />
              رضایت انتشار تصاویر
            </label>
            {profile.canEditCredit && ([
              ["paymentTermsDays", "مهلت پرداخت (روز)", profile.paymentTermsDays],
              ["creditLimit", "سقف اعتبار (تومان)", profile.creditLimit],
            ] as const).map(([key, label, initial]) => <label key={key} className="block">
              <span className="atelier-label">{label}</span>
              <input type="number" min="0" className="atelier-input w-full py-2.5" value={String(changes[key] ?? initial ?? "")} onChange={event => setField(key, event.target.value)} />
            </label>)}
          </div>
          {([
            ["address", "آدرس", profile.address],
            ["specialPreferences", "ترجیحات ویژه", studio.specialPreferences],
            ["customerNotes", "یادداشت مشتری", profile.notes],
            ["studioNotes", "یادداشت آتلیه", studio.notes],
          ] as const).map(([key, label, initial]) => (
            <label className="block" key={key}>
              <span className="atelier-label">{label}</span>
              <textarea className="atelier-input w-full py-2.5" rows={2} value={String(changes[key] ?? initial ?? "")} onChange={event => setField(key, event.target.value)} />
            </label>
          ))}
        </>}
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
