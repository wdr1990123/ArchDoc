import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppNav } from "@/components/AppNav";
import { zh } from "@/lib/i18n/zh";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: `${zh.app.name} — ${zh.app.tagline}`,
  description: zh.app.subtitle,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80 antialiased`}
      >
        <AppNav />
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
