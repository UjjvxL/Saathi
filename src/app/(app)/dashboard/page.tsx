import { ArrowUpRight, CalendarClock, HeartHandshake, KeyRound, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, LoadingCards, PageHeader, ProgressBar } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/constants";
import { getDashboard, type DashboardEntry } from "@/lib/data";
import { formatInstant } from "@/lib/schedule";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Your care circles" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Your care circles"
        description="Everyone you help care for, at a glance."
        actions={
          <>
            <ButtonLink href="/join" variant="secondary">
              <KeyRound aria-hidden="true" /> Join with passcode
            </ButtonLink>
            <ButtonLink href="/profiles/new">
              <Plus aria-hidden="true" /> New care profile
            </ButtonLink>
          </>
        }
      />
      <Suspense fallback={<LoadingCards count={2} label="Loading your care circles" />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const user = await requireUser();
  const entries = await getDashboard(user.id);

  if (!entries.length) {
    return (
      <EmptyState
        icon={<HeartHandshake />}
        title={`Welcome, ${user.name.split(" ")[0]}`}
        actions={
          <>
            <ButtonLink href="/profiles/new" size="lg">
              <Plus aria-hidden="true" /> Create a care profile
            </ButtonLink>
            <ButtonLink href="/join" size="lg" variant="secondary">
              <KeyRound aria-hidden="true" /> Join with a passcode
            </ButtonLink>
          </>
        }
      >
        Create a profile for yourself or a loved one, or join a family member’s care circle with the Care ID and
        passcode they shared with you.
      </EmptyState>
    );
  }

  return (
    <>
      <AutoRefresh />
      <ul className="grid gap-4 md:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.profile.id}>
            <ProfileCard entry={entry} />
          </li>
        ))}
      </ul>
    </>
  );
}

function ProfileCard({ entry }: { entry: DashboardEntry }) {
  const { profile, membership } = entry;
  const percent = entry.totalToday ? (entry.takenToday / entry.totalToday) * 100 : 0;

  return (
    <Link
      href={`/p/${profile.id}`}
      className="group flex h-full flex-col gap-6 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-soft transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-lift"
    >
      <div className="flex items-start gap-4">
        <Avatar name={profile.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight text-stone-900">{profile.name}</h2>
          <p className="text-[0.95rem] text-stone-500">
            You’re {membership.role === "elder" ? "the elder" : ROLE_LABELS[membership.role].toLowerCase()}
            {membership.isAdmin ? " · Admin" : ""}
          </p>
        </div>
        <ArrowUpRight
          className="size-5 text-stone-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-stone-900"
          aria-hidden="true"
        />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[0.95rem] font-medium text-stone-700">Today</p>
          <p className="text-[0.95rem] text-stone-500">
            {entry.totalToday ? `${entry.takenToday} of ${plural(entry.totalToday, "dose")} taken` : "Nothing scheduled"}
          </p>
        </div>
        <ProgressBar value={percent} label={`Doses taken today for ${profile.name}`} />
      </div>

      {entry.waitingAlerts || entry.pendingNow || entry.notTakenToday || entry.lowStockCount ? (
        <div className="flex flex-wrap gap-2">
          {entry.waitingAlerts ? (
            <Badge tone="error" dot>
              {entry.waitingAlerts} alert{entry.waitingAlerts === 1 ? "" : "s"} waiting for someone
            </Badge>
          ) : null}
          {entry.pendingNow ? (
            <Badge tone="warning" dot>
              {plural(entry.pendingNow, "dose")} pending
            </Badge>
          ) : null}
          {entry.notTakenToday ? (
            <Badge tone="error" dot>
              {entry.notTakenToday} missed or unconfirmed
            </Badge>
          ) : null}
          {entry.lowStockCount ? (
            <Badge tone="warning" dot>
              {entry.lowStockCount} running low
            </Badge>
          ) : null}
        </div>
      ) : null}

      <p className="mt-auto flex items-center gap-2 border-t border-stone-100 pt-4 text-[0.95rem] text-stone-600">
        <CalendarClock className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
        {entry.nextAppointment ? (
          <span className="truncate">
            {entry.nextAppointment.doctorName} · {formatInstant(new Date(entry.nextAppointment.dateTime), profile.timezone)}
          </span>
        ) : (
          <span className="text-stone-500">No upcoming appointments</span>
        )}
      </p>
    </Link>
  );
}
