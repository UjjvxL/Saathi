import { DateTime } from "luxon";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ElderMode, type ElderAppointment } from "@/components/elder/elder-mode";
import { LoadingCards } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { getTodayOverview } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatInstant, formatLongDate } from "@/lib/schedule";

export const metadata: Metadata = { title: "Elderly mode" };

export default function ElderModePage({ params }: PageProps<"/elder/[profileId]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 pt-8">
          <LoadingCards count={3} label="Loading today’s medicines" />
        </div>
      }
    >
      <ElderModeView params={params} />
    </Suspense>
  );
}

async function ElderModeView({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  // Signed-out visitors are sent to log in; people outside the care circle get a 404.
  const { profile, membership } = await requireMemberContext(profileId);
  const overview = await getTodayOverview(profile);

  const appointments: ElderAppointment[] = overview.nextAppointments.map((appointment) => ({
    id: appointment.id,
    doctorName: appointment.doctorName,
    specialty: appointment.specialty,
    location: appointment.location,
    dateTime: appointment.dateTime,
    whenLabel: DateTime.fromISO(appointment.dateTime, { zone: profile.timezone }).toFormat("cccc, d LLLL 'at' h:mm a"),
    shortLabel: formatInstant(new Date(appointment.dateTime), profile.timezone),
  }));
  const dial = profile.emergencyContactPhone?.replace(/[^\d+]/g, "");

  return (
    <>
      <AutoRefresh />
      <ElderMode
        profileId={profile.id}
        elderName={profile.name}
        timezone={profile.timezone}
        todayLabel={formatLongDate(overview.today)}
        doses={overview.doses}
        appointments={appointments}
        emergencyContact={
          dial && profile.emergencyContactPhone
            ? { name: profile.emergencyContactName || "family", phone: profile.emergencyContactPhone, href: `tel:${dial}` }
            : null
        }
        canLog={can(membership, "logDoses")}
        followUpAfterMinutes={profile.followUpAfterMinutes}
      />
    </>
  );
}
