import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-5 text-center">
      <Link href="/" aria-label="Saathi home" className="rounded-lg">
        <Logo />
      </Link>
      <div>
        <p className="font-mono text-sm text-stone-500">404</p>
        <h1 className="mt-2 font-serif text-5xl tracking-tight">Page not found</h1>
        <p className="mt-4 text-lg text-stone-600">
          This page doesn’t exist, or you don’t have access to it. If someone shared a care circle with you, join it with
          the Care ID and passcode.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/dashboard" size="lg">
          My care circles
        </ButtonLink>
        <ButtonLink href="/join" size="lg" variant="secondary">
          Join with passcode
        </ButtonLink>
      </div>
    </main>
  );
}
