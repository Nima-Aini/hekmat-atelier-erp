import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]+)\\}`));
  expect(match, `Missing theme rule: ${selector}`).not.toBeNull();
  return match![1];
};

describe("Dashboard and Financial neutral-black theme", () => {
  it("defines one shared neutral palette", () => {
    const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
    expect(layout).not.toContain("bg-[#050506]");
    for (const [token, color] of Object.entries({
      "--app-bg": "#050505",
      "--surface-1": "#0c0d0f",
      "--surface-2": "#111214",
      "--surface-3": "#151619",
      "--border-dark": "#27272a",
    })) expect(css).toContain(`${token}: ${color};`);
  });

  it("uses identical page, card, header and modal surfaces without tinted gradients", () => {
    for (const selector of [".overview-shell", ".overview-shell > aside", ".overview-shell .app-main"])
      expect(rule(selector)).toContain("background: var(--app-bg)");
    for (const selector of [".overview-card", ".overview-metric", ".overview-shell > header", ".overview-page .app-modal > div"])
      expect(rule(selector)).toContain("background: var(--surface-1)");
    expect(rule(".overview-table th")).toContain("background: var(--surface-2)");
    expect(rule(".overview-page .atelier-money-input")).toContain("background: var(--surface-2)");
    expect(rule(".overview-page .atelier-money-unit")).toContain("background: var(--surface-3)");
    expect(rule(".overview-page .app-modal form > div:last-child:has(button)")).toContain("background: var(--surface-1)");
  });

  it("keeps red selection and semantic KPI accents", () => {
    expect(rule(".overview-range.is-active")).toContain("background: #43121c");
    expect(rule(".overview-metric-icon")).toContain("var(--metric-accent)");
  });
});
