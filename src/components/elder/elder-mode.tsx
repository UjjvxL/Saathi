"use client";

import { AlarmClock, ArrowLeft, BellRing, CalendarClock, MapPin, Phone, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DoseItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { announcementsDue } from "@/lib/voice/announcements";
import { reminderMessage, type VoiceAppointment, type VoiceContext, type VoiceDose } from "@/lib/voice/replies";
import { LogoMark } from "../logo";
import { createFlagStore, getClockSnapshot, getServerClockSnapshot, loadAnnounced, saveAnnounced, subscribeClock } from "./browser-state";
import { NowCard, TodayList } from "./elder-doses";
import { speak } from "./speech";
import { elderButton, elderCard } from "./styles";
import { TextSizeControl } from "./text-size-control";
import { VoiceAssistant } from "./voice-assistant";

export interface ElderAppointment extends VoiceAppointment {
  /** e.g. "Thu, 19 Nov · 10:30 AM" */
  shortLabel: string;
}

export interface ElderModeProps {
  profileId: string;
  elderName: string;
  timezone: string;
  /** e.g. "Sunday, 15 November" (in the elder's timezone). */
  todayLabel: string;
  doses: DoseItem[];
  appointments: ElderAppointment[];
  emergencyContact: { name: string; phone: string; href: string } | null;
  /** Whether this account may record doses (the server checks this again). */
  canLog: boolean;
  followUpAfterMinutes: number;
}

const spokenReminders = createFlagStore("saathi-spoken-reminders");
const REMINDER_CHECK_MS = 15_000;
/** Notifications stay generic: lock screens shouldn't show which medicine someone takes. */
const NOTIFICATION_BODY = "It’s time for your medicine. Open Saathi to see which one.";

function toVoiceDose(dose: DoseItem): VoiceDose {
  return {
    key: dose.key,
    medicationId: dose.medicationId,
    name: dose.name,
    dosage: dose.dosage,
    instructions: dose.instructions,
    localTime: dose.localTime,
    scheduledFor: dose.scheduledFor,
    status: dose.status,
    canMark: dose.canMark,
  };
}

function clockParts(epochMs: number, timeZone: string): { time: string; hour: number } {
  const date = new Date(epochMs);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date));
  return { time, hour };
}

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Hello";
}

function Greeting({ name, timezone, todayLabel }: { name: string; timezone: string; todayLabel: string }) {
  // 0 on the server and during hydration, so the clock appears right after the page loads.
  const now = useSyncExternalStore(subscribeClock, getClockSnapshot, getServerClockSnapshot);
  const parts = now ? clockParts(now, timezone) : null;
  const firstName = name.split(/\s+/)[0] || name;
  return (
    <div>
      <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
        {parts ? greetingFor(parts.hour) : "Hello"}, {firstName}
      </h1>
      <p className="mt-2 text-2xl text-stone-700">
        {todayLabel}
        {parts ? (
          <>
            {" · "}
            <span className="tabular-nums">{parts.time}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function AppointmentCard({ appointment }: { appointment: ElderAppointment | undefined }) {
  return (
    <section aria-labelledby="visit-title" className={elderCard}>
      <h2 id="visit-title" className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-stone-700 [&_svg]:size-7">
        <CalendarClock aria-hidden="true" /> Next doctor visit
      </h2>
      {appointment ? (
        <>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">{appointment.doctorName}</p>
          {appointment.specialty ? <p className="text-xl text-stone-700">{appointment.specialty}</p> : null}
          <p className="mt-2 text-2xl font-medium text-teal-800">{appointment.whenLabel}</p>
          {appointment.location ? (
            <p className="mt-2 flex items-start gap-2 text-xl text-stone-700">
              <MapPin className="mt-1 size-5 shrink-0" aria-hidden="true" /> {appointment.location}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-xl text-stone-700">No upcoming doctor’s appointments.</p>
      )}
    </section>
  );
}

/**
 * Elderly mode: one calm, large screen with today's medicines, a voice assistant, spoken reminders and
 * a call button. Everything it shows comes from the care profile; every change goes through the same
 * server actions (and permission checks) as the rest of the app.
 */
export function ElderMode(props: ElderModeProps) {
  const { profileId, elderName, timezone, todayLabel, doses, appointments, emergencyContact, canLog, followUpAfterMinutes } = props;
  const voiceDoses = useMemo(() => doses.map(toVoiceDose), [doses]);
  const context: VoiceContext = useMemo(
    () => ({ elderName, doses: voiceDoses, appointments, canLog }),
    [elderName, voiceDoses, appointments, canLog],
  );

  const spokenOn = useSyncExternalStore(spokenReminders.subscribe, spokenReminders.getSnapshot, spokenReminders.getServerSnapshot);
  const [banner, setBanner] = useState<string | null>(null);
  const [reminderAt, setReminderAt] = useState<number | null>(null);
  const reminderTimer = useRef<number | null>(null);

  const announce = useCallback((text: string) => {
    setBanner(text);
    speak(text);
  }, []);

  // Timers read the latest schedule, which refreshes every 30 seconds.
  const latest = useRef({ voiceDoses, context, followUpAfterMinutes, profileId });
  useEffect(() => {
    latest.current = { voiceDoses, context, followUpAfterMinutes, profileId };
  });

  // Spoken reminders: while this screen is open, read out each dose once when due, and once more at the
  // follow-up time if it's still waiting. What was read is remembered, so a refresh doesn't repeat it.
  useEffect(() => {
    if (!spokenOn) return;
    const check = () => {
      const { voiceDoses: current, followUpAfterMinutes: followUp, profileId: id } = latest.current;
      const announced = loadAnnounced();
      const due = announcementsDue(current, new Date(), followUp, announced, `${id}:`);
      if (!due.length) return;
      for (const item of due) announced.add(item.id);
      saveAnnounced(announced);
      announce(due.map((item) => item.text).join(" "));
    };
    const first = window.setTimeout(check, 500);
    const timer = window.setInterval(check, REMINDER_CHECK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [spokenOn, announce]);

  useEffect(
    () => () => {
      if (reminderTimer.current !== null) window.clearTimeout(reminderTimer.current);
    },
    [],
  );

  function toggleSpoken() {
    const next = !spokenOn;
    spokenReminders.set(next);
    // This tap also unlocks audio, so later reminders can be read out without another tap.
    speak(next ? "Okay. I’ll read your medicine reminders aloud while this screen is open." : "Okay. I won’t read reminders aloud.");
  }

  const remind = useCallback(
    (minutes: number) => {
      if (reminderTimer.current !== null) window.clearTimeout(reminderTimer.current);
      setReminderAt(Date.now() + minutes * 60_000);
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          Promise.resolve(Notification.requestPermission()).catch(() => {});
        }
      } catch {
        // Notifications are optional; the on-screen and spoken reminder still happen.
      }
      reminderTimer.current = window.setTimeout(() => {
        reminderTimer.current = null;
        setReminderAt(null);
        announce(reminderMessage(latest.current.context));
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Saathi reminder", { body: NOTIFICATION_BODY, tag: "saathi-reminder" });
          }
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }, minutes * 60_000);
    },
    [announce],
  );

  function cancelReminder() {
    if (reminderTimer.current !== null) window.clearTimeout(reminderTimer.current);
    reminderTimer.current = null;
    setReminderAt(null);
  }

  const reminderLabel = reminderAt
    ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(reminderAt))
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-20 pt-5 sm:pt-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight text-stone-900">
          <LogoMark className="size-10" /> Saathi <span className="font-normal text-stone-600">· Elderly mode</span>
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <TextSizeControl />
          <Link href={`/p/${profileId}`} className={elderButton("secondary")}>
            <ArrowLeft aria-hidden="true" /> Back to full view
          </Link>
        </div>
      </header>

      <Greeting name={elderName} timezone={timezone} todayLabel={todayLabel} />

      {banner ? (
        <div role="status" className="flex items-start gap-4 rounded-3xl border-2 border-amber-500 bg-amber-50 p-5 text-amber-950">
          <BellRing className="mt-1 size-8 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-2xl font-semibold leading-snug">{banner}</p>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss reminder"
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full text-amber-950 hover:bg-amber-100 [&_svg]:size-6"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <NowCard profileId={profileId} doses={doses} canLog={canLog} />

      <VoiceAssistant profileId={profileId} context={context} onRemind={remind} />

      <section aria-labelledby="spoken-title" className={elderCard}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="spoken-title" className="text-2xl font-semibold tracking-tight text-stone-900">
              Spoken reminders
            </h2>
            <p className="mt-1 text-lg text-stone-700">
              {spokenOn
                ? "On. Saathi reads each medicine reminder aloud while this screen is open."
                : "Saathi can read your medicine reminders aloud while this screen is open."}
            </p>
          </div>
          <button type="button" onClick={toggleSpoken} aria-pressed={spokenOn} className={elderButton(spokenOn ? "teal" : "secondary", "shrink-0")}>
            {spokenOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />} Read reminders aloud
            <span aria-hidden="true" className={cn("rounded-full px-2.5 py-0.5 text-base", spokenOn ? "bg-white/20" : "bg-stone-100")}>
              {spokenOn ? "On" : "Off"}
            </span>
          </button>
        </div>
        {reminderLabel ? (
          <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-3 text-xl font-medium text-stone-900 [&_svg]:size-7">
              <AlarmClock aria-hidden="true" /> Reminder set for {reminderLabel}
            </p>
            <button type="button" onClick={cancelReminder} className={elderButton("secondary")}>
              Cancel reminder
            </button>
          </div>
        ) : null}
      </section>

      <TodayList doses={doses} />

      <AppointmentCard appointment={appointments[0]} />

      {emergencyContact ? (
        <a href={emergencyContact.href} className={elderButton("teal", "w-full flex-wrap")}>
          <Phone aria-hidden="true" /> Call {emergencyContact.name}
          <span className="font-normal">{emergencyContact.phone}</span>
        </a>
      ) : null}
    </div>
  );
}
