export const DEFAULT_APPEARANCE = { theme: "dark", accent: "#b91c1c" } as const;
export type Appearance = { theme: "light" | "dark"; accent: string };
export function validAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== "object") return false;
  const row = value as Appearance;
  return ["light", "dark"].includes(row.theme) && /^#[0-9a-f]{6}$/i.test(row.accent);
}
export function accentForeground(hex: string) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .179 ? "#000000" : "#ffffff";
}
export function applyAppearance(value: Appearance) {
  document.documentElement.dataset.theme = value.theme;
  document.documentElement.style.setProperty("--accent", value.accent);
  document.documentElement.style.setProperty("--accent-foreground", accentForeground(value.accent));
}
