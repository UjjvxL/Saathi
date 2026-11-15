import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "warning" | "ghost" | "link" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

// Filled variants keep at least 4.5:1 contrast with their text (WCAG AA).
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-stone-900 text-white shadow-sm hover:bg-stone-800",
  secondary: "border border-stone-300 bg-white text-stone-900 shadow-sm hover:border-stone-400 hover:bg-stone-50",
  success: "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  warning: "bg-amber-700 text-white shadow-sm hover:bg-amber-800",
  ghost: "text-stone-700 hover:bg-stone-100 hover:text-stone-900",
  link: "text-teal-800 underline-offset-4 hover:underline",
  /** For dark backgrounds. */
  inverse: "border border-white/25 bg-white/5 text-white hover:border-white/50 hover:bg-white/10",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-10 px-4 text-sm [&_svg]:size-4",
  md: "min-h-12 px-5 text-[0.95rem] [&_svg]:size-[1.15rem]",
  lg: "min-h-14 px-7 text-base [&_svg]:size-5",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-full py-2 text-center font-medium leading-tight tracking-tight transition-[background-color,border-color,color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    variant === "link" && "min-h-0 px-0",
    className,
  );
}

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className, type = "button", ...props }: ComponentProps<"button"> & StyleProps) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonStyles({ variant, size, className })} {...props} />;
}
