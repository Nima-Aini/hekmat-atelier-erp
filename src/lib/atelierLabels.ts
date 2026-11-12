const labels: Record<string, string> = {
  salary: "حقوق و دستمزد", rent: "اجاره", rental: "اجاره تجهیزات", transport: "حمل و نقل", equipment: "تجهیزات", general: "عمومی", misc: "سایر",
  pending: "در انتظار", partial: "پرداخت جزئی", paid: "تسویه شده", overdue: "سررسید گذشته", unpaid: "پرداخت نشده", completed: "تکمیل شده", bounced: "برگشت خورده", cancelled: "لغو شده",
  cash: "نقدی", bank: "بانکی", pos: "کارت‌خوان", card_transfer: "کارت به کارت", bank_transfer: "انتقال بانکی", cheque: "چک",
  salary_payout: "پرداخت حقوق", supplier_payment: "پرداخت تأمین‌کننده", expense_payment: "پرداخت هزینه", customer_receipt: "دریافت از مشتری",
};
export const atelierLabel = (value: unknown) => labels[String(value || "")] || String(value || "—");
