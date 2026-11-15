"use client";

import { CalendarPlus } from "lucide-react";
import { useActionState } from "react";
import type { FormState } from "@/lib/validation";
import { TextAreaField, TextField } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function AppointmentForm({ action, defaultDate }: { action: FormAction; defaultDate: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (key: string, fallback = "") => state.values?.[key] ?? fallback;

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
      <SubmitButton pending={pending} size="lg">
        <CalendarPlus aria-hidden="true" /> Save appointment
      </SubmitButton>
    </form>
  );
}
