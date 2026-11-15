import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { updateAppointment } from "@/app/actions/appointments";
import { AppointmentForm } from "@/components/appointment-form";
import { Card } from "@/components/ui/card";
import { LoadingCards, Notice, PageHeader } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { getAppointment, getMembers } from "@/lib/data";
import { can } from "@/lib/permissions";
import { todayInZone, utcToZoned } from "@/lib/schedule";

export const metadata: Metadata = { title: "Edit appointment" };

export default function EditAppointmentPage({ params }: PageProps<"/p/[profileId]/appointments/[appointmentId]">) {
  return (
    <Suspense fallback={<LoadingCards count={1} label="Loading appointment" />}>
      <EditAppointmentView params={params} />
    </Suspense>
  );
}

async function EditAppointmentView({ params }: { params: Promise<{ profileId: string; appointmentId: string }> }) {
  const { profileId, appointmentId } = await params;
  const { profile, membership } = await requireMemberContext(profileId);
  const [appointment, members] = await Promise.all([getAppointment(profile.id, appointmentId), getMembers(profile.id)]);
  if (!appointment) notFound();
  if (!can(membership, "manageAppointments")) {
    return <Notice tone="info">Ask a caretaker, family member or admin to change appointments.</Notice>;
  }
  const { localDate, localTime } = utcToZoned(new Date(appointment.dateTime), profile.timezone);

  return (
    <>
      <PageHeader as="h2" title={`Edit visit to ${appointment.doctorName}`} description="Reminders follow the new time." />
      <Card className="max-w-2xl">
        <AppointmentForm
          action={updateAppointment.bind(null, profile.id, appointment.id)}
          defaultDate={todayInZone(profile.timezone)}
          initial={{
            doctorName: appointment.doctorName,
            specialty: appointment.specialty,
            location: appointment.location,
            date: localDate,
            time: localTime,
            notes: appointment.notes,
            assigneeId: appointment.assigneeId ?? "",
          }}
          members={members}
          canAssign={can(membership, "assignResponsibilities")}
          submitLabel="Save changes"
          cancelHref={`/p/${profile.id}/appointments`}
        />
      </Card>
    </>
  );
}
