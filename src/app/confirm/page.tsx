import { Check, CircleCheck, CircleX, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { confirmDoseSlot } from "@/app/actions/doses";
import { Logo } from "@/components/logo";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Badge, LoadingCards, Notice } from "@/components/ui/feedback";
import { loadConfirmSlot } from "@/lib/confirm";

export const metadata: Metadata = {
  title: "Confirm medicines",
  robots: { index: false, follow: false },
};

// Opened from the "I've taken them" button in a reminder email. No login needed:
// the signed link only allows marking this one time slot, and it expires after 12 hours.
export default function ConfirmPage({ searchParams }: PageProps<"/confirm">) {
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
        <Suspense fallback={<LoadingCards count={1} label="Loading medicines" />}>
          <ConfirmView searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

const cardClass = "space-y-6 rounded-3xl border border-stone-200/80 bg-white p-7 shadow-lift sm:p-9";

async function ConfirmView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const slot = token ? await loadConfirmSlot(token) : null;

  if (!slot) {
    return (
      <div className={cardClass}>
        <h1 className="font-serif text-4xl leading-tight tracking-tight">This link has expired</h1>
        <p className="text-lg text-stone-600">
          Links in reminder emails work for 12 hours. Please open Saathi to update today’s medicines.
        </p>
        <ButtonLink href="/login" size="lg">
          Open Saathi
        </ButtonLink>
      </div>
    );
  }

  const open = slot.doses.filter((dose) => dose.status !== "taken" && dose.status !== "skipped");

  return (
    <div className={cardClass}>
      <div>
        <p className="flex items-center gap-2 text-[0.95rem] font-medium text-teal-800">
          <Clock className="size-4" aria-hidden="true" /> {slot.dateLabel} · {slot.timeLabel}
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight tracking-tight">
          {open.length ? `Did ${slot.elderName} take these medicines?` : `All set for ${slot.timeLabel}`}
        </h1>
      </div>

      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
        {slot.doses.map((dose) => (
          <li key={dose.key} className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-lg font-medium text-stone-900">
                {dose.name} <span className="font-normal text-stone-500">{dose.dosage}</span>
              </p>
              {dose.instructions ? <p className="text-stone-600">{dose.instructions}</p> : null}
            </div>
            {dose.status === "taken" ? (
              <Badge tone="success" dot>
                Taken
              </Badge>
            ) : dose.status === "skipped" ? (
              <Badge tone="neutral" dot>
                Skipped
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>

      {open.length ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <ActionButton
            action={confirmDoseSlot.bind(null, token, "taken")}
            variant="success"
            size="lg"
            className="w-full"
            formClassName="flex-1"
            pendingLabel="Saving…"
          >
            <Check aria-hidden="true" /> Yes, I took them
          </ActionButton>
          <ActionButton
            action={confirmDoseSlot.bind(null, token, "skipped")}
            variant="secondary"
            size="lg"
            className="w-full"
            formClassName="flex-1"
          >
            <CircleX aria-hidden="true" /> I skipped them
          </ActionButton>
        </div>
      ) : (
        <Notice tone="success" icon={<CircleCheck aria-hidden="true" />}>
          Thank you! Your family can see this in Saathi.
        </Notice>
      )}
    </div>
  );
}
