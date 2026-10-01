import { describe, expect, it } from "vitest";
import { hasAtelierPermission, hasScopedAtelierPermission } from "../src/lib/atelierPermissions";

describe("granular capability compatibility", () => {
  it("preserves legacy managers without promoting narrow grants", () => {
    expect(hasAtelierPermission(["studio.contract.manage"], "studio.contract.cancel")).toBe(true);
    expect(hasAtelierPermission(["studio.contract.edit"], "studio.contract.cancel")).toBe(false);
    expect(hasAtelierPermission(["studio.contract.edit"], "studio.contract.manage")).toBe(false);
  });
  it("honors explicit scoped denies including legacy parent denial", () => {
    expect(hasScopedAtelierPermission(["studio.contract.manage"], "studio.contract.cancel", { "studio.contract.cancel": false })).toBe(false);
    expect(hasScopedAtelierPermission(["studio.contract.manage"], "studio.contract.cancel", { "studio.contract.manage": false })).toBe(false);
  });
  it("never elevates AI and does not expose wages to ordinary personnel viewers", () => {
    expect(hasAtelierPermission(["ai.use"], "ai.elevated")).toBe(false);
    expect(hasAtelierPermission(["ai.use"], "studio.finance.refund")).toBe(false);
    expect(hasAtelierPermission(["studio.personnel.view"], "studio.personnel.finance.view")).toBe(false);
    expect(hasAtelierPermission(["studio.personnel.finance.pay"], "studio.finance.manage")).toBe(false);
  });
});
