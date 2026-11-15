"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import type { InsightSummaryState } from "@/app/actions/insights";
import { Notice } from "../ui/feedback";
import { SubmitButton } from "../ui/form-bits";

type SummaryAction = (state: InsightSummaryState, formData: FormData) => Promise<InsightSummaryState>;

/** "Write a friendly summary with Gemini": always labelled, safety-checked on the server. */
export function AiSummary({ action }: { action: SummaryAction }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div className="space-y-3">
      {state.summary ? (
        <figure className="rounded-xl border border-teal-200/80 bg-teal-50/60 px-4 py-3">
          <blockquote className="text-stone-800">{state.summary}</blockquote>
          <figcaption className="mt-2 text-sm text-stone-600">
            {state.source === "gemini"
              ? "Written by Gemini from the numbers above. It describes the routine only and isn’t medical advice."
              : "Saathi’s own summary of the numbers above."}
          </figcaption>
        </figure>
      ) : null}
      {state.message ? <Notice tone={state.ok ? "info" : "error"}>{state.message}</Notice> : null}
      <form action={formAction}>
        <SubmitButton pending={pending} pendingLabel="Writing a summary…" variant="secondary">
          <Sparkles aria-hidden="true" /> {state.summary ? "Write it again with Gemini" : "Write a friendly summary with Gemini"}
        </SubmitButton>
      </form>
    </div>
  );
}
