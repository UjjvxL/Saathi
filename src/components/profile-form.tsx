"use client";

import { CircleCheck, KeyRound } from "lucide-react";
import { useActionState, useId } from "react";
import type { CreateProfileState } from "@/app/actions/profiles";
import { ROLE_LABELS, ROLES } from "@/lib/constants";
import type { ProfileDTO } from "@/lib/types";
import { CopyButton } from "./copy-button";
import { ButtonLink } from "./ui/button";
import { Notice } from "./ui/feedback";
import { choiceCardStyles, FieldError, SelectField, TextField } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

type ProfileAction = (state: CreateProfileState, formData: FormData) => Promise<CreateProfileState>;

const RELATIONSHIP_HELP: Record<(typeof ROLES)[number], string> = {
  elder: "This profile is for me",
  caretaker: "I look after them (nurse, attendant, helper)",
  family: "I’m family (son, daughter, relative)",
};

export function ProfileForm({
  mode,
  action,
  profile,
  timezones,
  defaultTimezone,
}: {
  mode: "create" | "edit";
  action: ProfileAction;
  profile?: ProfileDTO;
  timezones: string[];
  defaultTimezone: string;
}) {
  const errorId = useId();
  const [state, formAction, pending] = useActionState(action, {});

  if (mode === "create" && state.ok && state.profileId && state.careId && state.passcode) {
    return <CreatedPanel profileId={state.profileId} careId={state.careId} passcode={state.passcode} />;
  }

  const value = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  const relationship = state.values?.relationship ?? "family";

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <TextField
        label="Elder’s full name"
        name="name"
        required
        autoComplete="off"
        defaultValue={value("name", profile?.name ?? "")}
        error={state.errors?.name}
      />

      {mode === "create" ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-[0.95rem] font-medium text-stone-800">How are you related?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ROLES.map((role) => (
              <label key={role} className={choiceCardStyles}>
                <input
                  type="radio"
                  name="relationship"
                  value={role}
                  defaultChecked={relationship === role}
                  className="mt-1 size-4 accent-stone-900"
                />
                <span>
                  <span className="block font-medium text-stone-900">{ROLE_LABELS[role]}</span>
                  <span className="block text-sm text-stone-600">{RELATIONSHIP_HELP[role]}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError id={errorId} error={state.errors?.relationship} />
        </fieldset>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
        <TextField
          label="Elder’s email (optional)"
          name="elderEmail"
          type="email"
          autoComplete="off"
          hint="Medicine reminders go here, even if they never log in."
          defaultValue={value("elderEmail", profile?.elderEmail ?? "")}
          error={state.errors?.elderEmail}
        />
        <TextField
          label="Date of birth (optional)"
          name="dateOfBirth"
          type="date"
          defaultValue={value("dateOfBirth", profile?.dateOfBirth ?? "")}
          error={state.errors?.dateOfBirth}
        />
      </div>

      <SelectField
        label="Timezone"
        name="timezone"
        hint="Medicine times follow the elder’s local time."
        defaultValue={value("timezone", profile?.timezone ?? defaultTimezone)}
        error={state.errors?.timezone}
      >
        {timezones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
        <TextField
          label="Health conditions (optional)"
          name="conditions"
          hint="Separate with commas, e.g. Diabetes, High BP"
          defaultValue={value("conditions", profile?.conditions.join(", ") ?? "")}
          error={state.errors?.conditions}
        />
        <TextField
          label="Allergies (optional)"
          name="allergies"
          hint="e.g. Penicillin, Peanuts"
          defaultValue={value("allergies", profile?.allergies.join(", ") ?? "")}
          error={state.errors?.allergies}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
        <TextField
          label="Emergency contact name (optional)"
          name="emergencyContactName"
          defaultValue={value("emergencyContactName", profile?.emergencyContactName ?? "")}
          error={state.errors?.emergencyContactName}
        />
        <TextField
          label="Emergency contact phone (optional)"
          name="emergencyContactPhone"
          type="tel"
          autoComplete="off"
          defaultValue={value("emergencyContactPhone", profile?.emergencyContactPhone ?? "")}
          error={state.errors?.emergencyContactPhone}
        />
      </div>

      <SubmitButton pending={pending} size="lg" pendingLabel={mode === "create" ? "Creating…" : "Saving…"}>
        {mode === "create" ? "Create care profile" : "Save details"}
      </SubmitButton>
    </form>
  );
}

function CreatedPanel({ profileId, careId, passcode }: { profileId: string; careId: string; passcode: string }) {
  const invite = `Join our family care circle on Saathi: {origin}/join\nCare ID: ${careId}\nPasscode: ${passcode}`;
  return (
    <div className="space-y-6">
      <Notice tone="success" icon={<CircleCheck aria-hidden="true" />} title="Care profile created">
        Share these with family members and caretakers so they can join.
      </Notice>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <dt className="text-sm font-medium text-stone-500">Care ID</dt>
          <dd className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] text-stone-900">{careId}</dd>
        </div>
        <div className="rounded-2xl border border-stone-900 bg-white p-5">
          <dt className="flex items-center gap-2 text-sm font-medium text-stone-500">
            <KeyRound className="size-4" aria-hidden="true" /> Passcode
          </dt>
          <dd className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] text-stone-900">{passcode}</dd>
        </div>
      </dl>
      <Notice tone="warning">
        Note the passcode down now. For security it isn’t stored and won’t be shown again. Admins can create a new one
        any time from the Care circle page.
      </Notice>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/p/${profileId}`} size="lg">
          Open care profile
        </ButtonLink>
        <CopyButton text={invite} label="Copy invite message" />
      </div>
    </div>
  );
}
