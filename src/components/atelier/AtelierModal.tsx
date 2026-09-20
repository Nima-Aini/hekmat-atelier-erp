"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function AtelierModal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="app-modal fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-0 backdrop-blur-sm sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`h-full max-h-dvh w-full overflow-y-auto border border-red-950 bg-[#0b0b0d] p-4 shadow-[0_0_80px_rgba(127,16,31,.25)] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:p-6 ${wide ? "max-w-5xl" : "max-w-2xl"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between border-b border-zinc-900 pb-4">
          <div>
            <p className="atelier-kicker">حکمت آتلیه</p>
            <h2 className="mt-1 text-lg font-black">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="atelier-icon-button"
            aria-label="بستن"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
