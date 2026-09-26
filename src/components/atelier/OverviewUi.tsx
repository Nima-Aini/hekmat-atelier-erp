"use client";

import type { CSSProperties, ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

export const overviewMoney = (value: unknown) =>
  Number.isFinite(Number(value)) && value !== null && value !== undefined
    ? `${Number(value).toLocaleString("fa-IR")} تومان`
    : "—";
export const tones = {
  blue: "#3596ff",
  green: "#12c99a",
  red: "#f43f55",
  purple: "#ad6ff2",
  amber: "#f5b52f",
};
export type Tone = keyof typeof tones;

export function OverviewCard({
  title,
  icon: Icon,
  action,
  children,
  className = "",
}: {
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overview-card ${className}`}>
      {title && (
        <div className="overview-section-head">
          <h2 className="flex items-center gap-2.5 text-sm font-bold sm:text-base">
            {Icon && <Icon className="h-5 w-5 text-slate-400" />}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function MetricCard({
  title,
  value,
  context,
  icon: Icon,
  tone,
  onClick,
}: {
  title: string;
  value: ReactNode;
  context: string;
  icon: LucideIcon;
  tone: Tone;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-300">{title}</span>
        <span className="overview-metric-icon">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 break-words text-xl font-extrabold tabular-nums text-white xl:text-2xl">
        {value}
      </p>
      <p className="mt-3 text-xs leading-5 text-slate-400">{context}</p>
    </>
  );
  const style = { "--metric-accent": tones[tone] } as CSSProperties;
  return onClick ? (
    <button
      onClick={onClick}
      style={style}
      className="overview-metric text-right"
    >
      {content}
    </button>
  ) : (
    <article style={style} className="overview-metric">
      {content}
    </article>
  );
}

export function OverviewEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-4 text-center text-sm leading-6 text-slate-400">
      <Inbox className="h-7 w-7 text-slate-600" />
      {children}
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div role="status" aria-label="در حال دریافت اطلاعات" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((id) => (
          <div key={id} className="overview-card h-36 animate-pulse" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="overview-card h-80 animate-pulse" />
        <div className="overview-card h-80 animate-pulse" />
      </div>
    </div>
  );
}

export function OverviewTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return rows.length ? (
    <div className="overview-table-scroll">
      <table className="overview-table">
        <thead>
          <tr>
            {headers.map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <OverviewEmpty>هنوز اطلاعاتی در این بخش ثبت نشده است.</OverviewEmpty>
  );
}
