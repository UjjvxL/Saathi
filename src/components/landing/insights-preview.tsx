"use client";

import { motion, useReducedMotion } from "motion/react";

const WEEK = [
  { day: "M", value: 100 },
  { day: "T", value: 100 },
  { day: "W", value: 75 },
  { day: "T", value: 100 },
  { day: "F", value: 100 },
  { day: "S", value: 75 },
  { day: "S", value: 100 },
];

/** An example of the Health Insights page that fills in as it scrolls into view (decorative). */
export function InsightsPreview() {
  const reduce = useReducedMotion();
  const inView = { once: true, amount: 0.4 } as const;
  return (
    <div aria-hidden="true" className="relative">
      <div className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-emerald-300/20 blur-3xl" />
      <div className="relative grid gap-4 rounded-[2rem] border border-stone-200/80 bg-white p-6 shadow-lift sm:grid-cols-[auto_minmax(0,1fr)] sm:p-8">
        <div className="flex flex-col items-center justify-center">
          <div className="relative size-36">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#f5f5f4" strokeWidth="12" />
              <motion.circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#insights-ring)"
                strokeWidth="12"
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }}
                whileInView={{ pathLength: 0.92 }}
                style={reduce ? { pathLength: 0.92 } : undefined}
                viewport={inView}
                transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              />
              <defs>
                <linearGradient id="insights-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#14b8a6" />
                  <stop offset="1" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-semibold tracking-tight text-stone-900">92%</span>
              <span className="text-xs text-stone-500">this week</span>
            </div>
          </div>
          <p className="mt-3 text-sm text-stone-600">23 of 25 doses taken</p>
        </div>
        <div className="min-w-0 space-y-5">
          <div className="flex h-32 gap-2.5">
            {WEEK.map((day, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <motion.div
                    className="w-full origin-bottom rounded-lg bg-linear-to-t from-teal-600 to-emerald-400"
                    style={{ height: `${day.value}%` }}
                    initial={reduce ? false : { scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={inView}
                    transition={{ delay: reduce ? 0 : 0.2 + index * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="text-xs text-stone-500">{day.day}</span>
              </div>
            ))}
          </div>
          <ul className="space-y-2 text-sm text-stone-700">
            <li className="rounded-xl bg-stone-50 px-3.5 py-2.5">Evening doses were left unconfirmed more often than others (2 of 7).</li>
            <li className="rounded-xl bg-stone-50 px-3.5 py-2.5">Every alert was acknowledged within 12 minutes.</li>
            <li className="rounded-xl bg-stone-50 px-3.5 py-2.5">One doctor visit this week: Dr. Mehta, Thu 10:30 AM.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
