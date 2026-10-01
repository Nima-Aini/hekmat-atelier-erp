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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
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
