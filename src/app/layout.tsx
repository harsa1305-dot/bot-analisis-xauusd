import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XAU/USD AI Signal Terminal | 24/7 Gold Quant & Gemini 2.5 Flash",
  description:
    "Terminal analisa sinyal emas (XAU/USD) berbasis matematika teknikal (EMA 50/200, RSI 14, ATR 14, Key Levels) dan penalaran Google Gemini 2.5 Flash.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className="min-h-screen bg-[#090C10] text-slate-100 antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}

