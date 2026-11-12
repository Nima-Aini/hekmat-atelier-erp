import { ApiError, decimal } from "./apiError";

export type DailyVisitOption = { key: string; title: string; active: boolean; sortOrder: number; defaultPrice: string };
export type DailyVisitItem = { id: string; title: string; active: boolean; mode: string; defaultPrice: string; secondaryOptions: unknown };
export type VisitItemSnapshot = { itemId: string; itemTitle: string; optionKey: string | null; optionTitle: string | null };

export function normalizeDailyVisitOptions(input: unknown): DailyVisitOption[] {
  if (!Array.isArray(input) || input.length > 100) throw new ApiError(400, "حداکثر ۱۰۰ گزینه ثانویه مجاز است.");
  const keys = new Set<string>();
  return input.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "گزینه ثانویه نامعتبر است.");
    const key = String(raw.key || "").trim();
    const title = String(raw.title || "").trim();
    const sortOrder = Number(raw.sortOrder ?? index);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key) || keys.has(key)) throw new ApiError(400, "کلید گزینه باید یکتا و معتبر باشد.");
    if (!title || title.length > 120 || !Number.isSafeInteger(sortOrder)) throw new ApiError(400, "عنوان یا ترتیب گزینه نامعتبر است.");
    keys.add(key);
    const defaultPrice = decimal(raw.defaultPrice ?? 0, "قیمت پیش‌فرض", 2);
    if (Number(defaultPrice) < 0) throw new ApiError(400, "قیمت پیش‌فرض نمی‌تواند منفی باشد.");
    return { key, title, active: raw.active !== false, sortOrder, defaultPrice };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function resolveDailyVisitItem(item: DailyVisitItem, optionKey: string | null, override: unknown) {
  if (!item.active) throw new ApiError(400, "آیتم غیرفعال برای مراجعه جدید قابل انتخاب نیست.");
  const options = normalizeDailyVisitOptions(item.secondaryOptions);
  const option = optionKey ? options.find(row => row.key === optionKey && row.active) : undefined;
  if (item.mode === "secondary_options" && !option) throw new ApiError(400, "یک گزینه ثانویه فعال انتخاب کنید.");
  if (item.mode === "simple" && optionKey) throw new ApiError(400, "این آیتم گزینه ثانویه ندارد.");
  const price = decimal(override ?? option?.defaultPrice ?? item.defaultPrice, "قیمت", 2);
  if (Number(price) < 0) throw new ApiError(400, "قیمت نمی‌تواند منفی باشد.");
  const snapshot: VisitItemSnapshot = { itemId: item.id, itemTitle: item.title, optionKey: option?.key || null, optionTitle: option?.title || null };
  return { title: option ? `${item.title} — ${option.title}` : item.title, price, itemSnapshot: snapshot };
}
