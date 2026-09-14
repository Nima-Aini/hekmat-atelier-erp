"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Camera,
  Edit3,
  Plus,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { AtelierModal } from "./AtelierModal";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";

const ROLES: Record<string, string> = {
  photographer: "عکاسی",
  videographer: "فیلمبرداری",
  assistant: "دستیار",
  drone_operator: "پهپاد",
  lighting_tech: "نورپردازی",
  retoucher: "رتوش",
  editor: "تدوین",
  director: "مدیریت اجرا",
  sound_engineer: "صدا",
  other: "سایر",
};
const TYPES: Record<string, string> = {
  employee: "ثابت",
  temporary_worker: "موقت",
  project_based: "پروژه‌ای",
};
const CATEGORIES: Record<string, string> = {
  camera: "دوربین",
  lens: "لنز",
  light: "نور",
  lighting: "فلاش",
  tripod_support: "سه پایه",
  gimbal_stabilizer: "گیمبال",
  sound_mic: "میکروفون",
  audio: "رکوردر",
  drone: "پهپاد",
  battery_power: "حافظه / باتری",
  studio: "تجهیزات تدوین",
  accessory: "لوازم جانبی",
  general: "سایر",
};
const STATUS: Record<string, string> = {
  healthy: "آماده",
  needs_service: "تعمیر",
  damaged: "خراب",
  retired: "خارج از سرویس",
  in_studio: "آماده",
  reserved: "رزرو شده",
  on_set: "در حال استفاده",
  maintenance: "تعمیر",
};

export function PersonnelView() {
  const [rows, setRows] = useState<any[]>([]),
    [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<any | "new" | null>(null),
    [wagePerson, setWagePerson] = useState<any>(null);
  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/studio/personnel?pageSize=100").then((r) => r.json()),
      fetch("/api/atelier/planning").then((r) => r.json()),
    ])
      .then(([data, planningData]) => {
        if (!data.success)
          throw new Error(data.error || "دریافت پرسنل ممکن نشد.");
        setRows(data.personnel || []);
        const counts: Record<string, number> = {};
        for (const contract of planningData.planning?.contracts || [])
          for (const item of contract.items || [])
            for (const assignment of item.personnelAssignments || [])
              counts[assignment.personnelId] =
                (counts[assignment.personnelId] || 0) + 1;
        setAssignmentCounts(counts);
        setError("");
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        `${row.fullName} ${row.mobile} ${ROLES[row.primaryRole] || row.primaryRole}`.includes(
          query,
        ),
      ),
    [rows, query],
  );
  return (
    <div className="space-y-5">
      <Header
        kicker="افراد قابل انتخاب در برنامه ریزی"
        title="پرسنل"
        description="پرسنل ثابت، موقت و پروژه‌ای با تخصص و دستمزد پیش‌فرض"
        action="پرسنل جدید"
        onAdd={() => setEditing("new")}
      />
      <SearchBox
        value={query}
        set={setQuery}
        placeholder="جستجوی نام، تماس یا تخصص"
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState text={error} retry={load} />
      ) : !filtered.length ? (
        <EmptyState text="پرسنلی ثبت نشده است." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((person) => (
            <article key={person.id} className="atelier-panel p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-950 bg-red-950/20">
                  <UserRound className="h-5 w-5 text-red-400" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-black">{person.fullName}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {TYPES[person.personnelType] || "پروژه‌ای"} •{" "}
                    {ROLES[person.primaryRole] || person.primaryRole}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600" dir="ltr">
                    {person.mobile}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] ${person.status === "active" ? "bg-emerald-950 text-emerald-400" : "bg-zinc-900 text-zinc-500"}`}
                >
                  {person.status === "active" ? "فعال" : "غیرفعال"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-1">
                {(person.skills || []).map((skill: any) => (
                  <span
                    key={skill.id}
                    className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-400"
                  >
                    {skill.skillTitle}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                برنامه‌های فعال و پیش رو: {Number(assignmentCounts[person.id] || 0).toLocaleString("fa-IR")}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setEditing(person)}
                  className="atelier-button-secondary flex-1"
                >
                  <Edit3 className="h-4 w-4" />
                  ویرایش
                </button>
                <button
                  onClick={() => setWagePerson(person)}
                  className="atelier-button flex-1"
                >
                  <WalletCards className="h-4 w-4" />
                  دستمزدها
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <PersonnelForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}{" "}
      {wagePerson && (
        <WageForm person={wagePerson} onClose={() => setWagePerson(null)} />
      )}
    </div>
  );
}

export function EquipmentView() {
  const [rows, setRows] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<any | "new" | null>(null),
    [usageItem, setUsageItem] = useState<any | null>(null),
    [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/studio/equipment?pageSize=100").then((r) => r.json()),
      fetch("/api/atelier/settings").then((r) => r.json()),
    ])
      .then(([data, settings]) => {
        if (!data.success) throw new Error(data.error || "دریافت تجهیزات ممکن نشد.");
        setRows(data.equipment || []);
        setConfiguredCategories(settings.config?.equipment?.categories || []);
        setError("");
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        `${row.title} ${row.code} ${row.serialNumber || ""}`.includes(query),
      ),
    [rows, query],
  );
  return (
    <div className="space-y-5">
      <Header
        kicker="دارایی‌های قابل تخصیص در برنامه ریزی"
        title="تجهیزات"
        description="فهرست تجهیزات آتلیه، وضعیت و آمادگی استفاده"
        action="تجهیزات جدید"
        onAdd={() => setEditing("new")}
      />
      <SearchBox
        value={query}
        set={setQuery}
        placeholder="جستجوی نام، کد یا شماره سریال"
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState text={error} retry={load} />
      ) : !filtered.length ? (
        <EmptyState text="تجهیزاتی ثبت نشده است." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((item) => (
            <article key={item.id} className="atelier-panel p-4">
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-950 bg-red-950/20">
                  <Camera className="h-5 w-5 text-red-400" />
                </span>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] ${item.currentHealthStatus === "healthy" && item.locationType === "in_studio" ? "bg-emerald-950 text-emerald-400" : item.currentHealthStatus === "damaged" ? "bg-red-950 text-red-400" : "bg-orange-950 text-orange-400"}`}
                >
                  {STATUS[item.currentHealthStatus] ||
                    STATUS[item.locationType] ||
                    "نامشخص"}
                </span>
              </div>
              <h2 className="mt-4 font-black">{item.title}</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {CATEGORIES[item.category] || item.category} • {item.code}
              </p>
              <p className="mt-1 truncate text-[10px] text-zinc-600">
                سریال: {item.serialNumber || "—"}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEditing(item)}
                  className="atelier-button-secondary"
                >
                  <Edit3 className="h-4 w-4" />
                  ویرایش
                </button>
                <button
                  onClick={async () => {
                    const data = await fetch(`/api/studio/equipment/${item.id}`).then((response) => response.json());
                    if (data.success) setUsageItem(data.equipment);
                    else window.alert(data.error || "دریافت برنامه استفاده ممکن نشد.");
                  }}
                  className="atelier-button-secondary"
                >
                  <CalendarDays className="h-4 w-4" />
                  برنامه استفاده
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <EquipmentForm
          initial={editing === "new" ? null : editing}
          categories={configuredCategories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {usageItem && (
        <EquipmentUsage equipment={usageItem} onClose={() => setUsageItem(null)} />
      )}
    </div>
  );
}

function EquipmentUsage({ equipment, onClose }: { equipment: any; onClose: () => void }) {
  return (
    <AtelierModal title={`برنامه استفاده ${equipment.title}`} onClose={onClose}>
      <div className="space-y-3">
        {!equipment.reservations?.length ? (
          <EmptyState text="هنوز استفاده‌ای برای این تجهیزات ثبت نشده است." />
        ) : (
          equipment.reservations.map((reservation: any) => (
            <article key={reservation.id} className="rounded-xl border border-zinc-800 bg-black/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">{reservation.projectTitle || "برنامه آتلیه"}</h3>
                  <p className="mt-1 text-xs text-zinc-500">{reservation.personnelName || "بدون پرسنل مستقیم"}</p>
                </div>
                <span className="rounded-full bg-red-950/40 px-2 py-1 text-[10px] text-red-300">
                  {reservation.status === "reserved" ? "رزرو شده" : reservation.status === "checked_out" ? "در حال استفاده" : "بازگردانده شده"}
                </span>
              </div>
              <p className="mt-3 text-xs text-zinc-400">
                {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(reservation.reservedFrom))}
                {" تا "}
                {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(reservation.reservedTo))}
              </p>
            </article>
          ))
        )}
      </div>
    </AtelierModal>
  );
}

function Header({
  kicker,
  title,
  description,
  action,
  onAdd,
}: {
  kicker: string;
  title: string;
  description: string;
  action: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="atelier-kicker">{kicker}</p>
        <h1 className="mt-1 text-2xl font-black">{title}</h1>
        <p className="mt-2 text-xs text-zinc-500">{description}</p>
      </div>
      <button onClick={onAdd} className="atelier-button">
        <Plus className="h-4 w-4" />
        {action}
      </button>
    </div>
  );
}
function SearchBox({
  value,
  set,
  placeholder,
}: {
  value: string;
  set: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="atelier-panel relative block p-3">
      <Search className="absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
      <input
        value={value}
        onChange={(event) => set(event.target.value)}
        placeholder={placeholder}
        className="atelier-input w-full py-2.5 pr-9"
      />
    </label>
  );
}

function PersonnelForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
      fullName: initial?.fullName || "",
      mobile: initial?.mobile || "",
      personnelType: initial?.personnelType || "employee",
      primaryRole: initial?.primaryRole || "photographer",
      status: initial?.status || "active",
      notes: initial?.notes || "",
    }),
    [skills, setSkills] = useState<string>(
      initial?.skills?.map((skill: any) => skill.skillTitle).join("، ") || "",
    ),
    [saving, setSaving] = useState(false);
  const change = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <AtelierModal
      title={initial ? "ویرایش پرسنل" : "پرسنل جدید"}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const body = {
              ...form,
              skills: initial
                ? undefined
                : skills
                    .split(/[،,]/)
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .map((skillTitle) => ({
                      skillTitle,
                      skillCategory: "general",
                    })),
            };
            const data = await fetch(
              initial
                ? `/api/studio/personnel/${initial.id}`
                : "/api/studio/personnel",
              {
                method: initial ? "PUT" : "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              },
            ).then((r) => r.json());
            if (!data.success)
              throw new Error(data.error || "ذخیره انجام نشد.");
            onSaved();
          } catch (reason) {
            window.alert(
              reason instanceof Error ? reason.message : "ذخیره انجام نشد.",
            );
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-4"
      >
        <Text
          label="نام و نام خانوادگی"
          value={form.fullName}
          set={(v) => change("fullName", v)}
          required
        />
        <Text
          label="شماره تماس"
          value={form.mobile}
          set={(v) => change("mobile", v)}
          required
          dir="ltr"
        />
        <Select
          label="نوع همکاری"
          value={form.personnelType}
          set={(v) => change("personnelType", v)}
          options={{ employee: "ثابت", temporary_worker: "موقت" }}
        />
        <Select
          label="تخصص اصلی"
          value={form.primaryRole}
          set={(v) => change("primaryRole", v)}
          options={ROLES}
        />
        <Select
          label="وضعیت"
          value={form.status}
          set={(v) => change("status", v)}
          options={{ active: "فعال", on_leave: "مرخصی", inactive: "غیرفعال" }}
        />
        {!initial && (
          <Text
            label="مهارت‌ها (با ویرگول جدا کنید)"
            value={skills}
            set={setSkills}
          />
        )}
        <Text
          label="توضیحات"
          value={form.notes}
          set={(v) => change("notes", v)}
        />
        <Actions saving={saving} onClose={onClose} />
      </form>
    </AtelierModal>
  );
}

function WageForm({ person, onClose }: { person: any; onClose: () => void }) {
  const [wages, setWages] = useState<any[]>([]),
    [workTitle, setWorkTitle] = useState("عکاسی"),
    [amount, setAmount] = useState(0);
  const load = useCallback(() =>
    fetch(`/api/atelier/personnel/${person.id}/default-wages`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setWages(data.wages || []);
      }), [person.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AtelierModal
      title={`دستمزدهای پیش فرض ${person.fullName}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {wages.map((row) => (
            <div
              key={row.id}
              className="flex justify-between rounded-xl border border-zinc-800 p-3 text-sm"
            >
              <span>{row.workTitle}</span>
              <b>{Number(row.amount).toLocaleString("fa-IR")} تومان</b>
            </div>
          ))}
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const data = await fetch(
              `/api/atelier/personnel/${person.id}/default-wages`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workTitle, amount }),
              },
            ).then((r) => r.json());
            if (!data.success) return window.alert(data.error || "ثبت نشد.");
            setAmount(0);
            load();
          }}
          className="grid gap-3 border-t border-zinc-900 pt-4 sm:grid-cols-2"
        >
          <Text
            label="عنوان فعالیت"
            value={workTitle}
            set={setWorkTitle}
            required
          />
          <div>
            <label className="atelier-label">دستمزد</label>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              unit="تومان"
              className="!rounded-xl !border-zinc-800 !bg-black"
            />
          </div>
          <button className="atelier-button sm:col-span-2">
            ثبت دستمزد پیش فرض
          </button>
        </form>
      </div>
    </AtelierModal>
  );
}

function EquipmentForm({
  initial,
  categories,
  onClose,
  onSaved,
}: {
  initial: any;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
      title: initial?.title || "",
      category: initial?.category || categories[0] || "camera",
      code: initial?.code || "",
      serialNumber: initial?.serialNumber || "",
      currentHealthStatus: initial?.currentHealthStatus || "healthy",
      locationType: initial?.locationType || "in_studio",
      notes: initial?.notes || "",
    }),
    [saving, setSaving] = useState(false);
  const change = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <AtelierModal
      title={initial ? "ویرایش تجهیزات" : "تجهیزات جدید"}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const data = await fetch(
              initial
                ? `/api/studio/equipment/${initial.id}`
                : "/api/studio/equipment",
              {
                method: initial ? "PUT" : "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(form),
              },
            ).then((r) => r.json());
            if (!data.success)
              throw new Error(data.error || "ذخیره انجام نشد.");
            onSaved();
          } catch (reason) {
            window.alert(
              reason instanceof Error ? reason.message : "ذخیره انجام نشد.",
            );
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-4"
      >
        <Text
          label="نام تجهیزات"
          value={form.title}
          set={(v) => change("title", v)}
          required
        />
        <Select
          label="دسته‌بندی"
          value={form.category}
          set={(v) => change("category", v)}
          options={categories.length ? Object.fromEntries(categories.map((category) => [category, category])) : CATEGORIES}
        />
        {!initial && (
          <Text
            label="کد (اختیاری)"
            value={form.code}
            set={(v) => change("code", v)}
          />
        )}
        <Text
          label="شماره سریال"
          value={form.serialNumber}
          set={(v) => change("serialNumber", v)}
        />
        <Select
          label="وضعیت فنی"
          value={form.currentHealthStatus}
          set={(v) => change("currentHealthStatus", v)}
          options={{
            healthy: "آماده",
            needs_service: "تعمیر",
            damaged: "خراب",
            retired: "خارج از سرویس",
          }}
        />
        <Select
          label="وضعیت استفاده"
          value={form.locationType}
          set={(v) => change("locationType", v)}
          options={{
            in_studio: "آماده",
            reserved: "رزرو شده",
            on_set: "در حال استفاده",
            maintenance: "تعمیر",
          }}
        />
        <Text
          label="توضیحات"
          value={form.notes}
          set={(v) => change("notes", v)}
        />
        <Actions saving={saving} onClose={onClose} />
      </form>
    </AtelierModal>
  );
}

function Text({
  label,
  value,
  set,
  required,
  dir,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
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
        required={required}
        value={value}
        onChange={(event) => set(event.target.value)}
        dir={dir}
        className="atelier-input w-full py-2.5"
      />
    </label>
  );
}
function Select({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  options: Record<string, string>;
}) {
  return (
    <label>
      <span className="atelier-label">{label}</span>
      <select
        value={value}
        onChange={(event) => set(event.target.value)}
        className="atelier-input w-full py-2.5"
      >
        {Object.entries(options).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Actions({
  saving,
  onClose,
}: {
  saving: boolean;
  onClose: () => void;
}) {
  return (
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
  );
}
