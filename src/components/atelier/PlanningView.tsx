"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Clock3,
  Edit3,
  Eye,
  Trash2,
  UserPlus,
  UsersRound,
  Wrench,
} from "lucide-react";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { getBusinessDateTimeParts, tehranDateTimeToUtc, toJalaliDate } from "@/lib/dateUtils";
import { AtelierModal } from "./AtelierModal";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";
import { atelierPrompt, atelierToast } from "@/lib/atelierFeedback";
import { formatPlanningCopyText } from "@/lib/planningText";
import { NeonStatus } from "./FinanceControls";

const money = (value: unknown) =>
  `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
type Action = {
  type: "personnel" | "equipment" | "rental";
  item: any;
  contract: any;
  assignment?: any;
} | null;
const time = (value: unknown) => new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(String(value)));

export function PlanningView({ onEditContract }: { onEditContract?: (id: string) => void }) {
  const [planning, setPlanning] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [action, setAction] = useState<Action>(null),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [summary, setSummary] = useState<any>(null),
    [pendingDelete, setPendingDelete] = useState<{ type: "personnel" | "equipment"; item: any; row: any } | null>(null);
  const load = () => {
    setLoading(true);
    setError("");
    fetch("/api/atelier/planning")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success)
          throw new Error(data.error || "دریافت برنامه ممکن نشد.");
        setPlanning(data.planning);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    const openTarget = (id: string) => {
      const contract = planning?.contracts?.find((row: any) => row.id === id || row.items?.some((item: any) => item.id === id || item.rentalRequirements?.some((rental: any) => rental.id === id)));
      if (!contract) return;
      sessionStorage.removeItem("akma:planning-target");
      setExpanded((current) => new Set(current).add(contract.id));
      window.setTimeout(() => document.getElementById(`planning-contract-${contract.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    };
    const listener = (event: Event) => {
      const id = (event as CustomEvent).detail?.id;
      if (!id) return;
      sessionStorage.setItem("akma:planning-target", id);
      openTarget(id);
    };
    window.addEventListener("akma:navigate-item", listener);
    const pending = sessionStorage.getItem("akma:planning-target");
    if (pending) openTarget(pending);
    return () => window.removeEventListener("akma:navigate-item", listener);
  }, [planning]);
  const equipmentMap = useMemo(
    () =>
      new Map(
        (planning?.equipmentOptions || []).map((item: any) => [
          item.id,
          item.title,
        ]),
      ),
    [planning],
  );
  if (loading) return <LoadingState />;
  if (error) return <ErrorState text={error} retry={load} />;
  return (
    <div className="space-y-5">
      <div>
        <p className="atelier-kicker">تخصیص مستقل برای هر آیتم قرارداد</p>
        <h1 className="mt-1 text-2xl font-black">برنامه ریزی</h1>
        <p className="mt-2 text-xs text-zinc-500">
          فقط قرارداد های تایید شده نمایش داده می‌شوند؛ تداخل پرسنل و تجهیزات در
          سرور کنترل می‌شود.
        </p>
      </div>
      {!planning.contracts.length ? (
        <EmptyState text="قرارداد تاییدشده‌ای برای برنامه ریزی وجود ندارد." />
      ) : (
        <div className="space-y-4">
          {planning.contracts.map((contract: any) => (
            <section
              key={contract.id}
              id={`planning-contract-${contract.id}`}
              className="atelier-panel-red overflow-hidden"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-red-950/50 p-4 sm:p-5">
                <button className="min-w-0 flex-1 text-right" onClick={() => setExpanded((current) => { const next = new Set(current); next.has(contract.id) ? next.delete(contract.id) : next.add(contract.id); return next; })}>
                  <h2 className="mt-1 font-black">
                    {contract.customer.name} — {contract.projectType.title}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {toJalaliDate(contract.programDate, { showTime: true })} • وضعیت برنامه‌ریزی: {contract.items.every((item: any) => item.personnelAssignments.length) ? "تکمیل پرسنل" : "نیازمند تخصیص"}
                  </p>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => onEditContract?.(contract.id)} className="atelier-icon-button" aria-label="ویرایش قرارداد"><Edit3 className="h-4 w-4" /></button>
                  <button onClick={() => setSummary(contract)} className="atelier-icon-button" aria-label="نمایش خلاصه"><Eye className="h-4 w-4" /></button>
                  <button onClick={async () => { await navigator.clipboard.writeText(formatPlanningCopyText(contract)); atelierToast("متن برنامه کپی شد.", "success"); }} className="atelier-button-secondary text-xs"><ClipboardCopy className="h-4 w-4" />کپی متن</button>
                  <button onClick={() => setExpanded((current) => { const next = new Set(current); next.has(contract.id) ? next.delete(contract.id) : next.add(contract.id); return next; })} className="atelier-icon-button" aria-label="باز و بسته کردن">{expanded.has(contract.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                </div>
              </header>
              {expanded.has(contract.id) && <div className="grid gap-3 p-3 sm:p-5 xl:grid-cols-2">
                {contract.items.map((item: any) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-zinc-800 bg-[#09090b] p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-black">{item.title}</h3>
                        <p className="mt-1 text-xs text-red-300">اجرا: {toJalaliDate(contract.programDate, { showTime: true })} تا {toJalaliDate(contract.programEndDate, { showTime: true })}</p>
                        <p className="mt-1 text-xs text-zinc-600">
                          {Number(item.quantity).toLocaleString("fa-IR")} ×{" "}
                          {money(item.unitPrice)}
                        </p>
                      </div>
                      <Clock3 className="h-4 w-4 text-red-400" />
                    </div>
                    <div className="mt-4 space-y-3">
                      <AssignmentBlock
                        icon={<UsersRound className="h-4 w-4" />}
                        title="پرسنل"
                        empty="پرسنلی تخصیص داده نشده است."
                      >
                        {item.personnelAssignments.map((row: any) => (
                          <div
                            key={row.id}
                            className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2"><div><strong>{row.personnelName}</strong><p className="mt-1 text-zinc-400">{toJalaliDate(row.startsAt)} · {time(row.startsAt)} تا {time(row.endsAt)}</p><p className="mt-1 text-zinc-600">دستمزد: {money(row.wageSnapshot)}</p></div><div className="flex gap-1"><button onClick={() => setAction({ type: "personnel", item, contract, assignment: row })} className="atelier-icon-button" aria-label="ویرایش تخصیص پرسنل"><Edit3 className="h-3.5 w-3.5" /></button><button onClick={() => setPendingDelete({ type: "personnel", item, row })} className="atelier-icon-button !text-red-300" aria-label="حذف تخصیص پرسنل"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
                          </div>
                        ))}
                      </AssignmentBlock>
                      <AssignmentBlock
                        icon={<Camera className="h-4 w-4" />}
                        title="تجهیزات آتلیه"
                        empty="تجهیزی تخصیص داده نشده است."
                      >
                        {item.equipmentAssignments.map((row: any) => (
                          <div key={row.id} className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-2 text-xs">
                            <div className="flex items-start justify-between gap-2"><div><strong>{(equipmentMap.get(row.equipmentId) as string) || "تجهیزات"}</strong><p className="mt-1 text-zinc-400">{toJalaliDate(row.reservedFrom)} · {time(row.reservedFrom)} تا {time(row.reservedTo)}</p></div><div className="flex gap-1"><button onClick={() => setAction({ type: "equipment", item, contract, assignment: row })} className="atelier-icon-button" aria-label="ویرایش تخصیص تجهیزات"><Edit3 className="h-3.5 w-3.5" /></button><button onClick={() => setPendingDelete({ type: "equipment", item, row })} className="atelier-icon-button !text-red-300" aria-label="حذف تخصیص تجهیزات"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
                          </div>
                        ))}
                      </AssignmentBlock>
                      <AssignmentBlock
                        icon={<Wrench className="h-4 w-4" />}
                        title="تجهیزات اجاره‌ای"
                        empty="نیاز اجاره‌ای ثبت نشده است."
                      >
                        {item.rentalRequirements.map((row: any) => (
                          <div
                            key={row.id}
                            className={`rounded-xl border p-2 text-xs ${row.status === "planned" ? "border-red-800 bg-red-950/25" : "border-emerald-900 bg-emerald-950/20"}`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={
                                  row.status === "planned"
                                    ? "font-black text-red-300"
                                    : "text-emerald-300"
                                }
                              >
                                {row.itemTitle}
                              </span>
                              <NeonStatus tone={row.status === "planned" ? "critical" : "success"}>{row.status === "planned" ? "اجاره تکمیل نشده" : "اجاره شد"}</NeonStatus>
                            </div>
                            <p className="mt-1 text-zinc-500">
                              {toJalaliDate(row.pickupDate)} •{" "}
                              {money(row.rentalCost)}
                            </p>
                            {row.status === "planned" && (
                              <button
                                onClick={async () => {
                                  const value = await atelierPrompt(
                                    "هزینه نهایی اجاره (تومان)",
                                    String(Number(row.rentalCost)),
                                  );
                                  if (value === null) return;
                                  const data = await fetch(
                                    `/api/atelier/planning/rentals/${row.id}`,
                                    {
                                      method: "PUT",
                                      headers: {
                                        "content-type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        finalCost: Number(value),
                                      }),
                                    },
                                  ).then((r) => r.json());
                                  if (!data.success)
                                    return atelierToast(data.error || "ثبت انجام نشد.", "error");
                                  atelierToast("اجاره تکمیل شد.", "success");
                                  load();
                                }}
                                className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white"
                              >
                                <CheckCircle2 className="ml-1 inline h-3 w-3" />
                                اجاره شد
                              </button>
                            )}
                          </div>
                        ))}
                      </AssignmentBlock>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button
                        onClick={() =>
                          setAction({ type: "personnel", item, contract })
                        }
                        className="atelier-button-secondary px-2 text-[10px]"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        پرسنل
                      </button>
                      <button
                        onClick={() =>
                          setAction({ type: "equipment", item, contract })
                        }
                        className="atelier-button-secondary px-2 text-[10px]"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        تجهیزات
                      </button>
                      <button
                        onClick={() =>
                          setAction({ type: "rental", item, contract })
                        }
                        className="atelier-button px-2 text-[10px]"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        اجاره‌ای
                      </button>
                    </div>
                  </article>
                ))}
              </div>}
            </section>
          ))}
        </div>
      )}
      {action && (
        <PlanningAction
          action={action}
          planning={planning}
          onClose={() => setAction(null)}
          onSaved={() => {
            setAction(null);
            load();
          }}
        />
      )}
      {summary && <AtelierModal title="خلاصه برنامه قرارداد" onClose={() => setSummary(null)} wide>
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-4 sm:grid-cols-2"><p><span className="text-zinc-500">مشتری:</span> {summary.customer.name} — {summary.customer.mobile}</p><p><span className="text-zinc-500">نوع پروژه:</span> {summary.projectType.title}</p><p><span className="text-zinc-500">تاریخ و ساعت:</span> {toJalaliDate(summary.programDate, { showTime: true })} تا {toJalaliDate(summary.programEndDate, { showTime: true })}</p><p><span className="text-zinc-500">لوکیشن:</span> {summary.executionLocation || "ثبت نشده"}</p></div>
          {summary.items.map((item: any) => <div key={item.id} className="rounded-2xl border border-zinc-800 p-4"><h3 className="font-black">{item.title}</h3><p className={`mt-2 text-xs ${item.personnelAssignments.length ? "text-zinc-300" : "text-red-400"}`}>پرسنل: {item.personnelAssignments.map((row: any) => row.personnelName).join("، ") || "تخصیص داده نشده"}</p><p className={`mt-1 text-xs ${item.equipmentAssignments.length ? "text-zinc-300" : "text-red-400"}`}>تجهیزات آتلیه: {item.equipmentAssignments.map((row: any) => equipmentMap.get(row.equipmentId)).filter(Boolean).join("، ") || "تخصیص داده نشده"}</p><p className={`mt-1 text-xs ${item.rentalRequirements.some((row: any) => row.status === "planned") ? "font-black text-red-400" : "text-zinc-300"}`}>تجهیزات اجاره‌ای: {item.rentalRequirements.map((row: any) => `${row.itemTitle} (${row.status === "planned" ? "اجاره تکمیل نشده" : "اجاره شد"})`).join("، ") || "نیازی ثبت نشده"}</p></div>)}
        </div>
      </AtelierModal>}
      {pendingDelete && <AtelierModal title="حذف تخصیص" onClose={() => setPendingDelete(null)}><div className="space-y-5"><p className="text-sm text-zinc-300">این تخصیص از برنامه حذف می‌شود. سوابق مالی پرداخت‌شده هرگز به‌صورت خودکار تغییر نمی‌کنند.</p><div className="flex justify-end gap-2"><button onClick={() => setPendingDelete(null)} className="atelier-button-secondary">انصراف</button><button onClick={async () => { const response = await fetch(`/api/atelier/planning/${pendingDelete.item.id}/${pendingDelete.type}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignmentId: pendingDelete.row.id }) }); const result = await response.json(); if (!response.ok || !result.success) return atelierToast(result.error || "حذف انجام نشد.", "error"); setPendingDelete(null); atelierToast("تخصیص حذف شد.", "success"); load(); }} className="atelier-button !bg-red-700"><Trash2 className="h-4 w-4" />حذف تخصیص</button></div></div></AtelierModal>}
    </div>
  );
}

function AssignmentBlock({
  icon,
  title,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="rounded-xl border border-zinc-900 bg-black/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-400">
        {icon}
        {title}
      </div>
      <div className="space-y-1.5">
        {children.length ? (
          children
        ) : (
          <p className="text-[10px] text-zinc-700">{empty}</p>
        )}
      </div>
    </div>
  );
}

function PlanningAction({
  action,
  planning,
  onClose,
  onSaved,
}: {
  action: NonNullable<Action>;
  planning: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const startDefault = new Date(action.assignment?.startsAt || action.assignment?.reservedFrom || action.contract.programDate),
    endDefault = new Date(
      action.assignment?.endsAt || action.assignment?.reservedTo || action.contract.programEndDate || +startDefault + 4 * 3600000,
    );
  const startParts = getBusinessDateTimeParts(startDefault);
  const endParts = getBusinessDateTimeParts(endDefault);
  const [resourceId, setResourceId] = useState(action.assignment?.personnelId || action.assignment?.equipmentId || ""),
    [startDate, setStartDate] = useState<Date | null>(startDefault),
    [startTime, setStartTime] = useState(`${String(startParts.hour).padStart(2, "0")}:${String(startParts.minute).padStart(2, "0")}`),
    [endDate, setEndDate] = useState<Date | null>(endDefault),
    [endTime, setEndTime] = useState(`${String(endParts.hour).padStart(2, "0")}:${String(endParts.minute).padStart(2, "0")}`),
    [wage, setWage] = useState(Number(action.assignment?.wageSnapshot || 0)),
    [rentalTitle, setRentalTitle] = useState(""),
    [supplierName, setSupplierName] = useState(""),
    [cost, setCost] = useState(0),
    [saving, setSaving] = useState(false);
  const atTime = (date: Date | null, clock: string) => {
    if (!date) throw new Error("تاریخ شروع و پایان الزامی است.");
    const parts = getBusinessDateTimeParts(date);
    const [hour, minute] = clock.split(":").map(Number);
    return tehranDateTimeToUtc({ year: parts.year, month: parts.month, day: parts.day, hour, minute });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const startsAt = atTime(startDate, startTime).toISOString();
      const endsAt = atTime(endDate, endTime).toISOString();
      const payload =
        action.type === "personnel"
          ? {
              personnelId: resourceId,
              startsAt,
              endsAt,
              wageAmount: wage,
            }
          : action.type === "equipment"
            ? {
                equipmentId: resourceId,
                startsAt,
                endsAt,
              }
            : {
                itemTitle: rentalTitle,
                supplierName,
                neededAt: startsAt,
                returnAt: endsAt,
                estimatedCost: cost,
              };
      const url = `/api/atelier/planning/${action.item.id}/${action.type === "rental" ? "rentals" : action.type}`;
      const data = await fetch(url, {
        method: action.assignment ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, assignmentId: action.assignment?.id }),
      }).then((r) => r.json());
      if (!data.success) throw new Error(data.error || "ثبت انجام نشد.");
      onSaved();
    } catch (reason) {
      atelierToast(reason instanceof Error ? reason.message : "ثبت انجام نشد.", "error");
    } finally {
      setSaving(false);
    }
  };
  const title =
    action.type === "personnel"
      ? "تخصیص پرسنل"
      : action.type === "equipment"
        ? "تخصیص تجهیزات آتلیه"
        : "ثبت تجهیزات اجاره‌ای";
  return (
    <AtelierModal title={`${action.assignment ? "ویرایش" : title} — ${action.item.title}`} onClose={onClose} wide>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {action.type === "personnel" && (
          <>
            <label>
              <span className="atelier-label">پرسنل *</span>
              <select
                required
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
                className="atelier-input w-full py-2.5"
              >
                <option value="">انتخاب پرسنل</option>
                {planning.personnelOptions.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName} — {item.primaryRole}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label className="atelier-label">دستمزد این تخصیص</label>
              <MoneyInput
                value={wage}
                onChange={setWage}
                unit="تومان"
                className="!rounded-xl !border-zinc-800 !bg-black"
              />
              <p className="mt-1 text-[10px] text-zinc-600">
                مبلغ این کار را صریح وارد کنید؛ پس از ثبت، برای همین تخصیص به‌صورت snapshot نگهداری می‌شود.
              </p>
            </div>
          </>
        )}
        {action.type === "equipment" && (
          <label>
            <span className="atelier-label">تجهیزات *</span>
            <select
              required
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
              className="atelier-input w-full py-2.5"
            >
              <option value="">انتخاب تجهیزات</option>
              {planning.equipmentOptions.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {item.code}
                </option>
              ))}
            </select>
          </label>
        )}
        {action.type === "rental" && (
          <>
            <label>
              <span className="atelier-label">اسم دستگاه / تجهیزات *</span>
              <input
                required
                value={rentalTitle}
                onChange={(event) => setRentalTitle(event.target.value)}
                className="atelier-input w-full py-2.5"
              />
            </label>
            <label>
              <span className="atelier-label">نام اجاره‌دهنده</span>
              <input
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                className="atelier-input w-full py-2.5"
              />
            </label>
            <div>
              <label className="atelier-label">هزینه برآوردی</label>
              <MoneyInput
                value={cost}
                onChange={setCost}
                unit="تومان"
                className="!rounded-xl !border-zinc-800 !bg-black"
              />
            </div>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <JalaliDatePicker required label="تاریخ شروع *" value={startDate} onChange={(value) => setStartDate(value)} />
            <label><span className="atelier-label">ساعت شروع *</span><input required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="atelier-input w-full py-2.5" dir="ltr" /></label>
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <JalaliDatePicker required label="تاریخ پایان *" value={endDate} onChange={(value) => setEndDate(value)} />
            <label><span className="atelier-label">ساعت پایان *</span><input required type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="atelier-input w-full py-2.5" dir="ltr" /></label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-900 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="atelier-button-secondary"
          >
            انصراف
          </button>
          <button disabled={saving} className="atelier-button">
            {saving ? "در حال ثبت…" : action.assignment ? "ذخیره تغییرات" : "ثبت تخصیص"}
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}
