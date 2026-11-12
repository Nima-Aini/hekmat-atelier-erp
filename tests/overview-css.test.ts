import { describe, expect, it } from "vitest";
import { assertOverviewCss, overviewStylesheets, dynamicOverviewStylesheets } from "../scripts/overview-css-check.mjs";

describe("overview release CSS guard", () => {
  it("checks only application CSS referenced by HTML, not external or stale chunks", () => {
    expect(overviewStylesheets('<link href="/_next/static/chunks/new.css"/><link href="/_next/static/chunks/new.css"/><link href="https://fonts.example/font.css"/>')).toEqual(["/_next/static/chunks/new.css"]);
  });
  it("reads active entry stylesheets when authenticated appearance makes the homepage dynamic", () => {
    const manifest = 'globalThis.__RSC_MANIFEST["/page"] = ' + JSON.stringify({ entryCSSFiles: { "[project]/src/app/layout": [{ path: "static/chunks/current.css" }], "unrelated": [{ path: "static/chunks/stale.css" }] } }) + ';';
    expect(dynamicOverviewStylesheets(manifest)).toEqual(["/_next/static/chunks/current.css"]);
  });
  it("rejects a healthy server serving the old visual stylesheet", () => {
    expect(() => assertOverviewCss(".atelier-card{border:1px solid red}")).toThrow("Overview stylesheet missing");
    expect(() => assertOverviewCss(".overview-card{}.overview-metric{}.overview-chart{}.overview-shell{}.overview-table-scroll{}")).not.toThrow();
  });
});
