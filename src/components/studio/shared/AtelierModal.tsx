"use client";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function AtelierModal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
    <section className="max-h-[95dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 p-4 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6">
      <header className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-black text-white">{title}</h2><button type="button" onClick={onClose} className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" aria-label="بستن"><X className="h-5 w-5"/></button></header>{children}
    </section>
  </div>;
}
export const fieldClass="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500";
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="block space-y-1.5 text-xs font-bold text-slate-300"><span>{label}</span>{children}</label>}
