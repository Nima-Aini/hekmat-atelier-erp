import { ApiError, assertUuid } from "@/lib/apiError";
export type Input = Record<string, unknown>;
export function object(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "اطلاعات فرم معتبر نیست.");
  return value as Input;
}
export function text(value: unknown, required = false, max = 4000): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "فیلد الزامی را تکمیل کنید.");
    return null;
  }
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new ApiError(400, "مقدار متنی معتبر نیست.");
  return value.trim();
}
export function date(value: unknown, required = false): Date | null {
  const raw = text(value, required, 100);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) throw new ApiError(400, "تاریخ معتبر نیست.");
  return parsed;
}
export function uuid(value: unknown): string | null {
  if (!value) return null;
  assertUuid(value); return value as string;
}
export function choice(value: unknown, choices: readonly string[], fallback?: string) {
  const result = value ?? fallback;
  if (typeof result !== "string" || !choices.includes(result)) throw new ApiError(400, "گزینهٔ انتخاب‌شده معتبر نیست.");
  return result;
}
export function safeLink(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  try { const url = new URL(raw); if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.toString(); } catch { /* validated below */ }
  throw new ApiError(400, "نشانی باید یک لینک HTTP یا HTTPS بدون رمز عبور باشد.");
}
