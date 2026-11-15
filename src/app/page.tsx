import {
  ArrowRight,
  BellRing,
  Check,
  ChartColumn,
  ClipboardList,
  Hand,
  History,
  KeyRound,
  Lock,
  Mail,
  Mic,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CapsuleScene } from "@/components/landing/capsule-scene";
import { CursorEffect } from "@/components/landing/cursor";
import { EscalationStory } from "@/components/landing/escalation-story";
import { InsightsPreview } from "@/components/landing/insights-preview";
import { Magnetic } from "@/components/landing/magnetic";
import { PointerGlow } from "@/components/landing/pointer-glow";
import { ScrollProgress } from "@/components/landing/scroll-progress";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { SpotlightCard } from "@/components/landing/spotlight-card";
import { VoiceDemo } from "@/components/landing/voice-demo";
import { Logo, LogoMark } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#escalation", label: "How it works" },
  { href: "#elderly-mode", label: "Elderly mode" },
  { href: "#insights", label: "Insights" },
  { href: "#faq", label: "FAQ" },
];

/* ------------------------------------------------------------------ small illustrated pieces */

function MiniAvatar({ initials, className }: { initials: string; className: string }) {
  return (
    <span className={cn("flex size-9 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-white", className)}>
      {initials}
    </span>
  );
}

function FloatingChip({
  icon,
  title,
  subtitle,
  tone,
  className,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone: "emerald" | "amber" | "sky";
  className?: string;
}) {
  const tones = {
    emerald: "bg-emerald-600 text-white",
    amber: "bg-amber-500 text-white",
    sky: "bg-sky-600 text-white",
  };
  return (
    <div
      className={cn(
        "absolute flex animate-float items-center gap-2.5 rounded-2xl border border-white/70 bg-white/80 py-2 pl-2 pr-3.5 shadow-lift backdrop-blur-md",
        className,
      )}
    >
      <span className={cn("flex size-8 items-center justify-center rounded-xl [&_svg]:size-4", tones[tone])}>{icon}</span>
      <span className="leading-tight">
        <span className="block text-[0.8rem] font-semibold text-stone-900">{title}</span>
        <span className="block text-[0.7rem] text-stone-500">{subtitle}</span>
      </span>
    </div>
  );
}

function TodayMock() {
  const doses = [
    { time: "8:00", name: "Metformin", dose: "500 mg · after breakfast", state: "taken", by: "Kamala" },
    { time: "8:00", name: "Amlodipine", dose: "5 mg · with water", state: "taken", by: "Priya" },
    { time: "2:00", name: "Vitamin D3", dose: "1 tablet · after lunch", state: "pending" },
    { time: "9:00", name: "Atorvastatin", dose: "10 mg · at bedtime", state: "upcoming" },
  ] as const;
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Today · Kamala Devi</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            2 <span className="text-stone-500">/ 4</span> <span className="text-base font-normal text-stone-500">taken</span>
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
          1 pending
        </span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full w-1/2 rounded-full bg-linear-to-r from-teal-500 to-emerald-500" />
      </div>
      <ul className="mt-4 divide-y divide-stone-100">
        {doses.map((dose) => (
          <li key={dose.name} className="flex items-center gap-3 py-3">
            <span className="w-10 shrink-0 text-sm font-medium tabular-nums text-stone-500">{dose.time}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-900">{dose.name}</p>
              <p className="truncate text-xs text-stone-500">{dose.dose}</p>
            </div>
            {dose.state === "taken" ? (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                <Check className="size-3.5" /> {dose.by}
              </span>
            ) : dose.state === "pending" ? (
              <span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">I took it</span>
            ) : (
              <span className="text-xs text-stone-500">Upcoming</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EscalationMock() {
  const steps = [
    { time: "8:00", title: "Reminder sent", to: "Kamala", dot: "bg-sky-500" },
    { time: "8:15", title: "Follow-up", to: "Kamala & Priya", dot: "bg-amber-500" },
    { time: "8:30", title: "Priya alerted", to: "Responsible caretaker", dot: "bg-red-500" },
    { time: "8:42", title: "“I’m on it”", to: "Priya is following up", dot: "bg-emerald-500" },
  ];
  return (
    <ol className="relative space-y-3.5 before:absolute before:bottom-2 before:left-[0.2rem] before:top-2 before:w-px before:bg-stone-200">
      {steps.map((step) => (
        <li key={step.title} className="relative flex items-start gap-3">
          <span aria-hidden="true" className={cn("relative mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-white", step.dot)} />
          <div>
            <p className="text-sm font-medium text-stone-900">
              {step.title} <span className="font-normal tabular-nums text-stone-500">· {step.time}</span>
            </p>
            <p className="text-xs text-stone-500">{step.to}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActivityMock() {
  const rows = [
    { who: "PN", tint: "bg-violet-50 text-violet-800", text: "Priya acknowledged the 8:00 AM alert", time: "8:42" },
    { who: "KD", tint: "bg-teal-50 text-teal-800", text: "Kamala confirmed by voice", time: "8:05" },
    { who: "RS", tint: "bg-sky-50 text-sky-800", text: "Rahul made Priya responsible for Amlodipine", time: "Yest." },
  ];
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.text} className="flex items-center gap-3">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold", row.tint)}>
            {row.who}
          </span>
          <p className="min-w-0 flex-1 truncate text-xs text-stone-600">{row.text}</p>
          <span className="text-[0.7rem] tabular-nums text-stone-500">{row.time}</span>
        </li>
      ))}
    </ul>
  );
}

function ProductPreview() {
  return (
    <div aria-hidden="true" className="reveal-scale relative mx-auto max-w-5xl px-5">
      <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 rounded-[3rem] bg-teal-200/25 blur-3xl" />
      <div className="relative rounded-[1.75rem] border border-stone-200/80 bg-white/60 p-2 shadow-lift backdrop-blur-sm">
        <div className="overflow-hidden rounded-[1.4rem] border border-stone-200/70 bg-stone-50">
          <div className="flex items-center gap-1.5 border-b border-stone-200/70 bg-white/70 px-4 py-3">
            <span className="size-2.5 rounded-full bg-stone-200" />
            <span className="size-2.5 rounded-full bg-stone-200" />
            <span className="size-2.5 rounded-full bg-stone-200" />
            <span className="ml-3 truncate text-xs font-medium text-stone-500">Saathi · Kamala Devi’s care circle</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 text-left sm:p-6 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <TodayMock />
            <div className="space-y-4">
              <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-stone-500">If a dose isn’t confirmed</p>
                <EscalationMock />
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-stone-500">Care timeline</p>
                <ActivityMock />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-20 right-8 hidden w-80 animate-float rounded-2xl border border-stone-200/80 bg-white/95 p-4 shadow-lift backdrop-blur [animation-delay:-2s] lg:block">
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <LogoMark className="size-5" />
          Saathi · to Priya · now
        </div>
        <p className="mt-2 text-sm font-semibold text-stone-900">Action needed: Kamala’s 8:00 AM medicines are unconfirmed</p>
        <p className="mt-0.5 text-xs text-stone-500">Tap so everyone knows you’re following up.</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white">
          <Hand className="size-3.5" /> I’m on it
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

function SectionHeading({
  eyebrow,
  title,
  children,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("reveal max-w-2xl", align === "center" ? "mx-auto text-center" : "")}>
      <p className="text-sm font-medium text-teal-800">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-stone-900 sm:text-5xl">{title}</h2>
      {children ? <p className="mt-4 text-lg text-stone-600">{children}</p> : null}
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/60 bg-stone-50/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="rounded-lg" aria-label="Saathi home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-full px-3.5 py-2 text-[0.95rem] text-stone-600 transition-colors hover:bg-stone-900/5 hover:text-stone-900"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1.5">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Log in
          </ButtonLink>
          <Magnetic strength={0.2}>
            <ButtonLink href="/signup" size="sm">
              Get started
            </ButtonLink>
          </Magnetic>
        </div>
      </div>
      <ScrollProgress />
    </header>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-48 -top-48 size-[40rem] animate-aurora rounded-full bg-teal-300/30 blur-3xl" />
        <div className="absolute -right-40 top-0 size-[32rem] animate-aurora rounded-full bg-emerald-200/40 blur-3xl [animation-delay:-6s]" />
        <div className="absolute -bottom-24 left-1/3 size-[28rem] animate-aurora rounded-full bg-amber-100/60 blur-3xl [animation-delay:-11s]" />
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_65%)]" />
        <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-multiply" />
      </div>
      <PointerGlow />

      <div className="relative mx-auto grid max-w-6xl items-center gap-4 px-5 pb-10 pt-12 sm:pt-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:pb-16 lg:pt-12">
        <div className="text-center lg:text-left">
          <a
            href="#elderly-mode"
            className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-stone-200 bg-white/80 py-1 pl-1.5 pr-3 text-sm text-stone-600 shadow-xs backdrop-blur transition-colors hover:border-stone-300 hover:text-stone-900"
          >
            <span className="rounded-full bg-teal-700 px-2 py-0.5 text-xs font-medium text-white">New</span>
            Voice-first Elderly mode
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
          <h1
            id="hero-title"
            className="mx-auto mt-7 max-w-3xl animate-fade-up font-serif text-5xl leading-[1.02] tracking-tight text-stone-900 [animation-delay:80ms] sm:text-7xl lg:mx-0 lg:text-[4.6rem]"
          >
            Care for the people <em className="italic text-teal-800">who cared for you.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg text-stone-600 [animation-delay:160ms] sm:text-xl lg:mx-0">
            Saathi reminds your parent when each medicine is due, follows up when a dose isn’t confirmed, and makes
            sure the right person in the family checks in.
          </p>
          <div className="mt-9 flex animate-fade-up flex-wrap justify-center gap-3 [animation-delay:220ms] lg:justify-start">
            <Magnetic>
              <ButtonLink href="/signup" size="lg">
                Start a care circle <ArrowRight aria-hidden="true" />
              </ButtonLink>
            </Magnetic>
            <ButtonLink href="/join" size="lg" variant="secondary">
              <KeyRound aria-hidden="true" /> I have a Care ID
            </ButtonLink>
          </div>
          <ul className="mt-7 flex animate-fade-up flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-stone-600 [animation-delay:260ms] lg:justify-start">
            {["Free to use", "Works on any phone", "Nothing to install"].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="size-4 text-teal-700" aria-hidden="true" /> {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[30rem] animate-fade-up [animation-delay:200ms] lg:max-w-none">
          <CapsuleScene />
          <div aria-hidden="true" className="pointer-events-none">
            <FloatingChip
              className="left-0 top-[12%] [animation-delay:-1s]"
              tone="emerald"
              icon={<Check />}
              title="Taken · 8:02 AM"
              subtitle="Confirmed by Kamala"
            />
            <FloatingChip
              className="right-0 top-[46%] [animation-delay:-3.5s]"
              tone="amber"
              icon={<Hand />}
              title="Priya is following up"
              subtitle="Acknowledged 8:42 AM"
            />
            <FloatingChip
              className="bottom-[8%] left-[4%] [animation-delay:-5.5s]"
              tone="sky"
              icon={<BellRing />}
              title="Reminder sent"
              subtitle="To Kamala · 2:00 PM"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const MARQUEE = [
  "Reminder when each dose is due",
  "Follow-up after 15 minutes",
  "The right caretaker alerted at 30",
  "“I’m on it” straight from email",
  "Never marked taken by itself",
  "Voice-first Elderly mode",
  "AI prescription scan",
  "Weekly family summary",
  "Works on any phone",
];

function Marquee() {
  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden border-y border-stone-200/70 bg-white/70 py-4 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
    >
      <div className="flex w-max animate-marquee items-center gap-12 hover:[animation-play-state:paused]">
        {[...MARQUEE, ...MARQUEE].map((item, index) => (
          <span key={index} className="flex items-center gap-3 whitespace-nowrap text-[0.95rem] font-medium text-stone-600">
            <LogoMark className="size-5" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function BentoCard({
  icon,
  title,
  children,
  visual,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  visual?: ReactNode;
  className?: string;
}) {
  return (
    <SpotlightCard className={cn("reveal rounded-3xl border border-stone-200/80 bg-white shadow-soft", className)}>
      <div className="flex h-full flex-col justify-between gap-8 p-7">
        <div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-600/15 [&_svg]:size-5">
            {icon}
          </span>
          <h3 className="mt-5 text-xl font-semibold tracking-tight text-stone-900">{title}</h3>
          <p className="mt-2 text-stone-600">{children}</p>
        </div>
        {visual ? <div aria-hidden="true">{visual}</div> : null}
      </div>
    </SpotlightCard>
  );
}

function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <SectionHeading
        eyebrow="Features"
        title={
          <span id="features-title">
            Much more than a <em className="italic text-teal-800">reminder app</em>
          </span>
        }
      >
        Everything a family needs to look after an elder’s medicines and appointments, and to know someone is on it.
      </SectionHeading>

      <ul className="mt-16 grid gap-4 md:grid-cols-6">
        <BentoCard className="md:col-span-4" icon={<BellRing />} title="Smart escalation" visual={<EscalationMock />}>
          A reminder when each dose is due, a follow-up after 15 minutes, then an alert to the person responsible.
          Saathi never assumes a dose was taken.
        </BentoCard>

        <BentoCard
          className="md:col-span-2"
          icon={<Mic />}
          title="Just ask, out loud"
          visual={
            <div className="flex items-center gap-3">
              <span className="relative flex size-12 items-center justify-center">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-teal-500/30" />
                <span className="relative flex size-11 items-center justify-center rounded-full bg-teal-700 text-white">
                  <Mic className="size-5" />
                </span>
              </span>
              <span className="flex h-6 items-center gap-1">
                {[10, 18, 8, 22, 12, 20, 9, 16].map((height, index) => (
                  <span
                    key={index}
                    className="w-1 animate-wave rounded-full bg-teal-600"
                    style={{ height, animationDelay: `${index * 0.12}s` }}
                  />
                ))}
              </span>
            </div>
          }
        >
          Elderly mode answers questions about medicines and visits, and asks before saving anything.
        </BentoCard>

        <BentoCard
          className="md:col-span-2"
          icon={<Users />}
          title="One shared care circle"
          visual={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex -space-x-2">
                <MiniAvatar initials="KD" className="bg-teal-50 text-teal-800" />
                <MiniAvatar initials="RS" className="bg-sky-50 text-sky-800" />
                <MiniAvatar initials="PN" className="bg-violet-50 text-violet-800" />
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-sm text-stone-700">
                <KeyRound className="size-4 text-stone-500" /> K7M2XQ
              </span>
            </div>
          }
        >
          Family and caretakers join with a Care ID and a passcode that expires. Every role can do only what it should.
        </BentoCard>

        <BentoCard
          className="md:col-span-2"
          icon={<UserCheck />}
          title="Clear responsibilities"
          visual={
            <ul className="space-y-2 text-sm">
              {[
                ["Amlodipine 5 mg", "Priya"],
                ["Visit to Dr. Mehta", "Rahul"],
              ].map(([what, who]) => (
                <li key={what} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
                  <span className="text-stone-700">{what}</span>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">{who}</span>
                </li>
              ))}
            </ul>
          }
        >
          Assign each medicine or visit to someone. Alerts go to them first, and everyone sees who’s on it.
        </BentoCard>

        <BentoCard
          className="md:col-span-2"
          icon={<ChartColumn />}
          title="Health insights"
          visual={
            <div className="flex items-end gap-1.5">
              {[100, 100, 75, 100, 100, 75, 100].map((value, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-md bg-linear-to-t from-teal-600 to-emerald-400"
                  style={{ height: `${value * 0.56}px` }}
                />
              ))}
              <span className="ml-2 text-2xl font-semibold tracking-tight text-stone-900">92%</span>
            </div>
          }
        >
          Weekly adherence and the doses that slip most often, from what your family records. Never medical advice.
        </BentoCard>

        <BentoCard className="md:col-span-3" icon={<History />} title="An honest care timeline" visual={<ActivityMock />}>
          Every reminder, alert, “I’m on it” and change, with who did it. Filter by day, type or person.
        </BentoCard>

        <BentoCard
          className="md:col-span-3"
          icon={<ScanLine />}
          title="Scan a prescription"
          visual={
            <div className="flex items-center gap-3">
              <div className="w-20 space-y-1.5 rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                <span className="block h-1.5 w-full rounded bg-stone-300" />
                <span className="block h-1.5 w-4/5 rounded bg-stone-300" />
                <span className="block h-1.5 w-3/5 rounded bg-stone-300" />
                <span className="block h-1.5 w-4/5 rounded bg-stone-300" />
              </div>
              <Sparkles className="size-5 text-teal-700" />
              <div className="space-y-1.5">
                <span className="block rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900">Metformin · 1-0-1</span>
                <span className="block rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900">Telmisartan · 1-0-0</span>
              </div>
            </div>
          }
        >
          Gemini reads the photo and fills in the medicines and timings. A person always checks before saving.
        </BentoCard>
      </ul>
    </section>
  );
}

function Escalation() {
  return (
    <section id="escalation" aria-labelledby="escalation-title" className="relative bg-stone-950 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[32rem] w-[64rem] -translate-x-1/2 rounded-full bg-teal-500/12 blur-3xl" />
        <div className="absolute inset-0 bg-noise opacity-[0.06]" />
      </div>
      <EscalationStory />
    </section>
  );
}

function ElderlyMode() {
  const commands = [
    "What medicines do I need to take today?",
    "Have I taken my morning medicines?",
    "When is my next doctor’s appointment?",
    "Remind me in 10 minutes.",
    "I have taken my medicine.",
  ];
  return (
    <section id="elderly-mode" aria-labelledby="elder-title" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 py-24 sm:py-32 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Voice-first Elderly mode"
            title={
              <span id="elder-title">
                Just ask. <em className="italic text-teal-800">Saathi listens.</em>
              </span>
            }
          >
            A calm, one-screen mode with big text and big buttons. Your parent can ask about their medicines out loud,
            and Saathi always checks before saving anything.
          </SectionHeading>
          <ul className="reveal mt-8 space-y-3">
            {commands.map((command) => (
              <li key={command} className="flex items-center gap-3 text-stone-800">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-600/15">
                  <Mic className="size-4" aria-hidden="true" />
                </span>
                “{command}”
              </li>
            ))}
          </ul>
          <p className="reveal mt-6 text-stone-600">
            Speaks reminders aloud, with A−/A+ text size and a big “call family” button. Understands a few Hindi words
            too: <em>dawai</em>, <em>haan</em>, <em>nahi</em>.
          </p>
        </div>
        <VoiceDemo />
      </div>
    </section>
  );
}

function Insights() {
  return (
    <section id="insights" aria-labelledby="insights-title" className="border-y border-stone-200/70 bg-white">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 py-24 sm:py-32 lg:grid-cols-2">
        <div className="lg:order-2">
          <SectionHeading
            align="left"
            eyebrow="Health insights"
            title={
              <span id="insights-title">
                See the pattern, <em className="italic text-teal-800">not just the day</em>
              </span>
            }
          >
            Weekly adherence, the doses that slip most often and how quickly the family followed up, all calculated
            from what you record.
          </SectionHeading>
          <ul className="reveal mt-8 space-y-3 text-stone-700">
            {[
              "Taken, missed and unconfirmed doses, kept separate",
              "Patterns are only claimed when there’s enough data",
              "An optional plain-English summary written by Gemini",
              "A weekly summary email for the whole family",
            ].map((point) => (
              <li key={point} className="flex items-start gap-3">
                <Check className="mt-1 size-4 shrink-0 text-teal-700" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <p className="reveal mt-6 text-sm text-stone-500">
            Saathi describes routines only. It never diagnoses or suggests changes to medicines.
          </p>
        </div>
        <div className="reveal-scale lg:order-1">
          <InsightsPreview />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <ClipboardList />,
      title: "Create a care profile",
      text: "Add your parent and their medicines. Type them in, or scan the prescription.",
    },
    {
      icon: <KeyRound />,
      title: "Invite the family",
      text: "Share the Care ID and passcode, then make each person responsible for what they look after.",
    },
    {
      icon: <BellRing />,
      title: "Saathi follows up",
      text: "Reminders when doses are due, and the right person alerted when one isn’t confirmed.",
    },
  ];
  return (
    <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <SectionHeading eyebrow="Getting started" title={<span id="how-title">Set up in five minutes</span>} />
      <ol className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-6 hidden h-px bg-linear-to-r from-transparent via-teal-300 to-transparent md:block"
        />
        {steps.map((step, index) => (
          <li key={step.title} className="reveal relative">
            <div className="flex items-center gap-4">
              <span className="relative flex size-12 items-center justify-center rounded-2xl bg-white font-serif text-2xl text-teal-800 shadow-soft ring-1 ring-stone-200">
                {index + 1}
              </span>
              <span className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-800 [&_svg]:size-5">
                {step.icon}
              </span>
            </div>
            <h3 className="mt-6 text-xl font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-stone-600">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ForEveryone() {
  const people = [
    {
      who: "For the elder",
      points: ["Big text, big buttons", "Ask out loud in Elderly mode", "Confirm a dose straight from email", "Always in charge of their circle"],
    },
    {
      who: "For family far away",
      points: ["Alerts only when you’re needed", "See who is following up", "A weekly summary email", "The full care timeline"],
    },
    {
      who: "For caretakers",
      points: ["Clear daily responsibilities", "“I’m on it” in one tap", "Pill counts and refill alerts", "Doctor visit reminders"],
    },
  ];
  return (
    <section aria-labelledby="everyone-title" className="border-t border-stone-200/70 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <SectionHeading
          eyebrow="For the whole family"
          title={
            <span id="everyone-title">
              One circle, <em className="italic text-teal-800">everyone</em> in it
            </span>
          }
        />
        <ul className="mt-16 grid gap-4 md:grid-cols-3">
          {people.map((person) => (
            <SpotlightCard key={person.who} className="reveal rounded-3xl border border-stone-200/80 bg-stone-50/60 shadow-soft">
              <div className="p-7">
                <h3 className="text-lg font-semibold tracking-tight">{person.who}</h3>
                <ul className="mt-5 space-y-3">
                  {person.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-stone-700">
                      <Check className="mt-1 size-4 shrink-0 text-teal-700" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </SpotlightCard>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Privacy() {
  const points = [
    { icon: <KeyRound />, title: "Invites that expire", text: "Care ID and passcode, valid for 7 days and revocable. Join attempts are strictly limited." },
    { icon: <ShieldCheck />, title: "Role-based access", text: "Caretakers, family and admins can each do only what their role allows, checked on the server." },
    { icon: <Mail />, title: "Private notifications", text: "Email subjects and lock-screen previews never name a medicine." },
    { icon: <Users />, title: "No silent joins", text: "The elder and admins are emailed whenever someone joins the circle." },
    { icon: <History />, title: "Everything on the record", text: "Every reminder, alert and change is kept in a timeline nobody can edit." },
    { icon: <Lock />, title: "Secure by default", text: "Hashed passwords, signed sessions, rate limits and strict checks on every input." },
  ];
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="relative overflow-hidden bg-stone-950 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-40 -top-40 size-[36rem] rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-noise opacity-[0.06]" />
      </div>
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <div className="reveal max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-medium text-teal-300">
            <ShieldCheck className="size-4" aria-hidden="true" /> Privacy & security
          </p>
          <h2 id="privacy-title" className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Health details deserve <em className="italic text-teal-300">real</em> care
          </h2>
        </div>
        <ul className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((point) => (
            <li key={point.title} className="reveal bg-stone-950 p-7">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-teal-300 [&_svg]:size-5">
                {point.icon}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{point.title}</h3>
              <p className="mt-2 text-stone-300">{point.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Does my parent need a smartphone?",
    a: "No. Reminders arrive by email, and the “I’ve taken them” button in the email works without logging in. Family members and caretakers can also mark doses for them.",
  },
  {
    q: "What happens when a dose isn’t confirmed?",
    a: "A reminder goes out when the dose is due and a follow-up 15 minutes later. At 30 minutes the dose is marked unconfirmed and the person responsible for that medicine is alerted, with an “I’m on it” button. If nobody responds, the rest of the family is told. All timings can be changed.",
  },
  {
    q: "How does Elderly mode work?",
    a: "It’s a simple screen with big text and buttons. Your parent can tap the microphone and ask things like “Have I taken my morning medicines?”. Before recording anything, Saathi reads back what it understood and asks “Is that right?”.",
  },
  {
    q: "How does the passcode work?",
    a: "Each care profile has a Care ID and a 6-digit passcode that works for 7 days. Anyone with both can join. The elder and admins are emailed whenever someone joins, and an admin can turn invitations off or make a new passcode at any time.",
  },
  {
    q: "Can it read a doctor’s prescription?",
    a: "Yes. Take a photo and Saathi uses Gemini AI to suggest the medicines and timings. Nothing is saved until a person has checked it.",
  },
  {
    q: "Is Saathi medical advice?",
    a: "No. Saathi helps families organise care. Always follow the advice of your doctor or pharmacist.",
  },
];

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl px-5 py-24 sm:py-32">
      <SectionHeading eyebrow="FAQ" title={<span id="faq-title">Questions, answered</span>} />
      <div className="mt-14 divide-y divide-stone-200 border-y border-stone-200">
        {FAQS.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium text-stone-900 [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition-all duration-300 group-open:rotate-45 group-open:border-teal-600 group-open:bg-teal-700 group-open:text-white"
              >
                +
              </span>
            </summary>
            <p className="mt-3 pr-12 text-stone-600">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-5 pb-24 sm:pb-32">
      <div className="reveal-scale relative mx-auto max-w-6xl overflow-hidden rounded-[2.25rem] bg-stone-950 px-6 py-20 text-center text-white shadow-lift sm:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[28rem] animate-aurora rounded-full bg-teal-500/25 blur-3xl" />
          <div className="absolute -bottom-32 -right-16 size-[26rem] animate-aurora rounded-full bg-emerald-400/15 blur-3xl [animation-delay:-8s]" />
          <div className="absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        </div>
        <div className="relative">
          <LogoMark className="mx-auto size-14" />
          <h2 id="cta-title" className="mx-auto mt-8 max-w-3xl font-serif text-4xl leading-tight tracking-tight sm:text-6xl">
            Start your family’s <em className="italic text-teal-300">care circle</em> today
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-stone-300">
            It takes five minutes to set up, and everyone can join from any phone or computer.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Magnetic>
              <ButtonLink href="/signup" size="lg" variant="secondary">
                Create a free account <ArrowRight aria-hidden="true" />
              </ButtonLink>
            </Magnetic>
            <ButtonLink href="/join" size="lg" variant="inverse">
              Join with a passcode
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const columns = [
    { title: "Product", links: NAV.slice(0, 4) },
    {
      title: "Account",
      links: [
        { href: "/signup", label: "Create account" },
        { href: "/login", label: "Log in" },
        { href: "/join", label: "Join a care circle" },
      ],
    },
  ];
  return (
    <footer className="border-t border-stone-200/70 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-stone-600">
            Medicines, appointments and family, in one caring circle. Saathi helps families coordinate care. It
            doesn’t replace advice from a doctor or pharmacist.
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-sm font-semibold text-stone-900">{column.title}</h2>
            <ul className="mt-4 space-y-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-stone-600 transition-colors hover:text-stone-900">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-stone-200/70">
        <p className="mx-auto max-w-6xl px-5 py-6 text-sm text-stone-500">© 2026 Saathi. Built with care for families.</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ page */

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-stone-50">
      <SmoothScroll />
      <CursorEffect />
      <Header />
      <main id="main">
        <Hero />
        <Marquee />
        <div className="relative pb-28 pt-20 sm:pt-24 lg:pb-40">
          <ProductPreview />
        </div>
        <p className="reveal mx-auto max-w-3xl px-5 pb-8 text-center font-serif text-2xl leading-snug text-stone-700 sm:text-3xl">
          Parents at home, children in other cities, caretakers on shifts.{" "}
          <span className="text-stone-500">Saathi keeps everyone on the same page.</span>
        </p>
        <Features />
        <Escalation />
        <ElderlyMode />
        <Insights />
        <HowItWorks />
        <ForEveryone />
        <Privacy />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
