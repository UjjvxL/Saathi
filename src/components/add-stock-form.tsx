"use client";

import { PackagePlus } from "lucide-react";
import { useActionState, useId } from "react";
import type { FormState } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { inputStyles } from "./ui/field";
import { SubmitButton } from "./ui/form-bits";

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function AddStockForm({ action, medicineName }: { action: FormAction; medicineName: string }) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {});
  const error = state.errors?.amount?.[0] ?? (!state.ok ? state.message : undefined);

  return (
    <form action={formAction} className="space-y-1.5 rounded-xl bg-stone-50 p-3">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        Refilled? Add to stock
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name="amount"
          type="number"
          min={1}
          max={10000}
          inputMode="numeric"
          placeholder="e.g. 30"
          required
          aria-label={`Number of ${medicineName} to add`}
          className={cn(inputStyles, "max-w-32 bg-white")}
        />
        <SubmitButton pending={pending} variant="secondary" pendingLabel="Adding…">
          <PackagePlus aria-hidden="true" /> Add
        </SubmitButton>
      </div>
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      {state.ok && state.message ? (
        <p role="status" className="text-sm font-medium text-emerald-800">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
