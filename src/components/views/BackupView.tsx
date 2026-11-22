"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Database, Download, ShieldCheck, Upload } from "lucide-react";
import { toJalaliDate } from "@/lib/dateUtils";

type Backup = {
  id: string;
  filename: string;
  status: string;
  sizeBytes: number;
  sizeBytesBigint?: number | null;
  schemaVersion?: string | null;
  createdAt: string;
  verifiedAt?: string | null;
};
type Validation = {
  backupValid: boolean;
  checksumValid: boolean;
  readable: boolean;
  formatSupported: boolean;
  metadataValid: boolean;
  backupSchemaVersion: string;
  currentSupportedSchemaVersion: string;
  warnings: string[];
};
type History = { id: string; action: string; user_name: string; created_at: string; safety_backup_id: string | null };
type Availability = { isolated: boolean; activation: boolean };
type Result = { message: string; safetyBackupId?: string; signedOut?: boolean };

const historyLabels: Record<string, string> = {
  RESTORE_STARTED: "بازیابی آغاز شد",
  RESTORE_SAFETY_BACKUP_READY: "نسخه ایمنی آماده شد",
  RESTORE_TARGET_VERIFIED: "بازیابی آزمایشی تأیید شد",
  RESTORE_FAILED: "بازیابی آزمایشی ناموفق بود",
  RESTORE_ACTIVATED: "نسخه بازیابی‌شده فعال شد",
  RESTORE_ACTIVATION_REVERTED: "انتقال لغو شد",
  RESTORE_ACTIVATION_ROLLED_BACK: "بازگشت به نسخه قبلی تأیید شد",
};
const backupLabels: Record<string, string> = {
  verified: "یکپارچگی تأیید شده",
  failed: "ناموفق",
  uploaded: "فایل بارگذاری شده",
  pending: "در انتظار بررسی",
  completed: "آماده دریافت",
};
const stamp = (value: string) => toJalaliDate(value, { showTime: true });
const archiveLimit = 128 * 1024 * 1024;
const sizeLabel = (backup: Backup) => `${(Number(backup.sizeBytesBigint ?? backup.sizeBytes) / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} مگابایت`;

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || "عملیات ناموفق بود.");
  return body;
}
const post = (url: string, body: unknown = {}) => request(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function BackupView() {
  const [availability, setAvailability] = useState<Availability>({ isolated: false, activation: false });
  const [items, setItems] = useState<Backup[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [selected, setSelected] = useState<Backup | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [mode, setMode] = useState<"test" | "activate">("test");
  const [confirmation, setConfirmation] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    const [backups, operations] = await Promise.all([request("/api/backups"), request("/api/backups/history")]);
    setAvailability({ isolated: backups.isolatedRestoreAvailable === true, activation: backups.activationAvailable === true });
    setItems(backups.backups || []);
    setHistory(operations.history || []);
  }, []);
  useEffect(() => { void load().catch(reason => setError(reason.message)); }, [load]);

  const busy = Boolean(progress);
  const latest = items.find(backup => backup.status === "verified" && !backup.filename.startsWith("uploaded-"));
  const modeReady = mode === "activate" ? availability.activation : availability.isolated;
  const selecting = (backup: Backup | null) => {
    setSelected(backup);
    setValidation(null);
    setConfirmation("");
    setMode("test");
    setResult(null);
    setError("");
  };
  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    selecting(null);
    setFile(null);
    if (!/\.dump$/i.test(nextFile.name) || nextFile.size === 0 || nextFile.size > archiveLimit) {
      setError("یک فایل .dump غیرخالی و حداکثر ۱۲۸ مگابایتی انتخاب کنید.");
      return;
    }
    setFile(nextFile);
  };
  const run = async (message: string, action: () => Promise<void>) => {
    if (busy) return;
    setProgress(message);
    setError("");
    setResult(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "عملیات ناموفق بود.");
    } finally {
      setProgress("");
    }
  };
  const upload = () => {
    if (!file) return;
    void run("در حال بارگذاری و بررسی اولیه فایل…", async () => {
      const body = await request("/api/backups/upload", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      selecting(body.backup);
      setFile(null);
      await load();
    });
  };
  const validate = () => {
    if (!selected) return;
    void run("در حال بررسی یکپارچگی و سازگاری آرشیو…", async () => {
      setValidation(null);
      setConfirmation("");
      const body = await post(`/api/backups/${selected.id}/restore/validate`);
      setValidation(body.validation);
    });
  };
  const restore = () => {
    if (!selected || !validation?.backupValid || !modeReady || confirmation !== "RESTORE") return;
    void run("در حال ایجاد نسخه ایمنی و بازیابی اطلاعات…", async () => {
      const body = await post(`/api/backups/${selected.id}/restore`, { confirmation, activate: mode === "activate" });
      if (!body.result?.targetVerified || (mode === "activate" && !body.result.switched)) throw new Error("سرور نتیجه موفق بازیابی را تأیید نکرد.");
      selecting(null);
      setResult({
        message: body.result.switched ? "نسخه بازیابی‌شده فعال شد. لطفاً دوباره وارد سامانه شوید." : "بازیابی آزمایشی تأیید شد. سامانه فعال بدون تغییر به کار ادامه می‌دهد.",
        safetyBackupId: body.result.safetyBackupId,
        signedOut: body.result.switched,
      });
      if (!body.result.switched) await load();
    });
  };

  return <div className="space-y-5">
    <h2 className="flex items-center gap-2 text-xl font-bold"><Database className="h-5 w-5" />پشتیبان‌گیری و بازیابی اطلاعات</h2>
    {progress && <p role="status" className="atelier-panel p-3 text-sm">{progress}</p>}
    {error && <p role="alert" className="atelier-panel p-3 text-sm text-red-400">{error}</p>}
    {result && <div role="status" className="atelier-panel space-y-2 p-3 text-sm">
      <p>{result.message}</p>
      {result.safetyBackupId && !result.signedOut && <a className="underline" href={`/api/backups/${result.safetyBackupId}/download`}>دریافت نسخه ایمنی</a>}
      {result.signedOut && <Link className="atelier-button-secondary" href="/employee-login">ورود دوباره</Link>}
    </div>}

    <section className="atelier-panel space-y-4 p-4" aria-labelledby="create-backup">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="create-backup" className="font-bold">ایجاد و دریافت نسخه پشتیبان</h3>
          <p className="mt-1 text-xs text-zinc-400">آخرین نسخه تأییدشده {latest ? stamp(latest.createdAt) : "هنوز ثبت نشده است."}</p></div>
        <button type="button" disabled={busy} className="atelier-button" onClick={() => void run("در حال تهیه نسخه پشتیبان…", async () => {
          await post("/api/backups");
          await load();
          setResult({ message: "نسخه پشتیبان آماده دریافت است." });
        })}>ایجاد نسخه پشتیبان جدید</button>
      </div>
      {latest && <a className="atelier-button-secondary" href={`/api/backups/${latest.id}/download`}><Download className="h-4 w-4" />دریافت آخرین نسخه</a>}
    </section>

    <section className="atelier-panel space-y-4 p-4" aria-labelledby="restore-backup">
      <h3 id="restore-backup" className="font-bold">بازیابی از فایل</h3>
      <p className="text-sm text-zinc-400">آرشیو .dump شامل داده‌های دیتابیس است. تصاویر و پیوست‌های ذخیره‌شده خارج از دیتابیس باید جداگانه بازیابی شوند.</p>
      <div className="space-y-2 rounded-xl border border-dashed p-4" onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault();
        if (!busy) chooseFile(event.dataTransfer.files[0]);
      }}>
        <label className="block">
          <span className="atelier-label">انتخاب فایل .dump تا ۱۲۸ مگابایت</span>
          <input type="file" accept=".dump" disabled={busy} onChange={event => {
            chooseFile(event.target.files?.[0]);
            event.target.value = "";
          }} />
        </label>
        {file && <div className="flex flex-wrap items-center gap-3">
          <b className="break-all text-sm" dir="ltr">{file.name}</b>
          <button type="button" disabled={busy} onClick={upload} className="atelier-button-secondary"><Upload className="h-4 w-4" />بارگذاری فایل</button>
        </div>}
      </div>

      {selected && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h4 className="font-bold">بررسی نسخه انتخاب‌شده</h4><p className="break-all text-xs text-zinc-400" dir="ltr">{selected.filename}</p></div>
          <button type="button" disabled={busy} className="atelier-button-secondary" onClick={validate}><ShieldCheck className="h-4 w-4" />بررسی فایل</button>
        </div>
        <p className="text-xs text-zinc-400">{selected.filename.startsWith("uploaded-") ? "زمان بارگذاری" : "زمان تهیه"} {stamp(selected.createdAt)} · {sizeLabel(selected)}</p>
        {validation && <div className="overview-secondary-surface space-y-2 rounded-xl border p-3 text-sm">
          <strong>{validation.backupValid ? "فایل معتبر و سازگار است" : "فایل برای بازیابی معتبر نیست"}</strong>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>قالب و خوانایی {validation.formatSupported && validation.readable ? "تأیید شد" : "تأیید نشد"}</li>
            <li>یکپارچگی {validation.checksumValid ? "تأیید شد" : "تأیید نشد"}</li>
            <li>اطلاعات همراه فایل {validation.metadataValid ? "معتبر" : "نامعتبر"}</li>
            <li>نسخه ساختار دیتابیس <span dir="ltr">{validation.backupSchemaVersion}</span></li>
          </ul>
          {!validation.backupValid && <p>نسخه ساختار پشتیبانی‌شده <span dir="ltr">{validation.currentSupportedSchemaVersion}</span></p>}
          {validation.warnings.some(warning => /storage/i.test(warning)) && <p>فضای آزاد سرور را پیش از بازیابی بررسی کنید.</p>}
        </div>}
        {validation?.backupValid && <div className="space-y-3 rounded-xl border p-4">
          <h4 className="font-bold">پیش‌نمایش و تأیید بازیابی</h4>
          <fieldset disabled={busy} className="grid gap-2 text-sm">
            <legend className="mb-2 font-medium">روش بازیابی</legend>
            <label className="flex gap-2"><input type="radio" name="restore-mode" checked={mode === "test"} disabled={!availability.isolated} onChange={() => { setMode("test"); setConfirmation(""); }} />بازیابی آزمایشی در دیتابیس مجزا</label>
            {!availability.isolated && <p className="text-xs text-zinc-400">دیتابیس مجزای آزمایش در تنظیمات سرور آماده نشده است.</p>}
            <label className="flex gap-2"><input type="radio" name="restore-mode" checked={mode === "activate"} disabled={!availability.activation} onChange={() => { setMode("activate"); setConfirmation(""); }} />جایگزینی اطلاعات سامانه</label>
            {!availability.activation && <p className="text-xs text-zinc-400">فعال‌سازی به تنظیمات دیتابیس و مجوزهای سرور نیاز دارد.</p>}
          </fieldset>
          <p className="text-sm leading-6">{mode === "activate"
            ? "قبل از جایگزینی، نسخه ایمنی تازه بررسی می‌شود. دیتابیس قبلی حفظ می‌شود و همه کاربران دوباره وارد سامانه می‌شوند."
            : "نسخه ایمنی تهیه و بررسی می‌شود. فایل روی دیتابیس مجزا بازیابی می‌شود و اطلاعات سامانه فعال حفظ می‌شود."}</p>
          {modeReady && <label className="block">
            <span className="atelier-label">برای تأیید عبارت RESTORE را وارد کنید.</span>
            <input dir="ltr" disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="atelier-input w-full p-2.5" />
          </label>}
          <button type="button" disabled={busy || !modeReady || confirmation !== "RESTORE"} className="atelier-button" onClick={restore}>{mode === "activate" ? "تأیید جایگزینی اطلاعات سامانه" : "شروع بازیابی آزمایشی"}</button>
        </div>}
      </div>}
    </section>

    <section className="atelier-panel space-y-3 p-4" aria-labelledby="backup-history">
      <h3 id="backup-history" className="font-bold">تاریخچه پشتیبان‌گیری و بازیابی</h3>
      {!items.length && !history.length && <p className="text-sm text-zinc-400">تاریخچه‌ای ثبت نشده است.</p>}
      <ul className="space-y-2 text-sm">
        {items.map(backup => <li key={backup.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
          <div><p>{backup.filename.startsWith("uploaded-") ? "فایل بارگذاری شده" : "نسخه پشتیبان"} · {stamp(backup.createdAt)}</p>
            <p className="text-xs text-zinc-400">{backupLabels[backup.status] || "در انتظار بررسی"} · {sizeLabel(backup)}{backup.verifiedAt ? ` · بررسی ${stamp(backup.verifiedAt)}` : ""}</p></div>
          <div className="flex flex-wrap gap-2">
            <a className="atelier-button-secondary" href={`/api/backups/${backup.id}/download`}>دریافت</a>
            <button type="button" disabled={busy} className="atelier-button-secondary" onClick={() => void run("در حال بررسی یکپارچگی نسخه…", async () => {
              await post(`/api/backups/${backup.id}/verify`);
              await load();
              setResult({ message: "یکپارچگی نسخه تأیید شد." });
            })}>بررسی یکپارچگی</button>
            <button type="button" disabled={busy} className="atelier-button-secondary" onClick={() => {
              selecting(backup);
              setFile(null);
              document.getElementById("restore-backup")?.scrollIntoView({ block: "start" });
            }}>انتخاب برای بازیابی</button>
          </div>
        </li>)}
        {history.map(row => <li key={row.id} className="rounded-xl border p-3">
          {stamp(row.created_at)} · {historyLabels[row.action] || "رویداد بازیابی"} · {row.user_name}
          {row.safety_backup_id && <a className="mr-2 underline" href={`/api/backups/${row.safety_backup_id}/download`}>دریافت نسخه ایمنی</a>}
        </li>)}
      </ul>
    </section>
  </div>;
}
