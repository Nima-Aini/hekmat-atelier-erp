import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.UX_BASE_URL || "http://127.0.0.1:3310";
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || process.env.UX_DISPOSABLE_DATABASE !== "true") throw new Error("Browser mutation checks require an explicitly disposable local database.");
if (!process.env.UX_ADMIN_USERNAME || !process.env.UX_ADMIN_PASSWORD) throw new Error("Explicit disposable administrator credentials are required.");
const browser = await chromium.launch({ executablePath: process.env.UX_CHROMIUM_PATH, headless: true, args: ["--no-sandbox", ...(process.env.UX_SINGLE_PROCESS === "true" ? ["--single-process", "--no-zygote", "--disable-dev-shm-usage", "--disable-gpu", "--disable-software-rasterizer"] : [])] });

async function verifyOverviewTheme(page, theme) {
 await page.goto(base);
 await page.locator(".overview-page").waitFor();
 for (const width of [360, 390, 768, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  const colors = await page.locator(".overview-page").evaluate(el => {
   const channel = value => {
    const normalized = value / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
   };
   const luminance = color => {
    const [red, green, blue] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel);
    return .2126 * red + .7152 * green + .0722 * blue;
   };
   const text = luminance(getComputedStyle(el).color);
   const background = luminance(getComputedStyle(document.body).backgroundColor);
   return {
    contrast: (Math.max(text, background) + .05) / (Math.min(text, background) + .05),
    theme: document.documentElement.dataset.theme,
   };
  });
  assert.equal(colors.theme, theme);
  assert.ok(colors.contrast >= 4.5, `Overview text contrast ${colors.contrast} in ${theme} at ${width}px`);
  await page.screenshot({ path: `/tmp/atelier-overview-${theme}-${width}.png`, fullPage: true });
 }
}

try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 const errors = []; page.on("pageerror", error => errors.push(error.message));
 await page.goto(`${base}/contracts`); await page.waitForURL(/employee-login/);
 await page.getByPlaceholder("نام کاربری یا شماره همراه").fill(process.env.UX_ADMIN_USERNAME);
 await page.locator('input[type="password"]').fill(process.env.UX_ADMIN_PASSWORD);
 await page.getByRole("button", { name: "ورود به حساب کاربری" }).click();
 await page.waitForURL(`${base}/contracts`);
 await page.goto(`${base}/appearance`);
 await Promise.all([page.waitForResponse(response => response.url().includes("/api/me/appearance") && response.request().method() === "PUT" && response.ok()), page.getByLabel("حالت نمایش").selectOption("light")]);
 await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
 await Promise.all([page.waitForResponse(response => response.url().includes("/api/me/appearance") && response.request().method() === "PUT" && response.ok()), page.getByRole("button", { name: "رنگ #1d4ed8", exact: true }).click()]);
 await page.reload(); await page.getByLabel("حالت نمایش").waitFor();
 assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
 assert.equal(await page.locator("html").evaluate(el => el.style.getPropertyValue("--accent")), "#1d4ed8");
 await verifyOverviewTheme(page, "light");
 const settings = await (await page.request.get(`${base}/api/atelier/settings`)).json();
 assert.equal(settings.success, true, settings.error || "Settings request failed");
 const response = await page.request.post(`${base}/api/atelier/contracts`, { data: { idempotencyKey: crypto.randomUUID(), projectTypeId: settings.projectTypes[0].id, customerName: "تست مرورگر", mobile: "09120000666", programDate: "2035-06-20T20:30:00Z", items: [{ title: "تست", unitPrice: 10000 }] } });
 const body = await response.json(); assert.equal(body.success, true, JSON.stringify(body));
 const id = body.contract.id;
 await page.goto(`${base}/contracts/${id}`);
 const time = page.getByRole("button", { name: "ساعت", exact: true }); await time.waitFor();
 assert.equal(await time.textContent().then(v => v.trim()), "00:00");
 await time.click(); await page.getByLabel("ساعت - ساعت", { exact: true }).selectOption("12"); await page.getByLabel("ساعت - دقیقه", { exact: true }).selectOption("34");
 await page.getByRole("button", { name: "تأیید", exact: true }).click();
 await page.getByRole("button", { name: "ذخیره قرارداد", exact: true }).click();
 await page.waitForURL(`${base}/contracts`);
 await page.goto(`${base}/contracts/${id}`); await time.waitFor(); assert.equal((await time.textContent()).trim(), "12:34");
 await page.reload(); await time.waitFor(); assert.equal((await time.textContent()).trim(), "12:34");
 await page.getByRole("button", { name: "بستن", exact: true }).first().click();
 await page.waitForURL(`${base}/contracts`);
 await page.getByRole("button", { name: /^مشتریان/ }).first().click(); await page.waitForURL(`${base}/customers`); await page.goBack(); await page.waitForURL(`${base}/contracts`); assert.equal(new URL(page.url()).pathname, "/contracts"); await page.goForward(); await page.waitForURL(`${base}/customers`); assert.equal(new URL(page.url()).pathname, "/customers");
 await page.getByRole("button", { name: "مشاهده مشتری تست مرورگر", exact: true }).click();
 await page.getByRole("button", { name: "ویرایش اطلاعات مشتری", exact: true }).click();
 await page.getByLabel("ایمیل", { exact: true }).fill("ux-customer@example.com");
 await page.getByLabel("یادداشت مشتری", { exact: true }).fill("یادداشت پرونده");
 await page.getByLabel("یادداشت آتلیه", { exact: true }).fill("یادداشت داخلی");
 const customerSaved = page.waitForResponse(response => response.url().includes("/api/atelier/customers/") && response.request().method() === "PUT" && response.ok());
 await page.getByRole("button", { name: "ذخیره", exact: true }).click();
 await customerSaved;
 await page.reload();
 for (const value of ["ux-customer@example.com", "یادداشت پرونده", "یادداشت داخلی"]) {
  await page.getByText(value, { exact: true }).waitFor();
 }

 const customerId = new URL(page.url()).pathname.split("/").at(-1);
 const ai = (action, data) => page.request.post(`${base}/api/ai`, { data: { action, ...data } });
 const propose = city => ai("prepare_operation", { operation: "customer_update", parameters: { targetId: customerId, input: { city } } });
 const customerCity = async () => (await (await page.request.get(`${base}/api/atelier/customers/${customerId}`)).json()).profile.customer.city;
 const beforeCity = await customerCity();
 const abandoned = (await (await propose("تهران")).json()).confirmation;
 assert.deepEqual(abandoned.comparison, [{ field: "شهر", before: beforeCity, after: "تهران" }]);
 assert.equal(await customerCity(), beforeCity);
 assert.equal((await ai("cancel_action", { confirmationId: abandoned.id })).status(), 200);
 assert.equal((await ai("execute_action", { confirmationId: abandoned.id, confirmed: true })).status(), 409);
 assert.equal(await customerCity(), beforeCity);

 const stale = (await (await propose("تبریز")).json()).confirmation;
 const competingChange = await page.request.put(`${base}/api/atelier/customers/${customerId}`, { data: { city: "کرج" } });
 assert.equal(competingChange.status(), 200);
 assert.equal((await ai("execute_action", { confirmationId: stale.id, confirmed: true })).status(), 409);
 assert.equal(await customerCity(), "کرج");

 const ready = (await (await propose("شیراز")).json()).confirmation;
 assert.equal((await ai("execute_action", { confirmationId: ready.id, confirmed: true })).status(), 200);
 assert.equal(await customerCity(), "شیراز");
 assert.equal((await ai("execute_action", { confirmationId: ready.id, confirmed: true })).status(), 409);

 await page.goto(`${base}/finance`);
 await page.getByRole("heading", { name: "مالی و گزارش‌ها", exact: true }).waitFor();
 const recordReceipt = page.getByRole("button", { name: "ثبت دریافت", exact: true });
 await recordReceipt.waitFor();
 assert.equal(await recordReceipt.count(), 1);
 await recordReceipt.click();
 await page.getByLabel("نوع دریافت", { exact: true }).selectOption("manual");
 await page.getByText("مشخصات دریافت آزاد", { exact: true }).waitFor();

 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto(`${base}/contracts/${id}`); await time.waitFor(); await time.click();
 assert.equal(await page.getByLabel("ساعت - ساعت", { exact: true }).isVisible(), true);
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
 await page.screenshot({ path: "/tmp/atelier-mobile-verified.png", fullPage: true });
 await page.goto(`${base}/appearance`); await Promise.all([page.waitForResponse(response => response.url().includes("/api/me/appearance") && response.request().method() === "PUT" && response.ok()), page.getByLabel("حالت نمایش").selectOption("dark")]);
 await page.reload(); assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
 await verifyOverviewTheme(page, "dark");
 assert.deepEqual(errors, []);
 console.log("UX browser smoke passed: authentication return URL, appearance persistence, contract deep links, time save/refresh, history and 390px mobile picker.");
} finally { await browser.close(); }
