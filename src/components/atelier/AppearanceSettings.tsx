"use client";
import { useEffect, useState } from "react";
import { DEFAULT_APPEARANCE, applyAppearance, validAppearance, type Appearance } from "@/lib/appearance";
export function AppearanceSettings() {
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/me/appearance").then(r => r.json()).then(body => { if (validAppearance(body.appearance)) { setValue(body.appearance); applyAppearance(body.appearance); } }).catch(() => setError("دریافت تنظیمات ظاهر ممکن نشد.")).finally(() => setLoading(false)); }, []);
  async function save(next: Appearance) {
    const previous = value; setValue(next); applyAppearance(next); setSaving(true); setError("");
    try { const response = await fetch("/api/me/appearance", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }); if (!response.ok) throw new Error(); }
    catch { setValue(previous); applyAppearance(previous); setError("ذخیره ظاهر انجام نشد؛ دوباره تلاش کنید."); } finally { setSaving(false); }
  }
  return <section className="atelier-panel space-y-4 p-5"><h2 className="font-bold">ظاهر و رنگ‌بندی</h2><label className="block">حالت نمایش<select className="atelier-input mx-3" value={value.theme} disabled={saving || loading} onChange={e => void save({ ...value, theme: e.target.value as Appearance["theme"] })}><option value="light">روشن</option><option value="dark">تیره</option></select></label><fieldset disabled={saving || loading}><legend>رنگ مکمل</legend><div className="my-3 flex flex-wrap gap-3">{["#b91c1c", "#1d4ed8", "#047857", "#7e22ce", "#c2410c"].map(accent => <button type="button" key={accent} aria-label={`رنگ ${accent}`} aria-pressed={value.accent === accent} className="h-10 w-10 rounded-full border-2" style={{ background: accent, outline: value.accent === accent ? "2px solid var(--text-primary)" : undefined, outlineOffset: 3 }} onClick={() => void save({ ...value, accent })} />)}</div><label>رنگ دلخواه <input type="color" value={value.accent} onChange={e => void save({ ...value, accent: e.target.value })} /></label></fieldset><button disabled={saving || loading} type="button" className="atelier-button" onClick={() => void save({ ...DEFAULT_APPEARANCE })}>بازگشت به پیش‌فرض</button><p role="status">{loading ? "در حال دریافت ظاهر…" : saving ? "در حال ذخیره…" : error || "تغییرات به‌صورت خودکار ذخیره می‌شوند."}</p></section>;
}
