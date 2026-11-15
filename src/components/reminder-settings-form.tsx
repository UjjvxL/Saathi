"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation";
import { SelectField } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

const MISSED_OPTIONS = [15, 30, 45, 60, 90, 120];
const ESCALATE_OPTIONS = [30, 60, 90, 120, 180, 240];

function label(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function ReminderSettingsForm({
  action,
  missedAfterMinutes,
  escalateAfterMinutes,
}: {
  action: FormAction;
  missedAfterMinutes: number;
  escalateAfterMinutes: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const withCurrent = (options: number[], current: number) => [...new Set([...options, current])].sort((a, b) => a - b);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <SelectField
          label="Nudge the elder & caretakers after"
          name="missedAfterMinutes"
          defaultValue={String(state.values?.missedAfterMinutes ?? missedAfterMinutes)}
          error={state.errors?.missedAfterMinutes}
        >
          {withCurrent(MISSED_OPTIONS, missedAfterMinutes).map((minutes) => (
            <option key={minutes} value={minutes}>
              {label(minutes)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Alert the whole family after"
          name="escalateAfterMinutes"
          defaultValue={String(state.values?.escalateAfterMinutes ?? escalateAfterMinutes)}
          error={state.errors?.escalateAfterMinutes}
        >
          {withCurrent(ESCALATE_OPTIONS, escalateAfterMinutes).map((minutes) => (
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
