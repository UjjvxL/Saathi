import { CalendarRange, Package, Pause, Pencil, Pill, Play, Plus, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { addStock, setMedicationActive } from "@/app/actions/medications";
import { AddStockForm } from "@/components/add-stock-form";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, LoadingCards, PageHeader } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { getMedications, isLowStock } from "@/lib/data";
import { describeSchedule, formatLocalDate } from "@/lib/schedule";
import type { MedicationDTO } from "@/lib/types";

export const metadata: Metadata = { title: "Medicines" };

export default function MedicationsPage({ params }: PageProps<"/p/[profileId]/medications">) {
  return (
    <Suspense fallback={<LoadingCards count={3} label="Loading medicines" />}>
      <MedicationsView params={params} />
    </Suspense>
  );
}

async function MedicationsView({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const { profile } = await requireMemberContext(profileId);
  const meds = await getMedications(profile.id);
  const active = meds.filter((med) => med.active);
  const stopped = meds.filter((med) => !med.active);
  const base = `/p/${profile.id}/medications`;

  return (
    <>
      <PageHeader
        as="h2"
        title="Medicines"
        description="Anyone in the care circle can add or change medicines. Every change is recorded in History."
        actions={
          <>
            <ButtonLink href={`${base}/new#scan`} variant="secondary">
              <ScanLine aria-hidden="true" /> Scan prescription
            </ButtonLink>
            <ButtonLink href={`${base}/new`}>
              <Plus aria-hidden="true" /> Add medicine
            </ButtonLink>
          </>
        }
      />

      {active.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {active.map((med) => (
            <li key={med.id}>
              <MedicationCard profileId={profile.id} med={med} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Pill />}
          title="No active medicines"
          actions={
            <ButtonLink href={`${base}/new`}>
              <Plus aria-hidden="true" /> Add the first medicine
            </ButtonLink>
          }
        >
          Add each medicine with its dose and times. Reminders start straight away.
        </EmptyState>
      )}

      {stopped.length ? (
        <section aria-label="Stopped medicines" className="mt-12">
          <h3 className="mb-4 text-[0.95rem] font-medium text-stone-500">
            Stopped medicines
          </h3>
          <ul className="grid gap-4 opacity-80 md:grid-cols-2">
            {stopped.map((med) => (
              <li key={med.id}>
                <MedicationCard profileId={profile.id} med={med} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function MedicationCard({ profileId, med }: { profileId: string; med: MedicationDTO }) {
  const low = isLowStock(med);
  return (
    <article className="flex h-full flex-col gap-5 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-tight text-stone-900">
            {med.name}
            {med.dosage ? <span className="font-normal text-stone-500"> · {med.dosage}</span> : null}
          </h3>
          <p className="mt-1 font-medium text-teal-800">{describeSchedule(med)}</p>
          {med.instructions ? <p className="text-stone-600">{med.instructions}</p> : null}
        </div>
        <Badge tone="neutral" className="capitalize">
          {med.active ? med.form : "Stopped"}
        </Badge>
      </div>

      <dl className="space-y-1.5 text-[0.95rem] text-stone-600">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
          <dt className="sr-only">Dates</dt>
          <dd>
            From {formatLocalDate(med.startDate, true)}
            {med.endDate ? ` to ${formatLocalDate(med.endDate, true)}` : " · ongoing"}
          </dd>
        </div>
        {med.stock !== null ? (
          <div className="flex items-center gap-2">
            <Package className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
            <dt className="sr-only">Stock</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {med.stock} left
              {low ? (
                <Badge tone="warning" dot>
                  Running low
                </Badge>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {med.active && med.stock !== null ? (
        <AddStockForm action={addStock.bind(null, profileId, med.id)} medicineName={med.name} />
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-stone-100 pt-4">
        <ButtonLink href={`/p/${profileId}/medications/${med.id}`} variant="secondary" size="sm">
          <Pencil aria-hidden="true" /> Edit
        </ButtonLink>
        {med.active ? (
          <ActionButton
            action={setMedicationActive.bind(null, profileId, med.id, false)}
            variant="ghost"
            size="sm"
            confirmMessage={`Stop ${med.name}? Reminders for it will stop. Its history is kept.`}
          >
            <Pause aria-hidden="true" /> Stop
          </ActionButton>
        ) : (
          <ActionButton action={setMedicationActive.bind(null, profileId, med.id, true)} variant="ghost" size="sm">
            <Play aria-hidden="true" /> Restart
          </ActionButton>
        )}
      </div>
    </article>
  );
}
