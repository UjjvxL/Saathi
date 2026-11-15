"use client";

import { BellRing, CheckCircle2, Hand, Mail, Siren } from "lucide-react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "pending" | "unconfirmed" | "acknowledged" | "resolved";

interface Step {
  time: string;
  title: string;
  text: string;
  status: { label: string; tone: Tone };
  card: { icon: ReactNode; from: string; subject: string; body: string; action?: string };
}

const STEPS: Step[] = [
  {
    time: "8:00 AM",
    title: "Medicine time",
    text: "Kamala gets a reminder with a one-tap “I’ve taken them” button. No login needed.",
    status: { label: "Pending", tone: "pending" },
    card: {
      icon: <Mail />,
      from: "Saathi · to Kamala",
      subject: "Medicine reminder for Kamala · 8:00 AM",
      body: "Metformin 500 mg, Amlodipine 5 mg",
      action: "I’ve taken them",
    },
  },
  {
    time: "8:15 AM",
    title: "A gentle follow-up",
    text: "Not confirmed yet, so Kamala and her caretaker get a second reminder.",
    status: { label: "Pending", tone: "pending" },
    card: {
      icon: <BellRing />,
      from: "Saathi · to Kamala and Priya",
      subject: "Still pending: Kamala’s 8:00 AM medicines",
      body: "It’s been 15 minutes and nobody has confirmed them.",
      action: "Yes, they’re taken",
    },
  },
  {
    time: "8:30 AM",
    title: "The responsible caretaker is alerted",
    text: "The dose is marked unconfirmed (never “taken”) and Priya, who looks after this medicine, is asked to check in.",
    status: { label: "Unconfirmed", tone: "unconfirmed" },
    card: {
      icon: <Siren />,
      from: "Saathi · to Priya",
      subject: "Action needed: Kamala’s 8:00 AM medicines are unconfirmed",
      body: "Tap “I’m on it” so everyone knows you’re following up.",
      action: "I’m on it",
    },
  },
  {
    time: "8:42 AM",
    title: "“I’m on it”",
    text: "Priya taps the button in her email. The whole family can see she’s following up, so nobody else is chased.",
    status: { label: "Acknowledged", tone: "acknowledged" },
    card: {
      icon: <Hand />,
      from: "Care timeline",
      subject: "Priya acknowledged the 8:00 AM alert",
      body: "12 minutes after the alert · following up now",
    },
  },
  {
    time: "8:50 AM",
    title: "Taken, and on the record",
    text: "Priya calls Kamala and records the dose. The alert closes itself, and every step stays in the timeline.",
    status: { label: "Resolved", tone: "resolved" },
    card: {
      icon: <CheckCircle2 />,
      from: "Care timeline",
      subject: "8:00 AM alert resolved",
      body: "Metformin and Amlodipine marked as taken by Priya",
    },
  },
];

const TONES: Record<Tone, string> = {
  pending: "bg-amber-400/10 text-amber-200 ring-amber-300/30",
  unconfirmed: "bg-red-400/10 text-red-200 ring-red-300/30",
  acknowledged: "bg-sky-400/10 text-sky-200 ring-sky-300/30",
  resolved: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/30",
};

function StatusPill({ status }: { status: Step["status"] }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[status.tone])}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {status.label}
    </span>
  );
}

function EventCard({ step, className }: { step: Step; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/6 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs text-stone-300">
          <span className="flex size-6 items-center justify-center rounded-lg bg-teal-500/20 text-teal-200 [&_svg]:size-3.5">
            {step.card.icon}
          </span>
          {step.card.from}
        </span>
        <span className="text-xs tabular-nums text-stone-400">{step.time}</span>
      </div>
      <p className="mt-3 font-medium text-white">{step.card.subject}</p>
      <p className="mt-1 text-sm text-stone-300">{step.card.body}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        {step.card.action ? (
          <span className="rounded-full bg-teal-400 px-3.5 py-1.5 text-xs font-semibold text-teal-950">{step.card.action}</span>
        ) : (
          <span />
        )}
        <StatusPill status={step.status} />
      </div>
    </div>
  );
}

/**
 * The escalation, told as you scroll: on large screens the panel stays put while each step lights up.
 * Small screens and reduced-motion users get the same steps as a simple list.
 */
export function EscalationStory() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26 });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(value * STEPS.length))));
  });
  const story = !reduce;

  return (
    <div ref={ref} className={cn("relative", story && "lg:h-[320vh]")}>
      <div className={cn(story && "lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:items-center")}>
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-24 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:py-0">
          <div>
            <p className="text-sm font-medium text-teal-300">Smart escalation</p>
            <h2 id="escalation-title" className="mt-3 font-serif text-4xl leading-tight tracking-tight text-white sm:text-5xl">
              If a dose isn’t confirmed, <em className="italic text-teal-300">someone always follows up</em>
            </h2>
            <div className="relative mt-10">
              <span aria-hidden="true" className="absolute bottom-2 left-2.75 top-2 w-px bg-white/10" />
              {story ? (
                <motion.span
                  aria-hidden="true"
                  className="absolute bottom-2 left-2.75 top-2 hidden w-px origin-top bg-teal-300 lg:block"
                  style={{ scaleY: progress }}
                />
              ) : null}
              <ol className="relative space-y-6">
              {STEPS.map((step, index) => {
                const lit = !story || index <= active;
                return (
                  <li key={step.time} className="relative flex gap-5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-stone-950 transition-colors duration-500",
                        lit ? "bg-teal-300" : "bg-stone-700",
                      )}
                    >
                      <span className={cn("size-2 rounded-full transition-colors duration-500", lit ? "bg-stone-950" : "bg-stone-500")} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-teal-200">{step.time}</span>
                        <span className={cn("font-semibold transition-colors duration-500", lit ? "text-white" : "text-stone-400")}>
                          {step.title}
                        </span>
                      </p>
                      <p className={cn("mt-1 transition-colors duration-500", story && index === active ? "text-stone-200" : "text-stone-400")}>
                        {step.text}
                      </p>
                      <EventCard step={step} className={cn("mt-4", story && "lg:hidden")} />
                    </div>
                  </li>
                );
              })}
              </ol>
            </div>
          </div>

          {story ? (
            <div aria-hidden="true" className="relative hidden lg:block">
              <div className="pointer-events-none absolute -inset-16 rounded-full bg-teal-500/15 blur-3xl" />
              <div className="relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 24, scale: 0.97, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -18, scale: 0.98, filter: "blur(6px)" }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <EventCard step={STEPS[active]} className="p-7" />
                  </motion.div>
                </AnimatePresence>
                <div className="mt-6 flex justify-center gap-2">
                  {STEPS.map((step, index) => (
                    <span
                      key={step.time}
                      className={cn("h-1.5 rounded-full transition-all duration-500", index === active ? "w-8 bg-teal-300" : "w-1.5 bg-white/20")}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
