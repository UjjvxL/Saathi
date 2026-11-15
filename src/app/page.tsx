import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  ClipboardList,
  Ear,
  FileText,
  HeartHandshake,
  KeyRound,
  ListChecks,
  Lock,
  Mail,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
];

/* ------------------------------------------------------------------ small illustrated pieces */

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", className)} />;
}

function MiniAvatar({ initials, className }: { initials: string; className: string }) {
  return (
    <span className={cn("flex size-9 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-white", className)}>
      {initials}
    </span>
  );
}

function TodayMock() {
  const doses = [
    { time: "8:00", name: "Metformin", dose: "500 mg · after breakfast", state: "taken", by: "Kamala" },
    { time: "8:00", name: "Amlodipine", dose: "5 mg · with water", state: "taken", by: "Priya" },
    { time: "2:00", name: "Vitamin D3", dose: "1 tablet · after lunch", state: "due" },
    { time: "9:00", name: "Atorvastatin", dose: "10 mg · at bedtime", state: "later" },
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
          1 due now
        </span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full w-1/2 rounded-full bg-emerald-500" />
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
            ) : dose.state === "due" ? (
              <span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">I took it</span>
            ) : (
              <span className="text-xs text-stone-500">Later</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EscalationMock() {
  const steps = [
    { time: "8:45", title: "Medicine time", to: "Kamala & Priya", dot: "bg-sky-500" },
    { time: "9:30", title: "Gentle nudge", to: "Kamala & Priya", dot: "bg-amber-500" },
    { time: "10:00", title: "Family alerted", to: "Rahul in Mumbai", dot: "bg-red-500" },
  ];
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[0.2rem] before:top-2 before:w-px before:bg-stone-200">
      {steps.map((step) => (
        <li key={step.title} className="relative flex items-start gap-3 pl-0">
          <Dot className={cn("relative mt-1.5 ring-4 ring-white", step.dot)} />
          <div>
            <p className="text-sm font-medium text-stone-900">
              {step.title} <span className="font-normal tabular-nums text-stone-500">· {step.time}</span>
            </p>
            <p className="text-xs text-stone-500">Email to {step.to}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActivityMock() {
  const rows = [
    { who: "PN", tint: "bg-violet-50 text-violet-800", text: "Priya marked Amlodipine as taken", time: "8:06" },
    { who: "KD", tint: "bg-teal-50 text-teal-800", text: "Kamala confirmed from the email", time: "8:02" },
    { who: "RS", tint: "bg-sky-50 text-sky-800", text: "Rahul added Dr. Mehta, Tue 10:30", time: "Yest." },
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

function HeroPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto mt-16 max-w-5xl animate-fade-up px-5 [animation-delay:300ms] sm:mt-20">
      <div className="rounded-[1.75rem] border border-stone-200/80 bg-white/60 p-2 shadow-lift backdrop-blur-sm">
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
                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-stone-500">If a dose is missed</p>
                <EscalationMock />
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-stone-500">Activity</p>
                <ActivityMock />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-24 right-8 hidden w-72 rounded-2xl border border-stone-200/80 bg-white/95 p-4 shadow-lift backdrop-blur lg:block">
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span className="flex size-5 items-center justify-center rounded-md bg-teal-700 text-white">
            <Mail className="size-3" />
          </span>
          Saathi · now
        </div>
        <p className="mt-2 text-sm font-semibold text-stone-900">Did Kamala take the 2:00 PM medicines?</p>
        <p className="mt-0.5 text-xs text-stone-500">Vitamin D3, after lunch</p>
        <span className="mt-3 inline-flex rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white">
          Yes, I’ve taken them
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-medium text-teal-800">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-stone-900 sm:text-5xl">{title}</h2>
      {children ? <p className="mt-4 text-lg text-stone-600">{children}</p> : null}
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
    <li className={cn("flex flex-col justify-between gap-8 rounded-3xl border border-stone-200/80 bg-white p-7 shadow-soft", className)}>
      <div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-stone-100 text-stone-800 [&_svg]:size-5">{icon}</span>
        <h3 className="mt-5 text-xl font-semibold tracking-tight text-stone-900">{title}</h3>
        <p className="mt-2 text-stone-600">{children}</p>
      </div>
      {visual ? <div aria-hidden="true">{visual}</div> : null}
    </li>
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
        Everything a family needs to look after an elder’s medicines and appointments, in one calm place.
      </SectionHeading>

      <ul className="mt-16 grid gap-4 md:grid-cols-6">
        <BentoCard
          className="md:col-span-4"
          icon={<Users />}
          title="One shared care circle"
          visual={
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex -space-x-2">
                <MiniAvatar initials="KD" className="bg-teal-50 text-teal-800" />
                <MiniAvatar initials="RS" className="bg-sky-50 text-sky-800" />
                <MiniAvatar initials="PN" className="bg-violet-50 text-violet-800" />
                <MiniAvatar initials="+2" className="bg-stone-100 text-stone-600" />
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-sm text-stone-700">
                <KeyRound className="size-4 text-stone-500" /> K7M2XQ · ••••••
              </span>
            </div>
          }
        >
          The elder, family in other cities and caretakers all see the same schedule. People join with a Care ID
          and a secret passcode, and everyone’s role is clear.
        </BentoCard>

        <BentoCard
          className="md:col-span-2"
          icon={<Ear />}
          title="Made for older eyes"
          visual={
            <div className="flex items-end gap-3">
              <span className="font-serif text-6xl leading-none text-stone-900">Aa</span>
              <span className="mb-1 rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white">Bigger text</span>
            </div>
          }
        >
          Large type, high contrast, big buttons and read-aloud for the day’s medicines.
        </BentoCard>

        <BentoCard className="md:col-span-2" icon={<BellRing />} title="Reminders that escalate" visual={<EscalationMock />}>
          A reminder before each dose, a nudge if it’s missed, then a heads-up to family.
        </BentoCard>

        <BentoCard
          className="md:col-span-2"
          icon={<ListChecks />}
          title="Know every dose was taken"
          visual={
            <ul className="space-y-2 text-sm">
              {["Metformin · 8:00 AM", "Amlodipine · 8:00 AM"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-stone-700">
                  <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
              <li className="flex items-center gap-2 text-stone-500">
                <span className="size-5 rounded-full border-2 border-dashed border-stone-300" /> Vitamin D3 · 2:00 PM
              </li>
            </ul>
          }
        >
          One tap marks a dose taken, even straight from the reminder email.
        </BentoCard>

        <BentoCard
          className="md:col-span-2"
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
          Gemini AI reads the photo and fills in medicines and timings. A person always checks before saving.
        </BentoCard>

        <BentoCard
          className="md:col-span-3"
          icon={<Stethoscope />}
          title="Doctor appointments"
          visual={
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div>
                <p className="text-sm font-semibold text-stone-900">Dr. Mehta · Cardiologist</p>
                <p className="text-sm text-stone-500">Tue, 18 Nov · 10:30 AM · City Hospital</p>
              </div>
              <CalendarClock className="size-6 shrink-0 text-stone-500" />
            </div>
          }
        >
          Everyone gets a reminder a day before and two hours before, with the address and notes to carry.
        </BentoCard>

        <BentoCard
          className="md:col-span-3"
          icon={<HeartHandshake />}
          title="The elder stays in charge"
          visual={<ActivityMock />}
        >
          The elder is always an admin, is told when anyone joins, and can see every change anyone makes.
        </BentoCard>
      </ul>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <ClipboardList />,
      title: "Create a care profile",
      text: "Add your parent’s details and medicines. Type them in, or scan the prescription.",
    },
    {
      icon: <KeyRound />,
      title: "Invite the family",
      text: "Share the Care ID and passcode. Each person joins as family, caretaker or the elder.",
    },
    {
      icon: <BellRing />,
      title: "Relax, reminders are on",
      text: "Saathi emails before each dose, nudges when one is missed and keeps everyone in the loop.",
    },
  ];
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="border-y border-stone-200/70 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <SectionHeading eyebrow="How it works" title={<span id="how-title">Set up in five minutes</span>} />
        <ol className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-4">
                <span className="font-serif text-5xl leading-none text-teal-700">{index + 1}</span>
                <span className="flex size-10 items-center justify-center rounded-xl bg-stone-100 text-stone-800 [&_svg]:size-5">
                  {step.icon}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-stone-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ForEveryone() {
  const people = [
    {
      who: "For the elder",
      points: ["Big, clear buttons", "Confirm a dose straight from email", "Read-aloud schedule", "Always in control"],
    },
    {
      who: "For family far away",
      points: ["See doses as they’re taken", "Alerts only when something’s missed", "Appointment reminders", "Full activity history"],
    },
    {
      who: "For caretakers",
      points: ["One clear daily schedule", "Pill counts and refill alerts", "Notes for every visit", "Mark doses for the elder"],
    },
  ];
  return (
    <section aria-labelledby="everyone-title" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
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
          <li key={person.who} className="rounded-3xl border border-stone-200/80 bg-white p-7 shadow-soft">
            <h3 className="text-lg font-semibold tracking-tight">{person.who}</h3>
            <ul className="mt-5 space-y-3">
              {person.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-stone-700">
                  <Check className="mt-1 size-4 shrink-0 text-teal-700" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Privacy() {
  const points = [
    { icon: <KeyRound />, title: "Passcode-protected", text: "Only people with the Care ID and passcode can join. Attempts are strictly limited." },
    { icon: <BellRing />, title: "No silent joins", text: "The elder and admins get an email whenever someone joins the circle." },
    { icon: <FileText />, title: "Everything is logged", text: "Every change is recorded with who made it, so the whole family can see." },
    { icon: <Lock />, title: "Secure by default", text: "Passwords are hashed, sessions are signed and every request is checked on the server." },
  ];
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="bg-stone-900 text-white">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-medium text-teal-300">
            <ShieldCheck className="size-4" aria-hidden="true" /> Privacy & security
          </p>
          <h2 id="privacy-title" className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Health details deserve <em className="italic text-teal-300">real</em> care
          </h2>
        </div>
        <ul className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2">
          {points.map((point) => (
            <li key={point.title} className="bg-stone-900 p-7">
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
    q: "How does the passcode work?",
    a: "Each care profile has a Care ID and a 6-digit passcode. Anyone with both can join. The elder and admins are emailed whenever someone joins, and an admin can create a new passcode at any time.",
  },
  {
    q: "What happens when a dose is missed?",
    a: "Shortly before each dose the elder and caretakers get a reminder. If it isn’t marked as taken, they get a gentle nudge, and if it’s still not taken later, the rest of the family is alerted. The timing can be changed.",
  },
  {
    q: "Can it read a doctor’s prescription?",
    a: "Yes. Take a photo and Saathi uses Gemini AI to suggest the medicines and timings. Nothing is saved until a person has checked it.",
  },
  {
    q: "Does it work for more than one parent?",
    a: "Yes. You can be part of as many care circles as you like and switch between them from your dashboard.",
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
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition-transform group-open:rotate-45"
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
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white px-6 py-16 text-center shadow-soft sm:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative">
          <h2 id="cta-title" className="mx-auto max-w-3xl font-serif text-4xl leading-tight tracking-tight sm:text-6xl">
            Start your family’s <em className="italic text-teal-800">care circle</em> today
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-stone-600">
            It takes five minutes to set up, and everyone can join from any phone or computer.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/signup" size="lg">
              Create a free account <ArrowRight aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/join" size="lg" variant="secondary">
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
    { title: "Product", links: NAV.slice(0, 3) },
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
      <header className="sticky top-0 z-40 border-b border-stone-200/60 bg-stone-50/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" className="rounded-lg" aria-label="Saathi home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="rounded-full px-3.5 py-2 text-[0.95rem] text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
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
            <ButtonLink href="/signup" size="sm">
              Get started
            </ButtonLink>
          </div>
        </div>
      </header>

      <main id="main">
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_65%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-48 left-1/2 h-[40rem] w-[70rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(20,184,166,0.14),transparent)]"
          />
          <div className="relative mx-auto max-w-6xl px-5 pt-16 text-center sm:pt-24">
            <a
              href="#features"
              className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-stone-200 bg-white/80 py-1 pl-2 pr-3 text-sm text-stone-600 shadow-xs transition-colors hover:border-stone-300 hover:text-stone-900"
            >
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">New</span>
              Scan a prescription with AI
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>
            <h1
              id="hero-title"
              className="mx-auto mt-7 max-w-4xl animate-fade-up font-serif text-5xl leading-[1.04] tracking-tight text-stone-900 [animation-delay:80ms] sm:text-7xl"
            >
              Care for the people <em className="italic text-teal-800">who cared for you.</em>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg text-stone-600 [animation-delay:160ms] sm:text-xl">
              Saathi keeps your parent’s medicines, doses and doctor visits in one shared care circle, with gentle
              reminders for them and a heads-up for you when something is missed.
            </p>
            <div className="mt-9 flex animate-fade-up flex-wrap justify-center gap-3 [animation-delay:220ms]">
              <ButtonLink href="/signup" size="lg">
                Start a care circle <ArrowRight aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href="/join" size="lg" variant="secondary">
                <KeyRound aria-hidden="true" /> I have a Care ID
              </ButtonLink>
            </div>
            <ul className="mt-7 flex animate-fade-up flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-stone-500 [animation-delay:260ms]">
              {["Free to use", "Works on any phone", "Nothing to install"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="size-4 text-teal-700" aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <HeroPreview />
          <p className="mx-auto max-w-3xl px-5 pb-8 pt-20 text-center font-serif text-2xl leading-snug text-stone-700 sm:text-3xl lg:pt-36">
            Parents at home, children in other cities, caretakers on shifts.{" "}
            <span className="text-stone-500">Saathi keeps everyone on the same page.</span>
          </p>
        </section>

        <Features />
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
