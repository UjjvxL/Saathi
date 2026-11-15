import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-stone-50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_60%)]"
      />
      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center px-5">
        <Link href="/" className="rounded-lg" aria-label="Saathi home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="relative flex flex-1 justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
