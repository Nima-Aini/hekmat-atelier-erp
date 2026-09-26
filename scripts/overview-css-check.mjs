import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function overviewStylesheets(html) {
  return [...new Set([...html.matchAll(/href="(\/_next\/static\/[^"?]+\.css)(?:\?[^\"]*)?"/g)].map((match) => match[1]))];
}

export function assertOverviewCss(css) {
  for (const selector of [".overview-card", ".overview-metric", ".overview-chart", ".overview-shell", ".overview-table-scroll"]) {
    if (!css.includes(selector)) throw new Error(`Overview stylesheet missing ${selector}; refusing a visually incomplete release.`);
  }
}

export async function checkBuiltOverviewCss() {
  const html = await readFile(resolve(".next/server/app/index.html"), "utf8");
  const paths = overviewStylesheets(html);
  if (!paths.length) throw new Error("No application stylesheets referenced by the production homepage.");
  const css = await Promise.all(paths.map((path) => readFile(resolve(".next", path.slice("/_next/".length)), "utf8")));
  assertOverviewCss(css.join("\n"));
  console.log("overview.css.build=verified");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await checkBuiltOverviewCss();
