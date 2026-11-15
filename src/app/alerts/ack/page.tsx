import { CircleCheck, Clock, Hand, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { acknowledgeFromEmail } from "@/app/actions/alerts";
import { Logo } from "@/components/logo";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { LoadingCards, Notice } from "@/components/ui/feedback";
import { loadAckLink } from "@/lib/alerts";
import { formatClock, formatLocalDate, formatTime12h } from "@/lib/schedule";

export const metadata: Metadata = {
  title: "Follow up on an alert",
  robots: { index: false, follow: false },
};

// Opened from the "I'm on it" button in an escalation email. Opening the page changes nothing (mail
// scanners open links too); the button records the acknowledgement for the member the link was sent to.
export default function AckAlertPage({ searchParams }: PageProps<"/alerts/ack">) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-stone-50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_60%)]"
      />
      <header className="relative mx-auto flex h-16 max-w-xl items-center px-5">
        <Link href="/" className="rounded-lg" aria-label="Saathi home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="relative mx-auto max-w-xl px-5 pb-16 pt-4">
        <Suspense fallback={<LoadingCards count={1} label="Loading alert" />}>
          <AckView searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

const cardClass = "space-y-6 rounded-3xl border border-stone-200/80 bg-white p-7 shadow-lift sm:p-9";

async function AckView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const link = token ? await loadAckLink(token) : null;

  if (!link) {
    return (
      <div className={cardClass}>
        <h1 className="font-serif text-4xl leading-tight tracking-tight">This link has expired</h1>
        <p className="text-lg text-stone-600">
          Links in alert emails work for 24 hours, and only for members of the care circle. Please open Saathi to see
          the alert.
        </p>
        <ButtonLink href="/login" size="lg">
          Open Saathi
        </ButtonLink>
      </div>
    );
  }

  const { alert, profile, user } = link;
  const zone = profile.timezone;
  return (
    <div className={cardClass}>
      <div>
        <p className="flex items-center gap-2 text-[0.95rem] font-medium text-red-800">
          <Clock className="size-4" aria-hidden="true" /> {formatLocalDate(alert.localDate)} · due at{" "}
          {formatTime12h(alert.localTime)}
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight tracking-tight">
          {alert.status === "resolved"
            ? `${profile.name}’s medicines are sorted`
            : `Can you check on ${profile.name}?`}
        </h1>
        {alert.status !== "resolved" ? (
          <p className="mt-3 text-lg text-stone-600">
            Nobody has confirmed these medicines yet. Let everyone know you’re following up, then call or visit.
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
        {alert.medicines.map((medicine) => (
          <li key={medicine} className="px-5 py-4 text-lg font-medium text-stone-900">
            {medicine}
          </li>
        ))}
      </ul>

      {alert.status === "resolved" ? (
        <Notice tone="success" icon={<CircleCheck aria-hidden="true" />}>
          {alert.resolvedByName ? `${alert.resolvedByName} recorded what happened` : "Someone recorded what happened"}
          {alert.resolvedAt ? ` at ${formatClock(new Date(alert.resolvedAt), zone)}` : ""}. Thank you.
        </Notice>
      ) : alert.status === "acknowledged" ? (
        <Notice tone={alert.acknowledgedByName === user.name ? "success" : "info"} icon={<UserCheck aria-hidden="true" />}>
          {alert.acknowledgedByName === user.name
            ? "Thank you. Everyone can see you’re following up"
            : `${alert.acknowledgedByName ?? "Someone"} is already following up`}
          {alert.acknowledgedAt ? ` (since ${formatClock(new Date(alert.acknowledgedAt), zone)})` : ""}.
        </Notice>
      ) : (
        <ActionButton
          action={acknowledgeFromEmail.bind(null, token)}
          variant="danger"
          size="lg"
          className="w-full"
          pendingLabel="Saving…"
        >
          <Hand aria-hidden="true" /> I’m on it, {user.name.split(" ")[0]}
        </ActionButton>
      )}

      <p className="text-stone-600">
        After you’ve checked, record whether the medicines were taken in{" "}
        <Link href={`/p/${profile.id}`} className="font-medium text-teal-800 underline underline-offset-4">
          {profile.name}’s schedule
        </Link>{" "}
        (you may need to log in).
      </p>
    </div>
  );
}
