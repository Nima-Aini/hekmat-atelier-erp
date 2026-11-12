import { cookies } from "next/headers";
import { DEFAULT_APPEARANCE, validAppearance, accentForeground } from "@/lib/appearance";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-vazirmatn",
});

export const metadata: Metadata = {
  title: "حکمت آتلیه | Hekmat Atelier",
  description: "سیستم یکپارچه قرارداد، برنامه‌ریزی، مشتریان و تجهیزات آتلیه",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let appearance = { ...DEFAULT_APPEARANCE } as import("@/lib/appearance").Appearance;
  try { const saved = JSON.parse((await cookies()).get("atelier_appearance")?.value || "null"); if (validAppearance(saved)) appearance = saved; } catch { /* use default */ }
  return (
    <html lang="fa" dir="rtl" data-theme={appearance.theme} style={{ "--accent": appearance.accent, "--accent-foreground": accentForeground(appearance.accent) } as React.CSSProperties} className={vazirmatn.variable}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
      </head>
      <body className={`${vazirmatn.className} text-zinc-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
