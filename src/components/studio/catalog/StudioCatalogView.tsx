"use client";
import { useEffect, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { AtelierModal, Field, fieldClass } from "@/components/studio/shared/AtelierModal";
import { formatMoney } from "@/lib/dateUtils";

const empty = { kind: "service", name: "", jobType: "wedding", description: "", basePrice: 0, parentId: "", workflowTemplateId: "", active: true, specifications: {} };
const kindLabel: Record<string, string> = { service: "خدمت", package: "پکیج", addon: "افزونه" };
export function StudioCatalogView() {
  const [items, setItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [templateEdit, setTemplateEdit] = useState<any>(null);
  const [error, setError] = useState("");
  const load = () => fetch("/api/studio/catalog").then(r => r.json()).then(d => {
    if (!d.success) throw Error(d.error);
    setItems(d.items); setTemplates(d.templates);
  }).catch(e => setError(e.message));
  useEffect(() => { void load(); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch(edit.id ? `/api/studio/catalog/${edit.id}` : "/api/studio/catalog", { method: edit.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(edit) });
    const data = await response.json();
    if (!response.ok || !data.success) return setError(data.error || "خطا در ذخیره کاتالوگ");
    setEdit(null); await load();
  };
  const saveWorkflow = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/studio/workflows", { method: templateEdit.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(templateEdit) });
    const data = await response.json();
    if (!response.ok || !data.success) return setError(data.error || "خطا در ذخیره قالب");
    setTemplateEdit(null); await load();
  };
  return <div className="space-y-5">
    <header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-black">خدمات و پکیج‌ها</h1><p className="text-sm text-slate-400">قیمت‌گذاری خدمات؛ قرارداد یک نسخهٔ ثابت از قیمت و محتویات نگه می‌دارد.</p></div><button onClick={() => setEdit(empty)} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 font-bold"><Plus className="h-4 w-4" />مورد جدید</button></header>
    {error && <p className="rounded-xl bg-rose-950/30 p-3 text-rose-200">{error}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item => <button key={item.id} onClick={() => setEdit({ ...item, basePrice: Number(item.basePrice) })} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-right hover:border-cyan-500/50"><div className="flex justify-between"><span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300">{kindLabel[item.kind] || item.kind}</span>{item.workflowTemplateId && <Sparkles className="h-4 w-4 text-purple-400" />}</div><h2 className="mt-4 font-black text-white">{item.name}</h2><p className="mt-2 line-clamp-2 text-xs text-slate-400">{item.description || "بدون توضیح"}</p><b className="mt-4 block text-emerald-300">{formatMoney(item.basePrice)}</b></button>)}</div>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><header className="flex items-center justify-between"><div><h2 className="font-black">قالب‌های گردش‌کار</h2><p className="text-xs text-slate-400">مراحل هر نوع پروژه مستقل و قابل تنظیم است.</p></div><button onClick={() => setTemplateEdit({ name: "", jobType: "custom", active: true, stages: [{ title: "مرحله جدید", stage: "custom", days: 0 }] })} className="rounded-xl border border-purple-500/30 px-3 py-2 text-xs text-purple-300">قالب جدید</button></header><div className="mt-4 grid gap-2 md:grid-cols-3">{templates.map(template => <button key={template.id} onClick={() => setTemplateEdit({ ...template, stages: Array.isArray(template.stages) ? template.stages : [] })} className="rounded-xl bg-slate-950 p-3 text-right"><b className="text-white">{template.name}</b><p className="mt-1 text-xs text-slate-400">{template.stages?.length || 0} مرحله · {template.jobType}</p></button>)}</div></section>
    {edit && <AtelierModal title={edit.id ? "ویرایش کاتالوگ" : "مورد جدید"} onClose={() => setEdit(null)}><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <Field label="نوع"><select className={fieldClass} value={edit.kind} onChange={e => setEdit({ ...edit, kind: e.target.value })}><option value="service">خدمت</option><option value="package">پکیج</option><option value="addon">افزونه</option></select></Field>
      <Field label="عنوان"><input required className={fieldClass} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
      <Field label="نوع پروژه"><select className={fieldClass} value={edit.jobType} onChange={e => setEdit({ ...edit, jobType: e.target.value })}><option value="wedding">عروسی</option><option value="portrait">پرتره</option><option value="commercial">تجاری</option><option value="child">کودک</option><option value="event">رویداد</option></select></Field>
      <Field label="قیمت پایه"><MoneyInput value={edit.basePrice} onChange={basePrice => setEdit({ ...edit, basePrice })} unit="تومان" /></Field>
      <Field label="قالب گردش‌کار"><select className={fieldClass} value={edit.workflowTemplateId || ""} onChange={e => setEdit({ ...edit, workflowTemplateId: e.target.value })}><option value="">بدون قالب اختصاصی</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>
      {edit.kind === "addon" && <Field label="پکیج والد"><select className={fieldClass} value={edit.parentId || ""} onChange={e => setEdit({ ...edit, parentId: e.target.value })}><option value="">عمومی</option>{items.filter(x => x.kind === "package").map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
      {edit.kind === "package" && <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 sm:col-span-2 sm:grid-cols-4">
        {[['hours','ساعت پوشش'],['photographers','تعداد عکاس'],['videographers','تعداد تصویربردار'],['cameras','تعداد دوربین'],['editedPhotos','عکس ادیت‌شده'],['videoDuration','مدت ویدیو (دقیقه)'],['prints','تعداد چاپ'],['deliveryDays','زمان تحویل (روز)']].map(([key,label]) => <Field key={key} label={label}><input type="number" min="0" className={fieldClass} value={edit.specifications?.[key] || 0} onChange={event => setEdit({ ...edit, specifications: { ...(edit.specifications || {}), [key]: Number(event.target.value) } })}/></Field>)}
        {[['teaser','تیزر'],['drone','هلی‌شات'],['album','آلبوم']].map(([key,label]) => <label key={key} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={Boolean(edit.specifications?.[key])} onChange={event => setEdit({ ...edit, specifications: { ...(edit.specifications || {}), [key]: event.target.checked } })}/>{label}</label>)}
      </div>}
      <div className="sm:col-span-2"><Field label="توضیحات و محتویات"><textarea className={`${fieldClass} min-h-28`} value={edit.description || ""} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field></div>
      <div className="flex gap-2 sm:col-span-2"><button className="rounded-xl bg-cyan-600 px-5 py-2.5 font-bold">ذخیره</button><button type="button" onClick={() => setEdit(null)} className="rounded-xl border border-slate-700 px-5">انصراف</button></div>
    </form></AtelierModal>}
    {templateEdit && <AtelierModal title={templateEdit.id ? "ویرایش قالب گردش‌کار" : "قالب گردش‌کار جدید"} onClose={() => setTemplateEdit(null)}><form onSubmit={saveWorkflow} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="عنوان قالب"><input required className={fieldClass} value={templateEdit.name} onChange={event => setTemplateEdit({ ...templateEdit, name: event.target.value })}/></Field><Field label="نوع پروژه"><input required className={fieldClass} value={templateEdit.jobType} onChange={event => setTemplateEdit({ ...templateEdit, jobType: event.target.value })}/></Field></div><div className="space-y-2">{templateEdit.stages.map((stage: any, index: number) => <div key={index} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[1fr_160px_100px_auto]"><input required aria-label="عنوان مرحله" className={fieldClass} value={stage.title} onChange={event => setTemplateEdit({ ...templateEdit, stages: templateEdit.stages.map((row: any, rowIndex: number) => rowIndex === index ? { ...row, title: event.target.value } : row) })}/><input required aria-label="کد مرحله" dir="ltr" className={fieldClass} value={stage.stage} onChange={event => setTemplateEdit({ ...templateEdit, stages: templateEdit.stages.map((row: any, rowIndex: number) => rowIndex === index ? { ...row, stage: event.target.value } : row) })}/><input type="number" aria-label="روز نسبت به اجرا" className={fieldClass} value={stage.days} onChange={event => setTemplateEdit({ ...templateEdit, stages: templateEdit.stages.map((row: any, rowIndex: number) => rowIndex === index ? { ...row, days: Number(event.target.value) } : row) })}/><button type="button" disabled={templateEdit.stages.length === 1} onClick={() => setTemplateEdit({ ...templateEdit, stages: templateEdit.stages.filter((_: any, rowIndex: number) => rowIndex !== index) })} className="text-xs text-rose-300 disabled:opacity-30">حذف</button></div>)}</div><button type="button" onClick={() => setTemplateEdit({ ...templateEdit, stages: [...templateEdit.stages, { title: "مرحله جدید", stage: `custom_${templateEdit.stages.length + 1}`, days: 0 }] })} className="rounded-xl border border-slate-700 px-3 py-2 text-xs">افزودن مرحله</button><div className="flex gap-2"><button className="rounded-xl bg-purple-600 px-5 py-2.5 font-bold">ذخیره قالب</button><button type="button" onClick={() => setTemplateEdit(null)} className="rounded-xl border border-slate-700 px-5">انصراف</button></div></form></AtelierModal>}
  </div>;
}
