"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Database,
  Pencil,
  Plus,
  Save,
  ScrollText,
  Settings2,
} from "lucide-react";
import { AuditLogsView } from "@/components/views/AuditLogsView";
import { BackupView } from "@/components/views/BackupView";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { atelierPrompt, atelierToast } from "@/lib/atelierFeedback";

const TABS = [
  "اطلاعات آتلیه",
  "نوع پروژه",
  "آیتم‌ها",
  "پکیج‌ها",
  "عناوین مراجعات روزانه",
  "تنظیمات قرارداد",
  "تنظیمات تقویم",
  "تنظیمات اعلانات",
  "دسته‌بندی تجهیزات",
  "تنظیمات مالی",
  "مدیریت سیستم",
];
const DEFAULT_CATEGORIES = [
  "دوربین",
  "لنز",
  "نور",
  "فلاش",
  "سه پایه",
  "گیمبال",
  "میکروفون",
  "رکوردر",
  "پهپاد",
  "حافظه",
  "تجهیزات تدوین",
  "سایر",
];
export function FinalSettingsView() {
  const [tab, setTab] = useState(TABS[0]),
    [config, setConfig] = useState<any>({}),
    [types, setTypes] = useState<any[]>([]),
    [catalog, setCatalog] = useState<any[]>([]),
    [dailyVisitTitles, setDailyVisitTitles] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [system, setSystem] = useState<"status" | "backup" | "audit">("status");
  const load = () => {
    setLoading(true);
    fetch("/api/atelier/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success)
          throw new Error(data.error || "دریافت تنظیمات ممکن نشد.");
        setConfig(data.config || {});
        setTypes(data.projectTypes || []);
        setCatalog(data.catalog || []);
        setDailyVisitTitles(data.dailyVisitTitles || []);
        setError("");
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const section = (key: string) => config[key] || {};
  const patch = (key: string, value: Record<string, unknown>) =>
    setConfig((current: any) => ({
      ...current,
      [key]: { ...(current[key] || {}), ...value },
    }));
  const save = async () => {
    setSaving(true);
    try {
      const data = await fetch("/api/atelier/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      }).then((r) => r.json());
      if (!data.success) throw new Error(data.error || "ذخیره انجام نشد.");
      atelierToast("تنظیمات ذخیره شد.", "success");
    } catch (reason) {
      atelierToast(reason instanceof Error ? reason.message : "ذخیره انجام نشد.", "error");
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <LoadingState />;
  if (error) return <ErrorState text={error} retry={load} />;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="atelier-kicker">تنظیمات اختصاصی حکمت آتلیه</p>
          <h1 className="mt-1 text-2xl font-black">تنظیمات</h1>
        </div>
        {!['نوع پروژه','آیتم‌ها','پکیج‌ها','عناوین مراجعات روزانه','مدیریت سیستم'].includes(tab) && (
          <button
            onClick={() => void save()}
            disabled={saving}
            className="atelier-button"
          >
            <Save className="h-4 w-4" />
            {saving ? "در حال ذخیره…" : "ذخیره تنظیمات"}
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold ${tab === item ? "border-red-700 bg-red-950/50 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-500"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <section className="atelier-panel p-4 sm:p-6">
        {tab === "اطلاعات آتلیه" && (
          <Grid>
            <Text
              label="نام آتلیه"
              value={section("identity").name || "حکمت آتلیه"}
              set={(value) => patch("identity", { name: value })}
            />
            <Text
              label="شماره تماس"
              value={section("identity").phone || ""}
              set={(value) => patch("identity", { phone: value })}
            />
            <Text
              label="آدرس"
              value={section("identity").address || ""}
              set={(value) => patch("identity", { address: value })}
            />
            <Text
              label="آدرس لوگو"
              value={section("identity").logoUrl || ""}
              set={(value) => patch("identity", { logoUrl: value })}
            />
            <Area
              label="اطلاعات قابل چاپ در قرارداد"
              value={section("identity").printInfo || ""}
              set={(value) => patch("identity", { printInfo: value })}
            />
          </Grid>
        )}
        {tab === "نوع پروژه" && <ProjectTypes types={types} reload={load} />}
        {tab === "آیتم‌ها" && <CatalogEditor kind="service" rows={catalog.filter((row) => row.kind === "service")} items={[]} reload={load} />}
        {tab === "پکیج‌ها" && <CatalogEditor kind="package" rows={catalog.filter((row) => row.kind === "package")} items={catalog.filter((row) => row.kind === "service" && row.active)} reload={load} />}
        {tab === "عناوین مراجعات روزانه" && <DailyVisitTitleEditor rows={dailyVisitTitles} reload={load} />}
        {tab === "تنظیمات قرارداد" && (
          <Grid>
            <Text
              label="پیشوند شماره قرارداد"
              value={section("contract").numberPrefix || "AT"}
              set={(value) => patch("contract", { numberPrefix: value })}
            />
            <Area
              label="متن و شرایط پیش فرض قرارداد"
              value={section("contract").defaultTerms || ""}
              set={(value) => patch("contract", { defaultTerms: value })}
            />
            <Area
              label="متن امضا و پایین صفحه"
              value={section("contract").footer || ""}
              set={(value) => patch("contract", { footer: value })}
            />
          </Grid>
        )}
        {tab === "تنظیمات تقویم" && (
          <Grid>
            <NumberField
              label="حد سبک (سبز)"
              value={section("calendar").light || 1}
              set={(value) => patch("calendar", { light: value })}
            />
            <NumberField
              label="حد متوسط (نارنجی)"
              value={section("calendar").medium || 2}
              set={(value) => patch("calendar", { medium: value })}
            />
            <NumberField
              label="حد سنگین (قرمز)"
              value={section("calendar").heavy || 3}
              set={(value) => patch("calendar", { heavy: value })}
            />
          </Grid>
        )}
        {tab === "تنظیمات اعلانات" && (
          <Grid>
            <NumberField
              label="یادآوری رزرو (روز قبل)"
              value={section("notifications").reservationDays || 2}
              set={(value) =>
                patch("notifications", { reservationDays: value })
              }
            />
            <NumberField
              label="یادآوری اجرای قرارداد (روز قبل)"
              value={section("notifications").contractDays || 7}
              set={(value) => patch("notifications", { contractDays: value })}
            />
            <NumberField
              label="یادآوری تجهیزات اجاره‌ای (روز قبل)"
              value={section("notifications").rentalDays || 5}
              set={(value) => patch("notifications", { rentalDays: value })}
            />
          </Grid>
        )}
        {tab === "دسته‌بندی تجهیزات" && (
          <ListEditor
            values={section("equipment").categories || DEFAULT_CATEGORIES}
            set={(values) => patch("equipment", { categories: values })}
          />
        )}
        {tab === "تنظیمات مالی" && (
          <Grid>
            <NumberField label="یادآوری مطالبات (روز قبل)" value={section("finance").receivableReminderDays || 3} set={(value) => patch("finance", { receivableReminderDays: value })} />
            <NumberField label="یادآوری بدهی‌ها (روز قبل)" value={section("finance").payableReminderDays || 3} set={(value) => patch("finance", { payableReminderDays: value })} />
            <Area label="دسته‌بندی‌های هزینه (هر مورد در یک خط)" value={(section("finance").expenseCategories || ["پرسنل", "اجاره تجهیزات", "حمل و نقل", "لوکیشن", "چاپ و آلبوم", "تدوین و رتوش", "عمومی"]).join("\n")} set={(value) => patch("finance", { expenseCategories: value.split("\n").map((item) => item.trim()).filter(Boolean) })} />
          </Grid>
        )}
        {tab === "مدیریت سیستم" && (
          <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                onClick={() => setSystem("status")}
                className="atelier-button-secondary"
              >
                <Settings2 className="h-4 w-4" />
                وضعیت فنی
              </button>
              <button
                onClick={() => setSystem("backup")}
                className="atelier-button-secondary"
              >
                <Database className="h-4 w-4" />
                پشتیبان‌گیری
              </button>
              <button
                onClick={() => setSystem("audit")}
                className="atelier-button-secondary"
              >
                <ScrollText className="h-4 w-4" />
                تاریخچه تغییرات
              </button>
            </div>
            {system === "status" ? (
              <SystemStatus />
            ) : system === "backup" ? (
              <BackupView />
            ) : (
              <AuditLogsView
                selectedProjectId={null}
                onNavigate={() => undefined}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectTypes({ types, reload }: { types: any[]; reload: () => void }) {
  const [title, setTitle] = useState("");
  const saveType = async (value: any, id?: string) => {
    const data = await fetch("/api/atelier/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "project_type", id, value }),
    }).then((r) => r.json());
    if (!data.success) return atelierToast(data.error || "ثبت انجام نشد.", "error");
    setTitle("");
    reload();
  };
  const move = async (index: number, direction: -1 | 1) => {
    const target = types[index + direction];
    const current = types[index];
    if (!target) return;
    await Promise.all([
      saveType({
        title: current.title,
        active: current.active,
        sortOrder: target.sortOrder,
        fieldSchema: current.fieldSchema,
      }, current.id),
      saveType({
        title: target.title,
        active: target.active,
        sortOrder: current.sortOrder,
        fieldSchema: target.fieldSchema,
      }, target.id),
    ]);
  };
  return (
    <div className="space-y-3">
      {types.map((type) => (
        <div
          key={type.id}
          className="flex items-center gap-3 rounded-xl border border-zinc-800 p-3"
        >
          <span className="flex-1 text-sm font-bold">{type.title}</span>
          <span className="text-[10px] text-zinc-600">
            ترتیب {Number(type.sortOrder).toLocaleString("fa-IR")}
          </span>
          <button
            type="button"
            disabled={types[0]?.id === type.id}
            onClick={() => void move(types.indexOf(type), -1)}
            className="atelier-icon-button disabled:opacity-30"
            aria-label="انتقال به بالا"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={types.at(-1)?.id === type.id}
            onClick={() => void move(types.indexOf(type), 1)}
            className="atelier-icon-button disabled:opacity-30"
            aria-label="انتقال به پایین"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={async () => {
              const next = await atelierPrompt("عنوان نوع پروژه", type.title);
              if (next?.trim())
                void saveType(
                  {
                    title: next.trim(),
                    active: type.active,
                    sortOrder: type.sortOrder,
                    fieldSchema: type.fieldSchema,
                  },
                  type.id,
                );
            }}
            className="atelier-icon-button"
            aria-label="ویرایش عنوان"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              void saveType(
                {
                  title: type.title,
                  active: !type.active,
                  sortOrder: type.sortOrder,
                  fieldSchema: type.fieldSchema,
                },
                type.id,
              )
            }
            className={`rounded-lg px-3 py-1.5 text-xs ${type.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-900 text-zinc-500"}`}
          >
            {type.active ? "فعال" : "غیرفعال"}
          </button>
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim())
            void saveType({
              title,
              active: true,
              sortOrder: types.length * 10 + 10,
              fieldSchema: [{ key: "subject", label: "موضوع" }],
            });
        }}
        className="flex gap-2 border-t border-zinc-900 pt-4"
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="نوع پروژه جدید"
          className="atelier-input min-w-0 flex-1 py-2.5"
        />
        <button className="atelier-button">
          <Plus className="h-4 w-4" />
          افزودن
        </button>
      </form>
    </div>
  );
}

function CatalogEditor({
  kind,
  rows,
  items,
  reload,
}: {
  kind: "service" | "package";
  rows: any[];
  items: any[];
  reload: () => void;
}) {
  const empty = {
    id: "",
    name: "",
    description: "",
    basePrice: 0,
    active: true,
    sortOrder: rows.length * 10 + 10,
    itemIds: [] as string[],
  };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const edit = (row: any) =>
    setForm({
      id: row.id,
      name: row.name || "",
      description: row.description || "",
      basePrice: Number(row.basePrice || 0),
      active: row.active !== false,
      sortOrder: Number(row.sortOrder || 0),
      itemIds: Array.isArray(row.itemIds)
        ? row.itemIds
        : Array.isArray(row.specifications?.itemIds)
          ? row.specifications.itemIds
          : [],
    });
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data = await fetch("/api/atelier/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "catalog",
          id: form.id || undefined,
          value: {
            kind,
            name: form.name.trim(),
            description: form.description.trim() || null,
            basePrice: kind === "service" ? form.basePrice : 0,
            active: form.active,
            sortOrder: form.sortOrder,
            jobType: "atelier",
            specifications:
              kind === "package" ? { itemIds: form.itemIds } : {},
          },
        }),
      }).then((response) => response.json());
      if (!data.success) throw new Error(data.error || "ذخیره انجام نشد.");
      setForm({ ...empty, sortOrder: rows.length * 10 + 20 });
      reload();
    } catch (reason) {
      atelierToast(reason instanceof Error ? reason.message : "ذخیره انجام نشد.", "error");
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (row: any) => {
    const value = {
      kind,
      name: row.name,
      description: row.description,
      basePrice: Number(row.basePrice || 0),
      active: !row.active,
      sortOrder: Number(row.sortOrder || 0),
      jobType: "atelier",
      specifications: kind === "package" ? { itemIds: row.itemIds || [] } : {},
    };
    const data = await fetch("/api/atelier/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "catalog", id: row.id, value }),
    }).then((response) => response.json());
    if (!data.success) atelierToast(data.error || "تغییر وضعیت انجام نشد.", "error");
    else reload();
  };
  const reorder = async (index: number, direction: -1 | 1) => {
    const current = rows[index];
    const target = rows[index + direction];
    if (!current || !target) return;
    const value = (row: any, sortOrder: number) => ({
      kind,
      name: row.name,
      description: row.description,
      basePrice: Number(row.basePrice || 0),
      active: row.active,
      sortOrder,
      jobType: "atelier",
      specifications: kind === "package" ? { itemIds: row.itemIds || [] } : {},
    });
    const responses = await Promise.all([
      fetch("/api/atelier/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "catalog", id: current.id, value: value(current, Number(target.sortOrder || 0)) }) }).then((response) => response.json()),
      fetch("/api/atelier/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "catalog", id: target.id, value: value(target, Number(current.sortOrder || 0)) }) }).then((response) => response.json()),
    ]);
    if (responses.some((response) => !response.success)) atelierToast("تغییر ترتیب انجام نشد.", "error");
    else reload();
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row, index) => (
          <article key={row.id} className="rounded-2xl border border-zinc-800 bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-zinc-100">{row.name}</h3>
                <p className="mt-1 text-xs text-zinc-500">{row.description || "بدون توضیح"}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] ${row.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-900 text-zinc-500"}`}>
                {row.active ? "فعال" : "غیرفعال"}
              </span>
            </div>
            {kind === "service" ? (
              <p className="mt-4 text-sm font-bold text-red-300">{Number(row.basePrice || 0).toLocaleString("fa-IR")} تومان</p>
            ) : (
              <p className="mt-4 text-xs text-zinc-400">{Number((row.itemIds || row.specifications?.itemIds || []).length).toLocaleString("fa-IR")} آیتم</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => edit(row)} className="atelier-button-secondary"><Pencil className="h-4 w-4" />ویرایش</button>
              <button type="button" onClick={() => void toggle(row)} className="atelier-button-secondary">{row.active ? "غیرفعال کردن" : "فعال کردن"}</button>
              <button type="button" disabled={index === 0} onClick={() => void reorder(index, -1)} className="atelier-button-secondary disabled:opacity-30"><ArrowUp className="h-4 w-4" />بالاتر</button>
              <button type="button" disabled={index === rows.length - 1} onClick={() => void reorder(index, 1)} className="atelier-button-secondary disabled:opacity-30"><ArrowDown className="h-4 w-4" />پایین‌تر</button>
            </div>
          </article>
        ))}
      </div>
      {!rows.length && <EmptyState text={kind === "service" ? "هنوز آیتمی تعریف نشده است." : "هنوز پکیجی تعریف نشده است."} />}
      <form onSubmit={save} className="rounded-2xl border border-red-950/70 bg-red-950/10 p-4">
        <h3 className="mb-4 font-black">{form.id ? "ویرایش" : "افزودن"} {kind === "service" ? "آیتم" : "پکیج"}</h3>
        <Grid>
          <Text label="عنوان" value={form.name} set={(name) => setForm((current) => ({ ...current, name }))} />
          <NumberField label="ترتیب نمایش" value={form.sortOrder || 1} set={(sortOrder) => setForm((current) => ({ ...current, sortOrder }))} />
          <Area label="توضیحات" value={form.description} set={(description) => setForm((current) => ({ ...current, description }))} />
          {kind === "service" && (
            <label className="sm:col-span-2">
              <span className="atelier-label">قیمت پیش‌فرض</span>
              <MoneyInput value={form.basePrice} onChange={(basePrice) => setForm((current) => ({ ...current, basePrice }))} unit="تومان" className="!rounded-xl !border-zinc-800 !bg-black" />
            </label>
          )}
          {kind === "package" && (
            <fieldset className="sm:col-span-2">
              <legend className="atelier-label">آیتم‌های پکیج</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-800 bg-black/30 p-3 text-sm">
                    <input type="checkbox" checked={form.itemIds.includes(item.id)} onChange={(event) => setForm((current) => ({ ...current, itemIds: event.target.checked ? [...current.itemIds, item.id] : current.itemIds.filter((id) => id !== item.id) }))} />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </Grid>
        <div className="mt-4 flex gap-2">
          <button disabled={saving || !form.name.trim()} className="atelier-button">{saving ? "در حال ذخیره…" : "ذخیره"}</button>
          {form.id && <button type="button" onClick={() => setForm(empty)} className="atelier-button-secondary">انصراف</button>}
        </div>
      </form>
    </div>
  );
}

function DailyVisitTitleEditor({ rows, reload }: { rows: any[]; reload: () => void }) {
  const [title, setTitle] = useState("");
  const save = async (value: any, id?: string) => {
    const data = await fetch("/api/atelier/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "daily_visit_title", id, value }),
    }).then((response) => response.json());
    if (!data.success) return atelierToast(data.error || "ثبت انجام نشد.", "error");
    setTitle("");
    reload();
  };
  const move = async (index: number, direction: -1 | 1) => {
    const current = rows[index], target = rows[index + direction];
    if (!current || !target) return;
    await Promise.all([
      save({ title: current.title, active: current.active, sortOrder: target.sortOrder }, current.id),
      save({ title: target.title, active: target.active, sortOrder: current.sortOrder }, target.id),
    ]);
  };
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 p-3">
          <span className="flex-1 text-sm font-bold">{row.title}</span>
          <button type="button" disabled={index === 0} onClick={() => void move(index, -1)} className="atelier-icon-button disabled:opacity-30" aria-label="انتقال به بالا"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" disabled={index === rows.length - 1} onClick={() => void move(index, 1)} className="atelier-icon-button disabled:opacity-30" aria-label="انتقال به پایین"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" onClick={async () => { const next = await atelierPrompt("عنوان مراجعه روزانه", row.title); if (next?.trim()) void save({ title: next.trim(), active: row.active, sortOrder: row.sortOrder }, row.id); }} className="atelier-icon-button" aria-label="ویرایش"><Pencil className="h-4 w-4" /></button>
          <button type="button" onClick={() => void save({ title: row.title, active: !row.active, sortOrder: row.sortOrder }, row.id)} className={`rounded-lg px-3 py-1.5 text-xs ${row.active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-900 text-zinc-500"}`}>{row.active ? "فعال" : "غیرفعال"}</button>
        </div>
      ))}
      <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) void save({ title: title.trim(), active: true, sortOrder: rows.length * 10 + 10 }); }} className="flex gap-2 border-t border-zinc-900 pt-4">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="عنوان مراجعه جدید" className="atelier-input min-w-0 flex-1 py-2.5" />
        <button className="atelier-button"><Plus className="h-4 w-4" />افزودن</button>
      </form>
    </div>
  );
}
function ListEditor({
  values,
  set,
}: {
  values: string[];
  set: (values: string[]) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {values.map((item) => (
          <button
            key={item}
            onClick={() => set(values.filter((value) => value !== item))}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300"
            title="برای حذف کلیک کنید"
          >
            {item} ×
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim() && !values.includes(value.trim()))
            set([...values, value.trim()]);
          setValue("");
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="atelier-input min-w-0 flex-1 py-2.5"
          placeholder="عنوان جدید"
        />
        <button className="atelier-button">افزودن</button>
      </form>
    </div>
  );
}
function SystemStatus() {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    fetch("/api/readiness")
      .then((r) => r.json())
      .then(setStatus);
  }, []);
  if (!status) return <LoadingState />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["وضعیت", status.status],
        ["محیط", status.environment],
        ["نسخه دیتابیس", status.schemaVersion],
        ["نسخه اجرا", status.gitSha],
      ].map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-500"
        >
          {label}
          <b className="mt-2 block break-all text-zinc-200">{value || "—"}</b>
        </div>
      ))}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
function Text({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
}) {
  return (
    <label>
      <span className="atelier-label">{label}</span>
      <input
        value={value}
        onChange={(event) => set(event.target.value)}
        className="atelier-input w-full py-2.5"
      />
    </label>
  );
}
function Area({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
}) {
  return (
    <label className="sm:col-span-2">
      <span className="atelier-label">{label}</span>
      <textarea
        value={value}
        onChange={(event) => set(event.target.value)}
        className="atelier-input min-h-28 w-full py-3"
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  set,
}: {
  label: string;
  value: number;
  set: (value: number) => void;
}) {
  return (
    <label>
      <span className="atelier-label">{label}</span>
      <input
        type="number"
        min="1"
        value={value}
        onChange={(event) => set(Number(event.target.value))}
        className="atelier-input w-full py-2.5"
      />
    </label>
  );
}
