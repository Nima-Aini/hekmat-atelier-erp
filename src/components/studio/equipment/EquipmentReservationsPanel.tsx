"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LogIn, LogOut } from "lucide-react";
import { AtelierModal, Field, fieldClass } from "@/components/studio/shared/AtelierModal";
import { toJalaliDate } from "@/lib/dateUtils";

export function EquipmentReservationsPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [returning, setReturning] = useState<any>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/studio/equipment/reservations");
    const data = await response.json();
    if (!response.ok || !data.success) return setError(data.error || "دریافت رزروها ناموفق بود.");
    setItems(data.reservations || []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (item: any, action: string, details: Record<string, unknown> = {}) => {
    const response = await fetch(`/api/studio/equipment/reservations/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...details }) });
    const data = await response.json();
    if (!response.ok || !data.success) return setError(data.error || "تغییر وضعیت ناموفق بود.");
    setReturning(null); await load();
  };
  return <div className="space-y-4">
    <header><h2 className="text-lg font-black text-white">تحویل و عودت تجهیزات</h2><p className="text-xs text-slate-400">زنجیره تحویل تجهیز به عوامل، عودت، وضعیت فیزیکی و آسیب</p></header>
    {error && <p className="rounded-xl bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
    <div className="grid gap-3 lg:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-start justify-between gap-3"><div><b className="text-white">{item.equipmentTitle}</b><p className="mt-1 text-xs text-cyan-300">{item.projectNumber || "بدون پروژه"} · {item.projectTitle || "رزرو عمومی"}</p></div><span className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300">{item.status}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400"><div>مسئول: <b className="text-slate-200">{item.personnelName || "—"}</b></div><div>از: <b className="text-slate-200">{toJalaliDate(item.reservedFrom, { showTime: true })}</b></div><div>تا: <b className="text-slate-200">{toJalaliDate(item.reservedTo, { showTime: true })}</b></div><div>شرایط عودت: <b className="text-slate-200">{item.conditionOnReturn || "—"}</b></div></dl><div className="mt-4 flex flex-wrap gap-2">{item.status === "reserved" && <button onClick={() => act(item, "checkout", { condition: "تحویل سالم" })} className="flex items-center gap-1 rounded-lg bg-blue-600/15 px-3 py-2 text-xs font-bold text-blue-300"><LogOut className="h-4 w-4"/>تحویل به عامل</button>}{item.status === "checked_out" && <><button onClick={() => setReturning({ item, damaged: false, condition: "سالم", notes: "" })} className="flex items-center gap-1 rounded-lg bg-emerald-600/15 px-3 py-2 text-xs font-bold text-emerald-300"><LogIn className="h-4 w-4"/>عودت</button><button onClick={() => setReturning({ item, damaged: true, condition: "آسیب‌دیده", notes: "" })} className="flex items-center gap-1 rounded-lg bg-rose-600/15 px-3 py-2 text-xs font-bold text-rose-300"><AlertTriangle className="h-4 w-4"/>ثبت آسیب</button></>}{["returned","returned_safe"].includes(item.status) && <span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4"/>عودت ثبت شده</span>}</div></article>)}</div>
    {returning && <AtelierModal title={returning.damaged ? "ثبت آسیب هنگام عودت" : "ثبت عودت تجهیز"} onClose={() => setReturning(null)}><form onSubmit={(event) => { event.preventDefault(); void act(returning.item, returning.damaged ? "damage" : "checkin", { condition: returning.condition, notes: returning.notes }); }} className="space-y-4"><Field label="وضعیت هنگام عودت"><input required className={fieldClass} value={returning.condition} onChange={event => setReturning({ ...returning, condition: event.target.value })}/></Field><Field label="توضیحات / آسیب"><textarea required={returning.damaged} className={fieldClass} value={returning.notes} onChange={event => setReturning({ ...returning, notes: event.target.value })}/></Field><div className="flex gap-2"><button className={`rounded-xl px-5 py-2.5 font-bold ${returning.damaged ? "bg-rose-600" : "bg-emerald-600"}`}>ثبت قطعی</button><button type="button" onClick={() => setReturning(null)} className="rounded-xl border border-slate-700 px-5">انصراف</button></div></form></AtelierModal>}
  </div>;
}
