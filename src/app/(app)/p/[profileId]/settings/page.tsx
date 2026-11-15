import { BellOff, BellRing, Clock, LogOut, Mail, Send, UserCog } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  leaveCircle,
  runRemindersNow,
  sendTestEmail,
  setEmailAlerts,
  updateProfile,
  updateReminderSettings,
} from "@/app/actions/profiles";
import { ProfileForm } from "@/components/profile-form";
import { ReminderSettingsForm } from "@/components/reminder-settings-form";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingCards, Notice } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { DEFAULT_TIMEZONE, WIDEN_ALERT_AFTER_MINUTES } from "@/lib/constants";
import { isEmailConfigured } from "@/lib/email/mailer";
import { listTimezones } from "@/lib/timezones";
import type { MemberContext } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ params }: PageProps<"/p/[profileId]/settings">) {
  return (
    <Suspense fallback={<LoadingCards count={3} label="Loading settings" />}>
      <SettingsView params={params} />
    </Suspense>
  );
}

async function SettingsView({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const { profile, membership } = await requireMemberContext(profileId);
  const isAdmin = membership.isAdmin;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Reminders & escalation"
            icon={<Clock />}
            description={`A reminder goes out when each dose is due. If nobody confirms it, a follow-up goes out, then the responsible caretaker is alerted and the dose is marked unconfirmed. If nobody acknowledges within ${WIDEN_ALERT_AFTER_MINUTES} minutes, the rest of the circle is alerted too. A dose is never marked as taken automatically.`}
          />
          {isAdmin ? (
            <ReminderSettingsForm
              action={updateReminderSettings.bind(null, profile.id)}
              followUpAfterMinutes={profile.followUpAfterMinutes}
              escalateAfterMinutes={profile.escalateAfterMinutes}
            />
          ) : (
            <p className="font-medium">
              Follow-up after {profile.followUpAfterMinutes} min · caretaker alert after {profile.escalateAfterMinutes} min
            </p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="My email alerts"
            icon={membership.emailAlerts ? <BellRing /> : <BellOff />}
            description={
              membership.emailAlerts
                ? alertSummary(membership.role, profile.name, profile.escalateAfterMinutes)
                : "You won’t get any emails for this circle."
            }
          />
          <ActionButton
            action={setEmailAlerts.bind(null, profile.id, !membership.emailAlerts)}
            variant={membership.emailAlerts ? "secondary" : "primary"}
          >
            {membership.emailAlerts ? <BellOff aria-hidden="true" /> : <BellRing aria-hidden="true" />}
            {membership.emailAlerts ? "Turn off my email alerts" : "Turn on my email alerts"}
          </ActionButton>
        </Card>

        <Card>
          <CardHeader title="Email check" icon={<Mail />} />
          {!isEmailConfigured() ? (
            <Notice tone="warning" className="mb-4">
              Email isn’t configured on this server yet, so emails are printed in the server console instead of being
              sent. Add the SMTP settings to switch on real email.
            </Notice>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <ActionButton action={sendTestEmail.bind(null, profile.id)} variant="secondary">
              <Send aria-hidden="true" /> Send me a test email
            </ActionButton>
            {isAdmin ? (
              <ActionButton action={runRemindersNow.bind(null, profile.id)} variant="secondary" pendingLabel="Checking…">
                <BellRing aria-hidden="true" /> Check reminders now
              </ActionButton>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile details" icon={<UserCog />} />
          {isAdmin ? (
            <ProfileForm
              mode="edit"
              action={updateProfile.bind(null, profile.id)}
              profile={profile}
              timezones={listTimezones()}
              defaultTimezone={DEFAULT_TIMEZONE}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Name" value={profile.name} />
              <Detail label="Elder’s email" value={profile.elderEmail} />
              <Detail label="Date of birth" value={profile.dateOfBirth} />
              <Detail label="Timezone" value={profile.timezone} />
              <Detail label="Conditions" value={profile.conditions.join(", ")} />
              <Detail label="Allergies" value={profile.allergies.join(", ")} />
              <Detail
                label="Emergency contact"
                value={[profile.emergencyContactName, profile.emergencyContactPhone].filter(Boolean).join(" · ")}
              />
            </dl>
          )}
        </Card>

        <Card className="border-red-200/80">
          <CardHeader
            title="Leave this care circle"
            icon={<LogOut />}
            description="You’ll lose access to this profile. If you’re the last member, the profile and its data are deleted."
          />
          <ActionButton
            action={leaveCircle.bind(null, profile.id)}
            variant="danger"
            confirmMessage={`Leave ${profile.name}’s care circle?`}
          >
            <LogOut aria-hidden="true" /> Leave care circle
          </ActionButton>
        </Card>
      </div>
    </div>
  );
}

/** Plain-language list of the emails a member gets, which depends on their role. */
function alertSummary(role: MemberContext["membership"]["role"], elderName: string, escalateAfterMinutes: number): string {
  if (role === "caretaker") {
    return "You get every reminder and follow-up, alerts for unconfirmed doses (first if you’re responsible for the medicine), appointments and low stock.";
  }
  if (role === "elder") {
    return "You get a reminder when each dose is due, a follow-up if it isn’t confirmed, appointment reminders and low-stock alerts.";
  }
  return `As family, you’re alerted if a dose is still unconfirmed ${escalateAfterMinutes} minutes after its time (first if you’re responsible for that medicine), plus appointment and low-stock reminders. Dose reminders go to ${elderName} and the caretakers.`;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{value || "–"}</dd>
    </div>
  );
}
