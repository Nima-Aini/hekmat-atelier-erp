import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatPlanningCopyText } from "../src/lib/planningText";

const root = process.cwd();

describe("atelier final polish safeguards", () => {
  it("produces the exact operational planning text without financial or contract identifiers", () => {
    const text = formatPlanningCopyText({
      contractNumber: "AT-SECRET-42",
      totalAmount: 99_000_000,
      programDate: "2026-09-20T08:30:00.000Z",
      programEndDate: "2026-09-20T10:00:00.000Z",
      projectType: { title: "عروسی" },
      customer: { name: "سارا و احمد", mobile: "09120000000" },
      executionLocation: "باغ احسان",
      notes: "ورود از در جنوبی",
      items: [
        { title: "عکاسی", personnelAssignments: [{ personnelName: "نیما" }] },
        { title: "فیلمبرداری", personnelAssignments: [] },
      ],
    });

    expect(text).toBe([
      "یکشنبه ۱۴۰۵/۰۶/۲۹",
      "عروسی",
      "سارا و احمد",
      "09120000000",
      "باغ احسان",
      "عکاسی: نیما",
      "فیلمبرداری: تخصیص داده نشده",
      "ساعت ۱۲:۰۰ تا ۱۳:۳۰",
      "توضیحات: ورود از در جنوبی",
    ].join("\n\n"));
    expect(text).not.toContain("AT-SECRET-42");
    expect(text).not.toContain("99");
  });

  it("keeps the final migration additive and idempotent", () => {
    const source = readFileSync(join(root, "src/db/migrations/010_atelier_final_polish.ts"), "utf8");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS");
    expect(source).toContain("CREATE INDEX IF NOT EXISTS");
    expect(source).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
  });

  it("does not use browser-native dialogs or Gregorian date inputs in Atelier workflows", () => {
    const files = [
      "AtelierFinanceView.tsx", "ContractCustomersView.tsx", "ContractsView.tsx", "FinalCalendar.tsx",
      "FinalNotificationsView.tsx", "FinalSettingsView.tsx", "MasterDataViews.tsx", "PlanningView.tsx", "SimpleRecordsView.tsx",
    ];
    const source = files.map((file) => readFileSync(join(root, "src/components/atelier", file), "utf8")).join("\n");
    expect(source).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
    expect(source).not.toContain('type="date"');
    expect(source).not.toContain('type="datetime-local"');
  });
});
