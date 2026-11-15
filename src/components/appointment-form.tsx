"use client";

import { CalendarPlus } from "lucide-react";
import { useActionState } from "react";
import type { FormState } from "@/lib/validation";
import { AssigneeSelect, type AssignableMember } from "./assignee-select";
import { ButtonLink } from "./ui/button";
import { TextAreaField, TextField } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

export interface AppointmentFormValues {
  doctorName: string;
  specialty: string;
  location: string;
  date: string;
  time: string;
  notes: string;
  assigneeId: string;
}

export function AppointmentForm({
  action,
  defaultDate,
  initial,
  members = [],
  canAssign = false,
  submitLabel = "Save appointment",
  cancelHref,
}: {
  action: FormAction;
  defaultDate: string;
  /** Existing values when editing. */
  initial?: AppointmentFormValues;
  members?: AssignableMember[];
  canAssign?: boolean;
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (key: keyof AppointmentFormValues, fallback = "") => state.values?.[key] ?? initial?.[key] ?? fallback;

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Doctor or clinic"
          name="doctorName"
          required
          placeholder="e.g. Dr. Mehta"
          defaultValue={value("doctorName")}
          error={state.errors?.doctorName}
        />
        <TextField
          label="Speciality (optional)"
          name="specialty"
          placeholder="e.g. Cardiologist"
          defaultValue={value("specialty")}
          error={state.errors?.specialty}
        />
        <TextField
          label="Date"
          name="date"
          type="date"
          required
          defaultValue={value("date", defaultDate)}
          error={state.errors?.date}
        />
        <TextField
          label="Time"
          name="time"
          type="time"
          required
          defaultValue={value("time", "10:00")}
          error={state.errors?.time}
        />
      </div>
      <TextField
        label="Address (optional)"
        name="location"
        placeholder="Hospital, floor, room"
        defaultValue={value("location")}
        error={state.errors?.location}
      />
      <TextAreaField
        label="Notes (optional)"
        name="notes"
        placeholder="Reports to carry, questions to ask, fasting needed…"
        defaultValue={value("notes")}
        error={state.errors?.notes}
      />
      <AssigneeSelect
        label="Who is taking care of this visit?"
        hint="For example, who goes along. They’ll see it in their responsibilities."
        members={members}
        defaultValue={value("assigneeId")}
        error={state.errors?.assigneeId}
        canAssign={canAssign}
      />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} size="lg">
          <CalendarPlus aria-hidden="true" /> {submitLabel}
        </SubmitButton>
        {cancelHref ? (
          <ButtonLink href={cancelHref} variant="ghost" size="lg">
            Cancel
          </ButtonLink>
        ) : null}
      </div>
    </form>
  );
}
