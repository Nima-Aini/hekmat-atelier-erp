"use client";
import { useEffect, useState } from "react";
import { Plus, Store } from "lucide-react";
import { AtelierModal, Field, fieldClass } from "@/components/studio/shared/AtelierModal";

const empty = { name: "", mobile: "", contactPerson: "", partnerCategory: "rental", phone: "", address: "", city: "تهران", notes: "" };
const categories: Record<string, string> = { rental: "رنتال تجهیزات", print_lab: "لابراتوار و چاپ", location: "لوکیشن و استودیو", makeup: "گریم و آرایش", editor: "ادیتور و پس‌تولید", freelancer: "همکار آزاد", transport: "حمل‌ونقل", catering: "پذیرایی", other: "سایر" };
export function StudioVendorsView() {
  const [items, setItems] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [error, setError] = useState("");
  const load = () => fetch("/api/suppliers").then(r => r.json()).then(data => {
    if (!data.success) throw Error(data.error);
    setItems(data.suppliers);
  }).catch(error => setError(error.message));
  useEffect(() => { void load(); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch(edit.id ? `/api/suppliers/${edit.id}` : "/api/suppliers", { method: edit.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(edit) });
    const data = await response.json();
    if (!response.ok || !data.success) return setError(data.error || "خطا در ذخیره همکار");
    setEdit(null); await load();
  };
  return <div className="space-y-5"><header className="flex justify-between gap-3"><div><h1 className="text-2xl font-black">همکاران و تأمین‌کنندگان</h1><p className="text-sm text-slate-400">رنتال، لابراتوار چاپ، لوکیشن، ادیتور و سایر شرکای پروژه</p></div><button onClick={() => setEdit(empty)} className="flex h-fit items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5"><Plus className="h-4 w-4" />همکار جدید</button></header>
    {error && <p className="rounded-xl bg-rose-950/30 p-3 text-rose-200">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(item => <button key={item.id} onClick={() => setEdit(item)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-right"><div className="flex items-center justify-between"><Store className="h-5 w-5 text-cyan-400" /><span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-300">{categories[item.partnerCategory] || "همکار آتلیه"}</span></div><b className="mt-3 block text-white">{item.name}</b><p className="mt-1 text-xs text-slate-400">{item.contactPerson || "—"} · {item.mobile}</p><p className="mt-2 text-xs text-slate-500">{item.notes || item.address || "بدون یادداشت"}</p></button>)}</div>
    {edit && <AtelierModal title={edit.id ? "ویرایش همکار" : "همکار جدید"} onClose={() => setEdit(null)}><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><Field label="نام مجموعه / همکار"><input required className={fieldClass} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="دسته همکار"><select className={fieldClass} value={edit.partnerCategory || "other"} onChange={e => setEdit({ ...edit, partnerCategory: e.target.value })}>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><Field label="شخص تماس"><input className={fieldClass} value={edit.contactPerson || ""} onChange={e => setEdit({ ...edit, contactPerson: e.target.value })} /></Field><Field label="همراه"><input required dir="ltr" className={fieldClass} value={edit.mobile} onChange={e => setEdit({ ...edit, mobile: e.target.value })} /></Field><Field label="تلفن"><input dir="ltr" className={fieldClass} value={edit.phone || ""} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field><Field label="مانده پرداختنی"><div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-amber-300">{Number(edit.payableBalance || 0).toLocaleString("fa-IR")} تومان</div></Field><div className="sm:col-span-2"><Field label="نشانی"><input className={fieldClass} value={edit.address || ""} onChange={e => setEdit({ ...edit, address: e.target.value })} /></Field></div><div className="sm:col-span-2"><Field label="یادداشت"><textarea className={fieldClass} value={edit.notes || ""} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></Field></div><div className="flex gap-2 sm:col-span-2"><button className="rounded-xl bg-cyan-600 px-5 py-2.5 font-bold">ذخیره</button><button type="button" onClick={() => setEdit(null)} className="rounded-xl border border-slate-700 px-5">انصراف</button></div></form></AtelierModal>}
  </div>;
}
