import { toJalaliDate } from "@/lib/dateUtils";

const time = (value: Date | string) => new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
const weekday = (value: Date | string) => new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", weekday: "long" }).format(new Date(value));

export function formatPlanningCopyText(contract: any) {
  const executionDate = contract.programDate;
  const lines = [
    `${weekday(executionDate)} ${toJalaliDate(executionDate)}`,
    contract.projectType?.title || "",
    contract.customer?.name || "",
    contract.customer?.mobile || "",
    contract.executionLocation || "محل ثبت نشده",
    ...(contract.items || []).map((item: any) => `${item.title}: ${(item.personnelAssignments || []).map((row: any) => row.personnelName).join("، ") || "تخصیص داده نشده"}`),
    `ساعت ${time(executionDate)} تا ${time(contract.programEndDate || new Date(+new Date(executionDate) + 4 * 3600000))}`,
  ];
  if (String(contract.notes || "").trim()) lines.push(`توضیحات: ${String(contract.notes).trim()}`);
  return lines.filter(Boolean).join("\n\n");
}
