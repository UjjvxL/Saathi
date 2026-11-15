import { BellOff, BellRing, Clock, LogOut, Mail, Send, ShieldCheck, UserCog, UserMinus, Users } from "lucide-react";
import type { Metadata } from "next";
import { DateTime } from "luxon";
import { Suspense } from "react";
import {
  leaveCircle,
  regeneratePasscode,
  removeMember,
  runRemindersNow,
  sendTestEmail,
  setAdmin,
  setEmailAlerts,
  updateProfile,
  updateReminderSettings,
} from "@/app/actions/profiles";
import { PasscodePanel } from "@/components/passcode-panel";
import { ProfileForm } from "@/components/profile-form";
import { ReminderSettingsForm } from "@/components/reminder-settings-form";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar, Badge, LoadingCards, Notice } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { DEFAULT_TIMEZONE, ROLE_LABELS } from "@/lib/constants";
import { getMembers } from "@/lib/data";
import { isEmailConfigured } from "@/lib/email/mailer";
import { listTimezones } from "@/lib/timezones";
import type { MemberContext, MemberDTO } from "@/lib/types";

export const metadata: Metadata = { title: "Care circle" };

export default function CirclePage({ params }: PageProps<"/p/[profileId]/circle">) {
  return (
    <Suspense fallback={<LoadingCards count={3} label="Loading care circle" />}>
      <CircleView params={params} />
    </Suspense>
  );
}

async function CircleView({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const context = await requireMemberContext(profileId);
  const { profile, membership } = context;
  const members = await getMembers(profile.id);
  const isAdmin = membership.isAdmin;
  const passcodeSet = DateTime.fromISO(profile.passcodeUpdatedAt).setZone(profile.timezone).toFormat("d LLL yyyy");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Invite family & caretakers"
            icon={<ShieldCheck />}
            description="They’ll need the Care ID and the passcode. Share them privately."
          />
          <PasscodePanel
            careId={profile.careId}
            elderName={profile.name}
            action={regeneratePasscode.bind(null, profile.id)}
            canRegenerate={isAdmin}
            updatedLabel={passcodeSet}
          />
        </Card>

        <Card>
          <CardHeader
            title={`Members (${members.length})`}
            icon={<Users />}
            description="Admins manage members, the passcode and reminder settings. The elder is always an admin."
          />
          <ul className="-my-2 divide-y divide-stone-100">
            {members.map((member) => (
              <MemberRow key={member.id} member={member} context={context} />
            ))}
          </ul>
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
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Reminder timing"
            icon={<Clock />}
            description="A reminder goes out before each dose. If it isn’t marked as taken, people are nudged, then the whole family is alerted."
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
    return "You get every reminder: medicine time, missed-dose nudges and alerts, appointments and low stock.";
  }
  if (role === "elder") {
    return "You get medicine-time reminders, a gentle nudge if a dose is missed, appointment reminders and low-stock alerts.";
  }
  return `As family, you’re emailed if a dose still isn’t taken ${escalateAfterMinutes} minutes after its time, plus appointment and low-stock reminders. Medicine-time reminders go to ${elderName} and the caretakers.`;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{value || "–"}</dd>
    </div>
  );
}

function MemberRow({ member, context }: { member: MemberDTO; context: MemberContext }) {
  const isMe = member.userId === context.user.id;
  const canManage = context.membership.isAdmin && !isMe;
  const canRemove = canManage && (member.role !== "elder" || context.membership.role === "elder");

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.name} />
        <div className="min-w-0">
          <p className="font-medium text-stone-900">
            {member.name}
            {isMe ? <span className="font-normal text-stone-500"> (you)</span> : null}
          </p>
          <p className="truncate text-sm text-stone-500">{member.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={member.role === "elder" ? "success" : "neutral"}>{ROLE_LABELS[member.role]}</Badge>
            {member.isAdmin ? <Badge tone="info">Admin</Badge> : null}
            {!member.emailAlerts ? <Badge>Emails off</Badge> : null}
          </div>
        </div>
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-1">
          {member.role !== "elder" ? (
            <ActionButton
              action={setAdmin.bind(null, context.profile.id, member.id, !member.isAdmin)}
              variant="ghost"
              size="sm"
            >
              {member.isAdmin ? "Remove admin" : "Make admin"}
            </ActionButton>
          ) : null}
          {canRemove ? (
            <ActionButton
              action={removeMember.bind(null, context.profile.id, member.id)}
              variant="ghost"
              size="sm"
              confirmMessage={`Remove ${member.name} from the care circle?`}
              ariaLabel={`Remove ${member.name}`}
            >
              <UserMinus aria-hidden="true" /> Remove
            </ActionButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
