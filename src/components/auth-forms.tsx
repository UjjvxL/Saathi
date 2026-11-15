"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { login, requestPasswordReset, resetPassword, signup } from "@/app/actions/auth";
import type { FormState } from "@/lib/validation";
import { Notice } from "./ui/feedback";
import { TextField } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

// `next` is read from the URL on the server (see the login/signup pages), so these forms are part of the
// server-rendered HTML and work even before JavaScript has loaded.

function FooterLink({ children, href, label }: { children: string; href: string; label: string }) {
  return (
    <p className="mt-7 text-center text-stone-600">
      {children}{" "}
      <Link href={href} className="font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-900">
        {label}
      </Link>
    </p>
  );
}

export function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const [state, formAction, pending] = useActionState(login, {});

  return (
    <>
      <form action={formAction} className="space-y-5">
        {expired ? <Notice tone="info">Please log in again to continue.</Notice> : null}
        <FormMessage state={state} />
        <input type="hidden" name="next" value={next} />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <div className="space-y-1.5">
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            error={state.errors?.password}
          />
          <p className="text-right text-sm">
            <Link href="/forgot-password" className="text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
        <SubmitButton pending={pending} pendingLabel="Logging in…" size="lg" className="w-full">
          Log in
        </SubmitButton>
      </form>
      <FooterLink href={`/signup?next=${encodeURIComponent(next)}`} label="Create an account">
        New to Saathi?
      </FooterLink>
    </>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signup, {});

  return (
    <>
      <form action={formAction} className="space-y-5">
        <FormMessage state={state} />
        <input type="hidden" name="next" value={next} />
        <TextField
          label="Your name"
          name="name"
          autoComplete="name"
          required
          defaultValue={state.values?.name}
          error={state.errors?.name}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          hint="Reminders and alerts are sent here."
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          error={state.errors?.password}
        />
        <SubmitButton pending={pending} pendingLabel="Creating account…" size="lg" className="w-full">
          Create account
        </SubmitButton>
      </form>
      <FooterLink href={`/login?next=${encodeURIComponent(next)}`} label="Log in">
        Already have an account?
      </FooterLink>
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {});

  if (state.ok) {
    return (
      <>
        <Notice tone="success" icon={<CircleCheck aria-hidden="true" />} title="Check your email">
          {state.message}
        </Notice>
        <FooterLink href="/login" label="Back to log in">
          Remembered it?
        </FooterLink>
      </>
    );
  }

  return (
    <>
      <form action={formAction} className="space-y-5">
        <FormMessage state={state} />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <SubmitButton pending={pending} pendingLabel="Sending…" size="lg" className="w-full">
          Send reset link
        </SubmitButton>
      </form>
      <FooterLink href="/login" label="Back to log in">
        Remembered it?
      </FooterLink>
    </>
  );
}

type ResetAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function ResetPasswordForm({ token }: { token: string }) {
  const action: ResetAction = resetPassword.bind(null, token);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters. You’ll be signed out on other devices."
        error={state.errors?.password}
      />
      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.confirmPassword}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…" size="lg" className="w-full">
        Save new password
      </SubmitButton>
    </form>
  );
}
