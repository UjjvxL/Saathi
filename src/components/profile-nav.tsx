"use client";

import { CalendarCheck, ChartColumn, History, Pill, Settings, Stethoscope, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "", label: "Today", icon: CalendarCheck },
  { path: "/medications", label: "Medicines", icon: Pill },
  { path: "/appointments", label: "Appointments", icon: Stethoscope },
  { path: "/circle", label: "Care circle", icon: Users },
  { path: "/insights", label: "Insights", icon: ChartColumn },
  { path: "/timeline", label: "Timeline", icon: History },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function ProfileNav({ profileId }: { profileId: string }) {
  const pathname = usePathname();
  const base = `/p/${profileId}`;

  return (
    <nav aria-label="Care profile sections" className="-mx-4 overflow-x-auto border-b border-stone-200 px-4">
      <ul className="flex min-w-max gap-1 sm:gap-2">
        {TABS.map(({ path, label, icon: Icon }) => {
          const href = `${base}${path}`;
          const active = path === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-12 items-center gap-2 border-b-2 px-3 text-[0.95rem] font-medium transition-colors",
                  active
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-900",
                )}
              >
                <Icon className="size-[1.1rem]" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
