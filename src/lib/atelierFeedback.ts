"use client";

type DialogKind = "confirm" | "prompt";
type DialogDetail = {
  kind: DialogKind;
  title?: string;
  message: string;
  defaultValue?: string;
  resolve: (value: boolean | string | null) => void;
};

const DIALOG_EVENT = "atelier:dialog";
const TOAST_EVENT = "atelier:toast";

export function atelierConfirm(message: string, title = "تأیید عملیات") {
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<DialogDetail>(DIALOG_EVENT, { detail: { kind: "confirm", title, message, resolve: (value) => resolve(Boolean(value)) } }));
  });
}

export function atelierPrompt(message: string, defaultValue = "", title = "ورود اطلاعات") {
  return new Promise<string | null>((resolve) => {
    window.dispatchEvent(new CustomEvent<DialogDetail>(DIALOG_EVENT, { detail: { kind: "prompt", title, message, defaultValue, resolve: (value) => resolve(typeof value === "string" ? value : null) } }));
  });
}

export function atelierToast(message: string, tone: "success" | "error" | "info" = "info") {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }));
}

export const atelierFeedbackEvents = { dialog: DIALOG_EVENT, toast: TOAST_EVENT } as const;
export type { DialogDetail };
