"use client";

import { KeyRound, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import type { PasscodeState } from "@/app/actions/profiles";
import { CopyButton } from "./copy-button";
import { Notice } from "./ui/feedback";
import { SubmitButton } from "./ui/form-bits";

type PasscodeAction = (state: PasscodeState, formData: FormData) => Promise<PasscodeState>;

export function PasscodePanel({
  careId,
  elderName,
  action,
  canRegenerate,
  updatedLabel,
}: {
  careId: string;
  elderName: string;
  action: PasscodeAction;
  canRegenerate: boolean;
  updatedLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const invite = state.passcode
    ? `Join ${elderName}’s care circle on Saathi: {origin}/join\nCare ID: ${careId}\nPasscode: ${state.passcode}`
    : "";

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <dt className="text-sm text-stone-500">Care ID</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em] text-stone-900">{careId}</dd>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <dt className="flex items-center gap-1.5 text-sm text-stone-500">
            <KeyRound className="size-3.5" aria-hidden="true" /> Passcode
          </dt>
          <dd className="mt-1">
            {state.passcode ? (
              <span className="font-mono text-2xl font-semibold tracking-[0.2em] text-stone-900">{state.passcode}</span>
            ) : (
              <span className="text-[0.95rem] text-stone-600">Hidden · set {updatedLabel}</span>
            )}
          </dd>
        </div>
      </dl>

      {state.passcode ? (
        <>
          <Notice tone="warning">
            This new passcode is shown only once. The old passcode no longer works. People already in the circle stay in.
          </Notice>
          <CopyButton text={invite} label="Copy invite message" />
        </>
      ) : null}
      {state.message && !state.ok ? <Notice tone="error">{state.message}</Notice> : null}

      {canRegenerate ? (
        <form
          action={formAction}
          onSubmit={(event) => {
            if (!window.confirm("Create a new passcode? The old one will stop working for new members.")) {
              event.preventDefault();
            }
          }}
        >
          <SubmitButton pending={pending} variant="secondary" pendingLabel="Generating…">
            <RefreshCw aria-hidden="true" /> {state.passcode ? "Generate another" : "Generate a new passcode to share"}
          </SubmitButton>
        </form>
      ) : (
        <p className="text-[0.95rem] text-stone-500">Ask an admin of this circle for the passcode to invite someone.</p>
      )}
    </div>
  );
}
