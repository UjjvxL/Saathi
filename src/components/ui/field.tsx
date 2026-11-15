import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputStyles =
  "block w-full min-h-12 rounded-xl border border-stone-300 bg-white px-4 py-2 text-base text-stone-900 shadow-xs transition-[border-color,box-shadow] placeholder:text-stone-500 hover:border-stone-400 focus:border-stone-900 focus:outline-none focus:ring-4 focus:ring-stone-900/10 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/10 disabled:bg-stone-100";

interface FieldBaseProps {
  label: string;
  name: string;
  error?: string[];
  hint?: ReactNode;
  className?: string;
}

function describedBy(id: string, hint: ReactNode, error?: string[]): string | undefined {
  return [hint ? `${id}-hint` : null, error?.length ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-[0.95rem] font-medium text-stone-800">
      {children}
      {required ? (
        <span className="text-red-600" aria-hidden="true">
          {" "}
          *
        </span>
      ) : null}
    </label>
  );
}

export function FieldError({ id, error }: { id: string; error?: string[] }) {
  if (!error?.length) return null;
  return (
    <p id={id} className="text-sm font-medium text-red-700">
      {error[0]}
    </p>
  );
}

function FieldHint({ id, hint }: { id: string; hint?: ReactNode }) {
  if (!hint) return null;
  return (
    <p id={id} className="text-sm text-stone-600">
      {hint}
    </p>
  );
}

export function TextField({
  label,
  name,
  error,
  hint,
  className,
  id,
  required,
  ...props
}: FieldBaseProps & Omit<ComponentProps<"input">, "name">) {
  const autoId = useId();
  const inputId = id ?? `${name}-${autoId}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <FieldLabel htmlFor={inputId} required={required}>
        {label}
      </FieldLabel>
      <FieldHint id={`${inputId}-hint`} hint={hint} />
      <input
        id={inputId}
        name={name}
        required={required}
        aria-invalid={error?.length ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={inputStyles}
        {...props}
      />
      <FieldError id={`${inputId}-error`} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  className,
  id,
  required,
  children,
  ...props
}: FieldBaseProps & Omit<ComponentProps<"select">, "name">) {
  const autoId = useId();
  const inputId = id ?? `${name}-${autoId}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <FieldLabel htmlFor={inputId} required={required}>
        {label}
      </FieldLabel>
      <FieldHint id={`${inputId}-hint`} hint={hint} />
      <select
        id={inputId}
        name={name}
        required={required}
        aria-invalid={error?.length ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={inputStyles}
        {...props}
      >
        {children}
      </select>
      <FieldError id={`${inputId}-error`} error={error} />
    </div>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  className,
  id,
  required,
  ...props
}: FieldBaseProps & Omit<ComponentProps<"textarea">, "name">) {
  const autoId = useId();
  const inputId = id ?? `${name}-${autoId}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <FieldLabel htmlFor={inputId} required={required}>
        {label}
      </FieldLabel>
      <FieldHint id={`${inputId}-hint`} hint={hint} />
      <textarea
        id={inputId}
        name={name}
        required={required}
        rows={3}
        aria-invalid={error?.length ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={cn(inputStyles, "py-3")}
        {...props}
      />
      <FieldError id={`${inputId}-error`} error={error} />
    </div>
  );
}

/** Large selectable card used for radio groups (relationship, frequency). */
export const choiceCardStyles =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3.5 transition-colors hover:border-stone-300 has-checked:border-stone-900 has-checked:bg-stone-50 has-checked:ring-1 has-checked:ring-stone-900 has-focus-visible:ring-4 has-focus-visible:ring-stone-900/15";
