"use client";

import { useState } from "react";
import { Archive, CheckCircle2, ExternalLink, Plus } from "lucide-react";
import { AtelierModal, Field, fieldClass } from "@/components/studio/shared/AtelierModal";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { toJalaliDate } from "@/lib/dateUtils";

export function ProjectOperationsPanel({ project, onReload }: { project: any; onReload: () => void }) {
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState("");
  const request = async (url: string, init: RequestInit) => {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "عملیات ناموفق بود.");
    return data;
  };
  const updateTask = async (task: any) => {
    try {
      await request(`/api/studio/projects/${project.id}/tasks`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...task, status: "done" }) });
      onReload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا"); }
  };
  const archive = async () => {
    if (!confirm("این پروژه پس از تحویل بایگانی شود؟")) return;
    try {
      await request(`/api/studio/projects/${project.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
      onReload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا"); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request(`/api/studio/projects/${project.id}/deliverables`, { method: form.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      setForm(null); onReload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا"); }
  };
  const tasks = project.tasks || [];
  const done = tasks.filter((task: any) => task.status === "done").length;
  const next = tasks.find((task: any) => !["done", "cancelled"].includes(task.status));

  return <div className="space-y-6">
    {error && <p className="rounded-xl bg-rose-950/30 p-3 text-rose-200">{error}</p>}
    <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-white">گردش‌کار پروژه</h3><p className="text-xs text-slate-400">مرحله فعلی: {project.productionPlan?.currentStage || "—"}</p>{next && <p className="mt-1 text-xs text-cyan-300">اقدام بعدی: {next.title} {next.personnelName ? `· ${next.personnelName}` : "· بدون مسئول"}</p>}</div><div className="flex items-center gap-3"><b className="text-cyan-300">{done.toLocaleString("fa-IR")} / {tasks.length.toLocaleString("fa-IR")}</b>{["delivered", "completed"].includes(project.status) && <button onClick={archive} className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"><Archive className="h-4 w-4"/>بایگانی</button>}</div></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-gradient-to-l from-cyan-500 to-purple-500" style={{ width: `${tasks.length ? done / tasks.length * 100 : 0}%` }}/></div>
      <div className="mt-4 space-y-2">{tasks.map((task: any) => <div key={task.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${task.blocker ? "border-rose-500/30 bg-rose-950/10" : "border-slate-800 bg-slate-900"}`}><span><b className={task.status === "done" ? "text-slate-500 line-through" : "text-white"}>{task.title}</b><small className="mt-1 block text-slate-400">{task.personnelName || "بدون مسئول"} {task.dueDate ? `· ${toJalaliDate(task.dueDate)}` : ""}</small>{task.blocker && <small className="mt-1 block text-rose-300">مانع: {task.blocker}</small>}</span>{task.status !== "done" && <button onClick={() => updateTask(task)} className="shrink-0 rounded-lg bg-emerald-500/10 p-2 text-emerald-300" title="تکمیل"><CheckCircle2 className="h-4 w-4"/></button>}</div>)}</div>
    </section>
    <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5"><header className="flex items-center justify-between"><div><h3 className="font-black text-white">فایل‌ها و تحویل‌دادنی‌ها</h3><p className="text-xs text-slate-400">لینک گالری، ویدیو، انتخاب، آلبوم و محل پشتیبان</p></div><button onClick={() => setForm({ kind: "gallery", title: "", url: "", storageLocation: "", status: "pending", dueDate: "", notes: "" })} className="rounded-xl bg-cyan-600 p-2"><Plus className="h-4 w-4"/></button></header><div className="mt-4 grid gap-3 md:grid-cols-2">{(project.deliverables || []).map((item: any) => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><button onClick={() => setForm(item)} className="w-full text-right"><div className="flex justify-between"><b className="text-white">{item.title}</b><span className="text-xs text-cyan-300">{item.status}</span></div><p className="mt-2 text-xs text-slate-400">{item.kind} {item.dueDate ? `· ${toJalaliDate(item.dueDate)}` : ""}</p></button>{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-xs text-blue-300"><ExternalLink className="h-3.5 w-3.5"/>بازکردن لینک</a>}</div>)}</div></section>
    {form && <AtelierModal title={form.id ? "ویرایش تحویل‌دادنی" : "تحویل‌دادنی جدید"} onClose={() => setForm(null)}><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><Field label="نوع"><select className={fieldClass} value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}><option value="raw_backup">پشتیبان RAW</option><option value="selection">لینک انتخاب</option><option value="gallery">گالری عکس</option><option value="video">ویدیو</option><option value="album">آلبوم و چاپ</option><option value="other">سایر</option></select></Field><Field label="عنوان"><input required className={fieldClass} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })}/></Field><Field label="لینک HTTPS"><input dir="ltr" className={fieldClass} value={form.url || ""} onChange={event => setForm({ ...form, url: event.target.value })}/></Field><Field label="محل ذخیره / NAS"><input className={fieldClass} value={form.storageLocation || ""} onChange={event => setForm({ ...form, storageLocation: event.target.value })}/></Field><Field label="وضعیت"><select className={fieldClass} value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="pending">منتظر</option><option value="in_progress">در حال آماده‌سازی</option><option value="ready">آماده</option><option value="delivered">تحویل‌شده</option><option value="confirmed">تأیید مشتری</option></select></Field><JalaliDatePicker label="مهلت" value={form.dueDate} onChange={date => setForm({ ...form, dueDate: date?.toISOString() || "" })}/><div className="sm:col-span-2"><Field label="یادداشت"><textarea className={fieldClass} value={form.notes || ""} onChange={event => setForm({ ...form, notes: event.target.value })}/></Field></div><div className="flex gap-2 sm:col-span-2"><button className="rounded-xl bg-cyan-600 px-5 py-2.5 font-bold">ذخیره</button><button type="button" onClick={() => setForm(null)} className="rounded-xl border border-slate-700 px-5">انصراف</button></div></form></AtelierModal>}
  </div>;
}
