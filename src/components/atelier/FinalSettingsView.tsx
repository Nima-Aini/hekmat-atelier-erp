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

const TABS = [
  "اطلاعات آتلیه",
  "نوع پروژه",
  "تنظیمات قرارداد",
  "تنظیمات تقویم",
  "تنظیمات اعلانات",
  "دسته‌بندی تجهیزات",
  "دستمزد",
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
const DEFAULT_WAGES = [
  "عکاسی",
  "فیلمبرداری",
  "دستیار",
  "پهپاد",
  "نورپردازی",
  "رتوش",
  "تدوین",
  "طراحی آلبوم",
  "سایر",
];

export function FinalSettingsView() {
  const [tab, setTab] = useState(TABS[0]),
    [config, setConfig] = useState<any>({}),
    [types, setTypes] = useState<any[]>([]),
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
      window.alert("تنظیمات ذخیره شد.");
    } catch (reason) {
      window.alert(
        reason instanceof Error ? reason.message : "ذخیره انجام نشد.",
      );
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
        {tab !== "نوع پروژه" && tab !== "مدیریت سیستم" && (
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
        {tab === "دستمزد" && (
          <>
            <p className="mb-4 text-xs leading-6 text-zinc-500">
              عنوان‌های پیشنهادی دستمزد در پرونده پرسنل استفاده می‌شوند. مبلغ هر
              شخص در صفحه پرسنل ثبت و هنگام برنامه ریزی به‌صورت snapshot ذخیره
              می‌شود.
            </p>
            <ListEditor
              values={section("wages").titles || DEFAULT_WAGES}
              set={(values) => patch("wages", { titles: values })}
            />
          </>
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
    if (!data.success) return window.alert(data.error || "ثبت انجام نشد.");
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
            onClick={() => {
              const next = window.prompt("عنوان نوع پروژه", type.title);
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
