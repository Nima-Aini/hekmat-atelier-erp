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

export function dynamicOverviewStylesheets(manifest) {
  const marker = 'globalThis.__RSC_MANIFEST["/page"] = ';
  const text = manifest.slice(manifest.indexOf(marker) + marker.length).trim().replace(/;$/, "");
  const entries = JSON.parse(text).entryCSSFiles;
  return [...new Set(Object.entries(entries).filter(([name]) => name.endsWith("/src/app/layout") || name.endsWith("/src/app/page")).flatMap(([, rows]) => rows.map(row => row.path)).filter(path => /^static\/[^.][^?]*\.css$/.test(path) && !path.includes("..")))].map(path => `/_next/${path}`);
}

export async function checkBuiltOverviewCss() {
  let paths;
  try { const html = await readFile(resolve(".next/server/app/index.html"), "utf8"); paths = overviewStylesheets(html); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    // Personal appearance cookies make the homepage dynamic. Inspect only its
    // current build manifest, never arbitrary CSS left from an older build.
    const manifest = await readFile(resolve(".next/server/app/page_client-reference-manifest.js"), "utf8");
    paths = dynamicOverviewStylesheets(manifest);
  }
  if (!paths.length) throw new Error("No application stylesheets referenced by the production homepage.");
  const css = await Promise.all(paths.map((path) => readFile(resolve(".next", path.slice("/_next/".length)), "utf8")));
  assertOverviewCss(css.join("\n"));
  console.log("overview.css.build=verified");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await checkBuiltOverviewCss();
