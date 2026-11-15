import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/dal";
import { Logo } from "./logo";
import { TextSizeToggle } from "./text-size-toggle";
import { ButtonLink } from "./ui/button";
import { Avatar, Skeleton } from "./ui/feedback";

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <ButtonLink href="/login" variant="secondary" size="sm">
        Log in
      </ButtonLink>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden items-center gap-2.5 pl-1 pr-2 sm:flex">
        <Avatar name={user.name} size="sm" />
        <span className="max-w-40 truncate text-sm font-medium text-stone-700">{user.name}</span>
      </span>
      <form method="post" action="/api/auth/logout">
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Log out</span>
          <span className="sr-only sm:hidden">Log out</span>
        </button>
      </form>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-stone-50/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/dashboard" className="rounded-lg" aria-label="Saathi home">
          <Logo />
        </Link>
        <div className="flex items-center gap-1.5">
          <TextSizeToggle />
          <Suspense fallback={<Skeleton className="h-10 w-28 rounded-full" />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
