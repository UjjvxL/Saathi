"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-3xl border border-stone-200/80 bg-white p-9 text-center shadow-soft">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-stone-600">
          Sorry, that didn’t work. Please try again. If it keeps happening, check your internet connection.
        </p>
        {digest ? <p className="mt-2 font-mono text-xs text-stone-500">Reference: {digest}</p> : null}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()} size="lg">
          <RefreshCw aria-hidden="true" /> Try again
        </Button>
        <ButtonLink href="/dashboard" variant="secondary" size="lg">
          My care circles
        </ButtonLink>
      </div>
    </div>
  );
}
