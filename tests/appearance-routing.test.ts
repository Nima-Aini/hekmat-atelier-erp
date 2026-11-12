import { describe, expect, it } from "vitest";
import { validAppearance, accentForeground } from "../src/lib/appearance";
import { canSeeAtelierSection } from "../src/lib/atelierNavigation";
describe("personal appearance validation", () => {
 it("accepts modes and rejects CSS injection and invalid hex", () => {
   expect(validAppearance({ theme: "light", accent: "#FFFFFF" })).toBe(true);
   for (const accent of ["red", "#fff", "url(x)", "#ffffff;display:none", null]) expect(validAppearance({ theme: "dark", accent })).toBe(false);
   expect(validAppearance({ theme: "inverted", accent: "#123456" })).toBe(false);
 });
 it("uses accessible foreground contrast for both extremes", () => { expect(accentForeground("#ffffff")).toBe("#09090b"); expect(accentForeground("#000000")).toBe("#ffffff"); });
 it("makes personal appearance available without administrative settings access", () => { expect(canSeeAtelierSection("appearance", [])).toBe(true); expect(canSeeAtelierSection("settings", [])).toBe(false); });
});
