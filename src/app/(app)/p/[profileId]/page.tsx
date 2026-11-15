import { CalendarPlus, MapPin, Package, Pill, Plus, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { DoseTimeline } from "@/components/dose-timeline";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, LoadingCards, Notice, ProgressBar } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { getMembers, getTodayOverview, type TodayOverview } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatInstant, formatLocalDate, formatLongDate, formatTime12h } from "@/lib/schedule";
import type { DoseItem } from "@/lib/types";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage({ params }: PageProps<"/p/[profileId]">) {
  return (
    <Suspense fallback={<LoadingCards count={3} label="Loading today’s medicines" />}>
      <TodayView params={params} />
    </Suspense>
  );
}

const SPOKEN_STATUS: Record<DoseItem["status"], string> = {
  taken: "already taken",
  skipped: "skipped",
  missed: "recorded as not taken",
  unconfirmed: "not confirmed yet. It was due earlier",
  pending: "please take it now",
  upcoming: "later today",
};

/** Plain-language summary of the day for the read-aloud button. */
function buildSpeech(name: string, overview: TodayOverview): string {
  const lines = [`Here are ${name}’s medicines for today, ${formatLongDate(overview.today)}.`];
  const byTime = new Map<string, DoseItem[]>();
  for (const dose of overview.doses) byTime.set(dose.localTime, [...(byTime.get(dose.localTime) ?? []), dose]);
  for (const [time, doses] of byTime) {
    const items = doses.map(
      (dose) =>
        `${dose.name}${dose.dosage ? ` ${dose.dosage}` : ""}${dose.instructions ? `, ${dose.instructions}` : ""}, ${SPOKEN_STATUS[dose.status]}`,
    );
    lines.push(`At ${formatTime12h(time)}: ${items.join(". ")}.`);
  }
  return lines.join(" ");
}

async function TodayView({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const { profile, membership } = await requireMemberContext(profileId);
  const [overview, members] = await Promise.all([getTodayOverview(profile), getMembers(profile.id)]);
  const { doses, summary } = overview;
  const base = `/p/${profile.id}`;
  const allDone = doses.length > 0 && summary.taken === doses.length;
  const notTaken = summary.missed + summary.unconfirmed;
  const memberNames = Object.fromEntries(members.map((member) => [member.userId, member.name]));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <AutoRefresh />
      <div className="min-w-0 space-y-8">
        <Card className="p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[0.95rem] font-medium text-stone-500">Today · {formatLocalDate(overview.today)}</h2>
              {doses.length ? (
                <p className="mt-1 text-4xl font-semibold tracking-tight text-stone-900">
                  {summary.taken}
                  <span className="text-stone-500"> / {doses.length}</span>
                  <span className="ml-2 text-lg font-normal tracking-normal text-stone-500">doses taken</span>
                </p>
              ) : (
                <p className="mt-1 text-2xl font-semibold tracking-tight">Nothing scheduled today</p>
              )}
            </div>
            {doses.length ? <ReadAloudButton text={buildSpeech(profile.name, overview)} /> : null}
          </div>
          {doses.length ? (
            <div className="mt-5 space-y-4">
              <ProgressBar value={(summary.taken / doses.length) * 100} label="Doses taken today" />
              {overview.pendingCount || notTaken || summary.skipped || allDone ? (
                <div className="flex flex-wrap gap-2">
                  {overview.pendingCount ? (
                    <Badge tone="warning" dot>
                      {overview.pendingCount} pending
                    </Badge>
                  ) : null}
                  {summary.unconfirmed ? (
                    <Badge tone="error" dot>
                      {summary.unconfirmed} unconfirmed
                    </Badge>
                  ) : null}
                  {summary.missed ? (
                    <Badge tone="error" dot>
                      {summary.missed} missed
                    </Badge>
                  ) : null}
                  {summary.skipped ? (
                    <Badge tone="neutral" dot>
                      {summary.skipped} skipped
                    </Badge>
                  ) : null}
                  {allDone ? (
                    <Badge tone="success" dot>
                      All done for today
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        {overview.lowStock.length ? (
          <Notice tone="warning" icon={<Package aria-hidden="true" />} title="Running low">
            <ul>
              {overview.lowStock.map((med) => (
                <li key={med.id}>
                  {med.name}: {med.stock} left.{" "}
                  <Link href={`${base}/medications`} className="font-medium underline underline-offset-4">
                    Update stock
                  </Link>
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {doses.length ? (
          <DoseTimeline
            profileId={profile.id}
            doses={doses}
            timezone={profile.timezone}
            memberNames={memberNames}
            canLog={can(membership, "logDoses")}
          />
        ) : (
          <EmptyState
            icon={<Pill />}
            title="No medicines for today"
            actions={
              <>
                <ButtonLink href={`${base}/medications/new`}>
                  <Plus aria-hidden="true" /> Add a medicine
                </ButtonLink>
                <ButtonLink href={`${base}/medications/new#scan`} variant="secondary">
                  <ScanLine aria-hidden="true" /> Scan a prescription
                </ButtonLink>
              </>
            }
          >
            Add medicines and their times. Everyone in the care circle will see them here, with reminders by email.
          </EmptyState>
        )}
      </div>

      <aside aria-label="Upcoming" className="space-y-4">
        <h2 className="text-[0.95rem] font-medium text-stone-500">Next appointments</h2>
        {overview.nextAppointments.length ? (
          <ul className="space-y-3">
            {overview.nextAppointments.map((appointment) => (
              <li key={appointment.id} className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft">
                <p className="text-sm font-medium text-teal-800">
                  {formatInstant(new Date(appointment.dateTime), profile.timezone)}
                </p>
                <p className="mt-1 font-semibold tracking-tight text-stone-900">{appointment.doctorName}</p>
                {appointment.specialty ? <p className="text-[0.95rem] text-stone-500">{appointment.specialty}</p> : null}
                {appointment.location ? (
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-stone-500">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {appointment.location}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-[0.95rem] text-stone-500">
            No upcoming appointments
          </p>
        )}
        <ButtonLink href={`${base}/appointments`} variant="secondary" className="w-full">
          <CalendarPlus aria-hidden="true" /> Add appointment
        </ButtonLink>
      </aside>
    </div>
  );
}
