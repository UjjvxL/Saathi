"use client";

import { useActionState, useId } from "react";
import { joinProfile } from "@/app/actions/profiles";
import { ROLE_LABELS, ROLES } from "@/lib/constants";
import { choiceCardStyles, FieldError, TextField } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

export function JoinForm() {
  const errorId = useId();
  const [state, formAction, pending] = useActionState(joinProfile, {});
  const relationship = state.values?.relationship ?? "family";

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Care ID"
          name="careId"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          placeholder="e.g. K7M2XQ"
          className="[&_input]:font-mono [&_input]:text-xl [&_input]:uppercase [&_input]:tracking-[0.2em]"
          defaultValue={state.values?.careId}
          error={state.errors?.careId}
        />
        <TextField
          label="Passcode"
          name="passcode"
          required
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="6 digits"
          className="[&_input]:font-mono [&_input]:text-xl [&_input]:tracking-[0.2em]"
          error={state.errors?.passcode}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-[0.95rem] font-medium text-stone-800">I’m joining as</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROLES.map((role) => (
            <label key={role} className={`${choiceCardStyles} items-center`}>
              <input
                type="radio"
                name="relationship"
                value={role}
                defaultChecked={relationship === role}
                className="size-4 accent-stone-900"
              />
              <span className="font-medium text-stone-900">{role === "elder" ? "The elder (myself)" : ROLE_LABELS[role]}</span>
            </label>
          ))}
        </div>
        <FieldError id={errorId} error={state.errors?.relationship} />
      </fieldset>

      <SubmitButton pending={pending} size="lg" pendingLabel="Checking…">
        Join care circle
      </SubmitButton>
    </form>
  );
}
