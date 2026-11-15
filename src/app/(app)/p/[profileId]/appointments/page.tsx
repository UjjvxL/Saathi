import { CalendarPlus, Check, MapPin, NotebookText, Pencil, RotateCcw, Stethoscope, Trash2, UserCheck, X } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { createAppointment, deleteAppointment, setAppointmentStatus } from "@/app/actions/appointments";
import { AppointmentForm } from "@/components/appointment-form";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState, LoadingCards, Notice } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { getAppointments, getMembers } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatInstant, todayInZone } from "@/lib/schedule";
import type { AppointmentDTO } from "@/lib/types";

export const metadata: Metadata = { title: "Appointments" };

export default function AppointmentsPage({ params }: PageProps<"/p/[profileId]/appointments">) {
  return (
    <Suspense fallback={<LoadingCards count={2} label="Loading appointments" />}>
      <AppointmentsView params={params} />
    </Suspense>
  );
}

async function AppointmentsView({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const { profile, membership } = await requireMemberContext(profileId);
  const [{ upcoming, past }, members] = await Promise.all([getAppointments(profile.id), getMembers(profile.id)]);
  const canManage = can(membership, "manageAppointments");
  const names = Object.fromEntries(members.map((member) => [member.userId, member.name]));
  const card = { profileId: profile.id, timezone: profile.timezone, canManage, names };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="min-w-0 space-y-8">
        <section aria-label="Upcoming appointments" className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Upcoming
          </h2>
          {upcoming.length ? (
            <ul className="space-y-3">
              {upcoming.map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentCard {...card} appointment={appointment} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Stethoscope />} title="No upcoming appointments">
              Add a doctor visit and everyone in the care circle gets an email a day before and 2 hours before.
            </EmptyState>
          )}
        </section>

        {past.length ? (
          <details className="group rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
              Past and cancelled ({past.length})
              <span aria-hidden="true" className="text-stone-500 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <ul className="mt-4 space-y-3">
              {past.map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentCard {...card} appointment={appointment} compact />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <Card className="h-fit">
        <CardHeader title="Add an appointment" icon={<CalendarPlus />} />
        {canManage ? (
          <AppointmentForm
            action={createAppointment.bind(null, profile.id)}
            defaultDate={todayInZone(profile.timezone)}
            members={members}
            canAssign={can(membership, "assignResponsibilities")}
          />
        ) : (
          <Notice tone="info">Ask a caretaker, family member or admin to add appointments.</Notice>
        )}
      </Card>
    </div>
  );
}

function AppointmentCard({
  profileId,
  appointment,
  timezone,
  canManage,
  names,
  compact = false,
}: {
  profileId: string;
  appointment: AppointmentDTO;
  timezone: string;
  canManage: boolean;
  names: Record<string, string>;
  compact?: boolean;
}) {
  const assignee = appointment.assigneeId ? names[appointment.assigneeId] : undefined;
  return (
    <article className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-teal-800">{formatInstant(new Date(appointment.dateTime), timezone)}</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">
            {appointment.doctorName}
            {appointment.specialty ? <span className="font-normal text-stone-500"> · {appointment.specialty}</span> : null}
          </h3>
        </div>
        {appointment.status === "completed" ? (
          <Badge tone="success" dot>
            Done
          </Badge>
        ) : appointment.status === "cancelled" ? (
          <Badge tone="neutral" dot>
            Cancelled
          </Badge>
        ) : null}
      </div>
      {appointment.location ? (
        <p className="mt-2 flex items-start gap-2 text-[0.95rem] text-stone-600">
          <MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" /> {appointment.location}
        </p>
      ) : null}
      {appointment.notes && !compact ? (
        <p className="mt-2 flex items-start gap-2 whitespace-pre-line text-[0.95rem] text-stone-600">
          <NotebookText className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" /> {appointment.notes}
        </p>
      ) : null}
      <p className="mt-2 flex items-start gap-2 text-[0.95rem] text-stone-600">
        <UserCheck className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" />
        {assignee ? `${assignee} is taking care of this visit` : "Nobody assigned yet"}
      </p>
      {appointment.status !== "scheduled" && appointment.statusChangedByName ? (
        <p className="mt-1 text-sm text-stone-500">
          {appointment.status === "completed" ? "Marked done" : "Cancelled"} by {appointment.statusChangedByName}
          {appointment.statusChangedAt ? ` · ${formatInstant(new Date(appointment.statusChangedAt), timezone)}` : ""}
        </p>
      ) : null}
      {canManage ? (
      <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
        {appointment.status === "scheduled" ? (
          <ButtonLink href={`/p/${profileId}/appointments/${appointment.id}`} variant="ghost" size="sm">
            <Pencil aria-hidden="true" /> Edit <span className="sr-only">appointment with {appointment.doctorName}</span>
          </ButtonLink>
        ) : null}
        {appointment.status === "scheduled" ? (
          <>
            <ActionButton
              action={setAppointmentStatus.bind(null, profileId, appointment.id, "completed")}
              variant="secondary"
              size="sm"
            >
              <Check aria-hidden="true" /> Mark as done
            </ActionButton>
            <ActionButton
              action={setAppointmentStatus.bind(null, profileId, appointment.id, "cancelled")}
              variant="ghost"
              size="sm"
              confirmMessage="Cancel this appointment? Reminders will stop."
            >
              <X aria-hidden="true" /> Cancel
            </ActionButton>
          </>
        ) : (
          <ActionButton
            action={setAppointmentStatus.bind(null, profileId, appointment.id, "scheduled")}
            variant="ghost"
            size="sm"
          >
            <RotateCcw aria-hidden="true" /> Restore
          </ActionButton>
        )}
        <ActionButton
          action={deleteAppointment.bind(null, profileId, appointment.id)}
          variant="ghost"
          size="sm"
          confirmMessage="Delete this appointment permanently?"
          ariaLabel={`Delete appointment with ${appointment.doctorName}`}
        >
          <Trash2 aria-hidden="true" /> Delete
        </ActionButton>
      </div>
      ) : null}
    </article>
  );
}
