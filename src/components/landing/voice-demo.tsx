"use client";

import { Mic } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const CONVERSATION = [
  { from: "elder", text: "Have I taken my morning medicines?" },
  { from: "saathi", text: "You took Metformin at 8:02. Amlodipine 5 mg is still due." },
  { from: "elder", text: "I have taken it now." },
  { from: "saathi", text: "You’re confirming Amlodipine 5 mg, the 8:00 AM dose. Is that right?" },
  { from: "elder", text: "Yes." },
  { from: "saathi", text: "Done. Rahul and Priya can see it too." },
] as const;

const BARS = [12, 20, 9, 24, 15, 22, 11, 18, 26, 14, 20, 10, 23, 16, 12, 21, 9, 17];

/** An Elderly-mode phone where a spoken conversation plays out as it scrolls into view (decorative). */
export function VoiceDemo() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[22rem]">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-teal-400/20 blur-3xl" />
      <div className="relative rounded-[2.75rem] border-[10px] border-stone-900 bg-stone-50 shadow-lift">
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-stone-900" />
        <div className="px-5 pb-7 pt-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Elderly mode</p>
          <p className="mt-1 font-serif text-3xl leading-tight text-stone-900">Good morning, Kamala</p>
          <ul className="mt-5 space-y-2.5">
            {CONVERSATION.map((message, index) => (
              <motion.li
                key={message.text}
                initial={reduce ? false : { opacity: 0, y: 14, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ delay: reduce ? 0 : 0.3 + index * 0.55, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-[0.9rem] leading-snug",
                  message.from === "elder"
                    ? "ml-auto rounded-br-md bg-teal-700 text-white"
                    : "mr-auto rounded-bl-md border border-stone-200 bg-white text-stone-800 shadow-xs",
                )}
              >
                {message.text}
              </motion.li>
            ))}
          </ul>
          <div className="mt-7 flex flex-col items-center">
            <span className="relative flex size-20 items-center justify-center">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-teal-500/30" />
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-teal-500/20 [animation-delay:1.2s]" />
              <span className="relative flex size-16 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/30">
                <Mic className="size-7" />
              </span>
            </span>
            <div className="mt-4 flex h-7 items-center gap-1">
              {BARS.map((height, index) => (
                <span
                  key={index}
                  className="w-1 origin-center animate-wave rounded-full bg-teal-600"
                  style={{ height, animationDelay: `${(index % 6) * 0.13}s` }}
                />
              ))}
            </div>
            <p className="mt-2 text-sm text-stone-500">Listening…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
