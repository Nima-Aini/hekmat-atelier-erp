"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  UserPlus,
  UsersRound,
  Wrench,
} from "lucide-react";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { toJalaliDate } from "@/lib/dateUtils";
import { AtelierModal } from "./AtelierModal";
import { EmptyState, ErrorState, LoadingState } from "./StatusView";

const money = (value: unknown) =>
  `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
type Action = {
  type: "personnel" | "equipment" | "rental";
  item: any;
  contract: any;
} | null;

export function PlanningView() {
  const [planning, setPlanning] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [action, setAction] = useState<Action>(null);
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
              className="atelier-panel-red overflow-hidden"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-red-950/50 p-4 sm:p-5">
                <div>
                  <p className="text-xs text-red-400">
                    {contract.contractNumber}
                  </p>
                  <h2 className="mt-1 font-black">
                    {contract.projectType.title} {contract.customer.name}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {toJalaliDate(contract.programDate, { showTime: true })}{" "}
                    • {contract.executionLocation || "محل ثبت نشده"}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-900 bg-emerald-950/20 px-3 py-1 text-xs text-emerald-400">
                  تایید شده
                </span>
              </header>
              <div className="grid gap-3 p-3 sm:p-5 xl:grid-cols-2">
                {contract.items.map((item: any) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-zinc-800 bg-[#09090b] p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-black">{item.title}</h3>
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
                            className="flex items-center justify-between text-xs"
                          >
                            <span>{row.personnelName}</span>
                            <span className="text-zinc-500">
                              دستمزد: {money(row.wageSnapshot)}
                            </span>
                          </div>
                        ))}
                      </AssignmentBlock>
                      <AssignmentBlock
                        icon={<Camera className="h-4 w-4" />}
                        title="تجهیزات آتلیه"
                        empty="تجهیزی تخصیص داده نشده است."
                      >
                        {item.equipmentAssignments.map((row: any) => (
                          <div key={row.id} className="text-xs">
                            {(equipmentMap.get(row.equipmentId) as string) ||
                              "تجهیزات"}
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
                              <span>
                                {row.status === "planned"
                                  ? "نیاز به اجاره"
                                  : "اجاره شد"}
                              </span>
                            </div>
                            <p className="mt-1 text-zinc-500">
                              {toJalaliDate(row.pickupDate)} •{" "}
                              {money(row.rentalCost)}
                            </p>
                            {row.status === "planned" && (
                              <button
                                onClick={async () => {
                                  const value = window.prompt(
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
                                    return window.alert(
                                      data.error || "ثبت انجام نشد.",
                                    );
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
              </div>
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
  const startDefault = new Date(action.contract.programDate),
    endDefault = new Date(
      action.contract.programEndDate || +startDefault + 4 * 3600000,
    );
  const [resourceId, setResourceId] = useState(""),
    [start, setStart] = useState(startDefault.toISOString().slice(0, 16)),
    [end, setEnd] = useState(endDefault.toISOString().slice(0, 16)),
    [wage, setWage] = useState(0),
    [rentalTitle, setRentalTitle] = useState(""),
    [supplierName, setSupplierName] = useState(""),
    [cost, setCost] = useState(0),
    [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload =
        action.type === "personnel"
          ? {
              personnelId: resourceId,
              startsAt: new Date(start).toISOString(),
              endsAt: new Date(end).toISOString(),
              wageAmount: wage,
            }
          : action.type === "equipment"
            ? {
                equipmentId: resourceId,
                startsAt: new Date(start).toISOString(),
                endsAt: new Date(end).toISOString(),
              }
            : {
                itemTitle: rentalTitle,
                supplierName,
                neededAt: new Date(start).toISOString(),
                returnAt: new Date(end).toISOString(),
                estimatedCost: cost,
              };
      const url = `/api/atelier/planning/${action.item.id}/${action.type === "rental" ? "rentals" : action.type}`;
      const data = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!data.success) throw new Error(data.error || "ثبت انجام نشد.");
      onSaved();
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "ثبت انجام نشد.");
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
    <AtelierModal title={`${title} — ${action.item.title}`} onClose={onClose}>
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
          <label>
            <span className="atelier-label">شروع *</span>
            <input
              required
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="atelier-input w-full py-2.5"
              dir="ltr"
            />
          </label>
          <label>
            <span className="atelier-label">پایان *</span>
            <input
              required
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="atelier-input w-full py-2.5"
              dir="ltr"
            />
          </label>
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
            {saving ? "در حال ثبت…" : "ثبت تخصیص"}
          </button>
        </div>
      </form>
    </AtelierModal>
  );
}
