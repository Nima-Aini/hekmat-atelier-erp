export const NOTIFICATION_CATEGORIES = { contract: "قرارداد", finance: "مالی", equipment: "تجهیزات", planning: "برنامه‌ریزی / تقویم", personnel: "پرسنل", customer: "مشتری", reservation: "رزرو", system: "سیستم", ai: "هوش مصنوعی" } as const;
export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;
export function notificationCategory(key: string): NotificationCategory {
  if (/^(installment|contract-due|visit-due)/.test(key)) return "finance";
  if (/^(equipment|rental)/.test(key)) return "equipment";
  if (key.startsWith("person:")) return "personnel";
  if (key.startsWith("reservation:")) return "reservation";
  if (/^(pending|contract):/.test(key)) return "contract";
  return "system";
}
export function filterNotifications<T extends { category?: unknown; priority?: unknown; severity?: unknown; readAt?: unknown }>(items: T[], category = "all", state = "all") {
  return items.filter(item => (category === "all" || item.category === category) && (state !== "unread" || !item.readAt) && (state !== "important" || ["critical", "warning"].includes(String(item.severity || item.priority))));
}
