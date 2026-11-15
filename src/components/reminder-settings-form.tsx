"use client";

import { useActionState } from "react";
import { ESCALATE_RANGE, FOLLOW_UP_RANGE } from "@/lib/constants";
import type { FormState } from "@/lib/validation";
import { SelectField } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

const FOLLOW_UP_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120];
const ESCALATE_OPTIONS = [20, 30, 45, 60, 90, 120, 180, 240];

function label(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function ReminderSettingsForm({
  action,
  followUpAfterMinutes,
  escalateAfterMinutes,
}: {
  action: FormAction;
  followUpAfterMinutes: number;
  escalateAfterMinutes: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const withCurrent = (options: number[], current: number, range: { min: number; max: number }) =>
    [...new Set([...options, current])].filter((m) => m >= range.min && m <= range.max).sort((a, b) => a - b);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <SelectField
          label="Send a follow-up reminder after"
          name="followUpAfterMinutes"
          hint="If the dose isn’t confirmed by then."
          defaultValue={String(state.values?.followUpAfterMinutes ?? followUpAfterMinutes)}
          error={state.errors?.followUpAfterMinutes}
        >
          {withCurrent(FOLLOW_UP_OPTIONS, followUpAfterMinutes, FOLLOW_UP_RANGE).map((minutes) => (
            <option key={minutes} value={minutes}>
              {label(minutes)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Alert the responsible caretaker after"
          name="escalateAfterMinutes"
          hint="The dose is then marked unconfirmed."
          defaultValue={String(state.values?.escalateAfterMinutes ?? escalateAfterMinutes)}
          error={state.errors?.escalateAfterMinutes}
        >
          {withCurrent(ESCALATE_OPTIONS, escalateAfterMinutes, ESCALATE_RANGE).map((minutes) => (
            <option key={minutes} value={minutes}>
              {label(minutes)}
            </option>
          ))}
        </SelectField>
      </div>
      <SubmitButton pending={pending}>Save reminder timing</SubmitButton>
    </form>
  );
}
