import type { getAtelierCustomerProfile } from "@/services/studio/customerProfile";
type JsonDates<T> = T extends Date ? string : T extends Array<infer U> ? JsonDates<U>[] : T extends object ? { [K in keyof T]: JsonDates<T[K]> } : T;
export type CustomerProfileData = JsonDates<Awaited<ReturnType<typeof getAtelierCustomerProfile>>>;

export const customerProfileStatus: Record<string, string> = {
  active: "فعال", inactive: "غیرفعال", churned: "قطع همکاری", lead: "ثبت اولیه", booked: "رزروشده", shooting: "در حال اجرا",
  in_post_production: "پس‌تولید", ready_for_review: "آماده بررسی", approved: "تأییدشده", delivered: "تحویل‌شده",
  draft: "در انتظار تأیید", signed: "تأییدشده", in_progress: "در حال انجام", completed: "تکمیل‌شده", cancelled: "لغوشده",
  pending: "در انتظار", due_soon: "سررسید نزدیک", overdue: "سررسید گذشته", partial: "تسویه جزئی", paid: "تسویه‌شده",
  unpaid: "پرداخت‌نشده", issued: "صادرشده", reversed: "برگشت‌شده", corrected: "اصلاح‌شده", bounced: "برگشتی",
  tentative: "موقت", confirmed: "قطعی", postponed: "به تعویق افتاده", open: "باز", done: "انجام‌شده", review_needed: "نیازمند بررسی", client_rejected: "نیازمند اصلاح",
  reserved: "رزروشده", checked_out: "تحویل به پرسنل", returned_safe: "بازگشت سالم", damaged: "آسیب‌دیده", received: "دریافت‌شده", verified: "تأییدشده",
  raw_backup: "پشتیبان‌گیری فایل خام", selection: "انتخاب", retouch: "روتوش", video_edit: "تدوین ویدئو", teaser: "تیزر", album_print: "چاپ آلبوم", final_qc: "کنترل نهایی",
};
export const customerPaymentMethods: Record<string, string> = { cash: "نقدی", pos: "کارت‌خوان", card_transfer: "کارت‌به‌کارت", bank_transfer: "انتقال بانکی", cheque: "چک", online: "آنلاین" };
export const customerProfileTabs = ["اطلاعات مشتری", "برنامه‌ریزی و خدمات", "مالی", "تاریخچه"] as const;
