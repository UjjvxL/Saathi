import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft sm:p-6", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  icon,
  actions,
  as: Heading = "h2",
  id,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  id?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 [&_svg]:size-[1.1rem]">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <Heading id={id} className="text-lg font-semibold tracking-tight text-stone-900">
            {title}
          </Heading>
          {description ? <div className="mt-0.5 text-[0.95rem] text-stone-600">{description}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
