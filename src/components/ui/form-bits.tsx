"use client";

import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import type { FormState } from "@/lib/validation";
import { Button } from "./button";
import { Notice } from "./feedback";

export function SubmitButton({
  pending,
  pendingLabel = "Saving…",
  children,
  ...props
}: ComponentProps<typeof Button> & { pending: boolean; pendingLabel?: string }) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/** Shows the top-level message from a server action (field errors are shown next to each field). */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>;
}
