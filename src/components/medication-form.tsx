"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useId, useState, type ReactNode } from "react";
import { MED_FORMS, WEEKDAYS, type Frequency } from "@/lib/constants";
import { formatTime12h } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FormState } from "@/lib/validation";
import { Button, ButtonLink } from "./ui/button";
import { choiceCardStyles, FieldError, SelectField, TextField } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

export interface MedicationFormValues {
  name: string;
  dosage: string;
  form: string;
  instructions: string;
  times: string[];
  frequency: Frequency;
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
  stock: string;
  unitsPerDose: string;
  refillThreshold: string;
}

type TextKey = Exclude<keyof MedicationFormValues, "times" | "daysOfWeek" | "frequency">;
type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

const TIME_PRESETS = [
  { label: "Morning", time: "08:00" },
  { label: "Afternoon", time: "14:00" },
  { label: "Evening", time: "20:00" },
  { label: "Bedtime", time: "22:00" },
];
const INSTRUCTION_SUGGESTIONS = ["After food", "Before food", "Empty stomach", "With water", "With milk", "At bedtime"];
const MAX_TIMES = 8;

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-stone-100 pt-7 first:border-0 first:pt-0 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h3 className="font-semibold tracking-tight text-stone-900">{title}</h3>
        {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

export function MedicationForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: FormAction;
  initial: MedicationFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const baseId = useId();
  const [state, formAction, pending] = useActionState(action, {});
  const [times, setTimes] = useState<string[]>(initial.times.length ? initial.times : ["08:00"]);
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [days, setDays] = useState<number[]>(initial.daysOfWeek);
  const value = (key: TextKey) => state.values?.[key] ?? initial[key];

  const addTime = (time: string) => setTimes((current) => (current.length >= MAX_TIMES ? current : [...current, time]));
  const toggleDay = (day: number) =>
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage state={state} />

      <Section title="Medicine" description="As written on the strip or prescription.">
        <TextField
          label="Medicine name"
          name="name"
          required
          autoComplete="off"
          defaultValue={value("name")}
          error={state.errors?.name}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Dose / strength"
            name="dosage"
            placeholder="e.g. 500 mg, 5 ml"
            defaultValue={value("dosage")}
            error={state.errors?.dosage}
          />
          <SelectField label="Form" name="form" defaultValue={value("form")} error={state.errors?.form}>
            {MED_FORMS.map((form) => (
              <option key={form} value={form}>
                {capitalize(form)}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField
          label="Instructions"
          name="instructions"
          list={`${baseId}-suggestions`}
          placeholder="e.g. After food"
          defaultValue={value("instructions")}
          error={state.errors?.instructions}
        />
        <datalist id={`${baseId}-suggestions`}>
          {INSTRUCTION_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </Section>

      <Section title="When to take it" description="Times follow the elder’s timezone.">
        <fieldset className="space-y-3">
          <legend className="mb-3 text-[0.95rem] font-medium text-stone-800">Times each day</legend>
          <ul className="flex flex-wrap gap-2">
            {times.map((time, index) => (
              <li key={index} className="flex items-center rounded-xl border border-stone-300 bg-white pl-1 shadow-xs">
                <label htmlFor={`${baseId}-time-${index}`} className="sr-only">
                  Time {index + 1}
                </label>
                <input
                  id={`${baseId}-time-${index}`}
                  type="time"
                  name="times"
                  required
                  value={time}
                  onChange={(event) =>
                    setTimes((current) => current.map((t, i) => (i === index ? event.target.value : t)))
                  }
                  className="h-11 rounded-lg bg-transparent px-2 text-base tabular-nums focus:outline-none"
                />
                {times.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setTimes((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove time ${index + 1}`}
                    className="mr-1 flex size-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="w-2" />
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {TIME_PRESETS.map((preset) => (
              <Button
                key={preset.time}
                size="sm"
                variant="secondary"
                disabled={times.includes(preset.time) || times.length >= MAX_TIMES}
                onClick={() => addTime(preset.time)}
              >
                <Plus aria-hidden="true" /> {preset.label} · {formatTime12h(preset.time)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" disabled={times.length >= MAX_TIMES} onClick={() => addTime("12:00")}>
              <Plus aria-hidden="true" /> Other time
            </Button>
          </div>
          <FieldError id={`${baseId}-times-error`} error={state.errors?.times} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[0.95rem] font-medium text-stone-800">How often</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["daily", "Every day"],
                ["specific_days", "Only on some days"],
              ] as const
            ).map(([option, label]) => (
              <label key={option} className={cn(choiceCardStyles, "items-center")}>
                <input
                  type="radio"
                  name="frequency"
                  value={option}
                  checked={frequency === option}
                  onChange={() => setFrequency(option)}
                  className="size-4 accent-stone-900"
                />
                <span className="font-medium text-stone-900">{label}</span>
              </label>
            ))}
          </div>
          {frequency === "specific_days" ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Days of the week">
              {WEEKDAYS.map((day) => (
                <label
                  key={day.value}
                  className="flex h-11 min-w-14 cursor-pointer items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400 has-checked:border-stone-900 has-checked:bg-stone-900 has-checked:text-white has-focus-visible:ring-4 has-focus-visible:ring-stone-900/15"
                >
                  <input
                    type="checkbox"
                    name="daysOfWeek"
                    value={day.value}
                    checked={days.includes(day.value)}
                    onChange={() => toggleDay(day.value)}
                    className="sr-only"
                  />
                  <span aria-hidden="true">{day.short}</span>
                  <span className="sr-only">{day.long}</span>
                </label>
              ))}
            </div>
          ) : null}
          <FieldError id={`${baseId}-days-error`} error={state.errors?.daysOfWeek} />
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
          <TextField
            label="Start date"
            name="startDate"
            type="date"
            required
            defaultValue={value("startDate")}
            error={state.errors?.startDate}
          />
          <TextField
            label="End date (optional)"
            name="endDate"
            type="date"
            hint="Leave empty if it’s ongoing."
            defaultValue={value("endDate")}
            error={state.errors?.endDate}
          />
        </div>
      </Section>

      <Section title="Pill count" description="Optional. Get an email before they run out.">
        <div className="grid gap-5 sm:grid-cols-3 sm:items-end">
          <TextField
            label="In stock now"
            name="stock"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={value("stock")}
            error={state.errors?.stock}
          />
          <TextField
            label="Used per dose"
            name="unitsPerDose"
            type="number"
            min={0.25}
            step={0.25}
            defaultValue={value("unitsPerDose")}
            error={state.errors?.unitsPerDose}
          />
          <TextField
            label="Alert at or below"
            name="refillThreshold"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={value("refillThreshold")}
            error={state.errors?.refillThreshold}
          />
        </div>
      </Section>

      <div className="flex flex-wrap gap-3 border-t border-stone-100 pt-7">
        <SubmitButton pending={pending} size="lg">
          {submitLabel}
        </SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost" size="lg">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
