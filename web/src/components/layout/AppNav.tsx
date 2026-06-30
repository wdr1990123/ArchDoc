"use client";

import Link from "next/link";
import { zh } from "@/lib/i18n/zh";

export function AppNav() {
  const links = [
    { href: "/", label: zh.nav.home },
    { href: "/quick-start", label: zh.nav.quickStart },
    { href: "/settings", label: zh.nav.settings },
  ];

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-900">{zh.app.name}</span>
          <span className="hidden text-sm text-slate-500 sm:inline">{zh.app.tagline}</span>
        </Link>
        <nav className="flex gap-1 sm:gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
