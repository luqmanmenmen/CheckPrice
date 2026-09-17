"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Package, UploadCloud } from "lucide-react";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/login");

  if (isAuth) {
    return (
      <main className="w-full min-h-screen">
        {children}
      </main>
    );
  }

  return (
    <>
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-blue-600 flex items-center gap-2">
            <Package className="w-6 h-6" />
            <span>PriceCheck</span>
          </Link>
          <nav className="flex gap-4">
            <Link href="/upload" className="flex flex-col items-center text-xs text-slate-500 hover:text-blue-600">
              <UploadCloud className="w-5 h-5 mb-1" />
              Update Data
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-md mx-auto w-full p-4 bg-white shadow-sm min-h-[calc(100vh-64px)]">
        {children}
      </main>
    </>
  );
}
