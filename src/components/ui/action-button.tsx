"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { buttonStyles, type ButtonSize, type ButtonVariant } from "./button";

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * A one-button form for a server action, with a pending state, an optional confirm
 * prompt, and the action's message shown right under the button.
 */
export function ActionButton({
  action,
  children,
  variant,
  size,
  className,
  formClassName,
  confirmMessage,
  pendingLabel,
  ariaLabel,
  showSuccessMessage = true,
}: {
  action: FormAction;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  formClassName?: string;
  confirmMessage?: string;
  pendingLabel?: string;
  ariaLabel?: string;
  showSuccessMessage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const showMessage = state.message && (!state.ok || showSuccessMessage);

  return (
    <form
      action={formAction}
      className={cn("flex flex-col gap-1", formClassName)}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        aria-label={ariaLabel}
        className={buttonStyles({ variant, size, className })}
      >
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      {showMessage ? (
        <p role="status" className={cn("text-sm font-medium", state.ok ? "text-emerald-800" : "text-red-700")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
