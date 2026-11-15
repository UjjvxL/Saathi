import type { ReactNode } from "react";

/** Shared frame for login, signup and password pages. */
export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-stone-200/80 bg-white p-7 shadow-lift sm:p-9">
      <h1 className="font-serif text-4xl leading-tight tracking-tight text-stone-900">{title}</h1>
      {description ? <p className="mb-7 mt-2 text-stone-600">{description}</p> : <div className="mb-7" />}
      {children}
    </div>
  );
}
