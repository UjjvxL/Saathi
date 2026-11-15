import {
  Activity as ActivityIcon,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Crown,
  ListChecks,
  ShieldCheck,
  Siren,
  UserMinus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { Suspense } from "react";
import { regeneratePasscode, removeMember, revokeInvitations, setAdmin } from "@/app/actions/profiles";
import { AlertCard } from "@/components/alert-card";
import { PasscodePanel } from "@/components/passcode-panel";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar, Badge, LoadingCards, Notice, type Tone } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { DOSE_STATUS_LABELS, ROLE_LABELS, type DoseStatus } from "@/lib/constants";
import { getCareCircleOverview, type Responsibility } from "@/lib/data";
import { can, capabilityMatrix } from "@/lib/permissions";
import { formatClock, formatInstant } from "@/lib/schedule";
import type { MemberContext, MemberDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const overview = await getCareCircleOverview(profile);
  const isAdmin = membership.isAdmin;
  const zone = profile.timezone;
  const expiresAt = DateTime.fromISO(profile.passcodeExpiresAt).setZone(zone);
  const caretakers = overview.members.filter((member) => member.role === "caretaker");
  const family = overview.members.filter((member) => member.role === "family");

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Family members" value={family.length} />
        <Stat label="Caretakers" value={caretakers.length} />
        <Stat label="Pending responsibilities" value={overview.pending.length} />
        <Stat label="Outstanding alerts" value={overview.openAlerts.length} tone={overview.openAlerts.length ? "error" : undefined} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Outstanding medication alerts"
              icon={<Siren />}
              description="Doses nobody confirmed in time. Tap “I’m on it” so everyone knows who is following up."
            />
            {overview.openAlerts.length ? (
              <ul className="space-y-4">
                {overview.openAlerts.map((alert) => (
                  <li key={alert.id}>
                    <AlertCard
                      alert={alert}
                      profileId={profile.id}
                      timezone={zone}
                      canAcknowledge={can(membership, "acknowledgeAlerts")}
                      showDate
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <Notice tone="success" icon={<CheckCircle2 aria-hidden="true" />}>
                No outstanding alerts. Every recent dose was confirmed in time.
              </Notice>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Responsibilities"
              icon={<ClipboardList />}
              description="Who is looking after what today: medicines, follow-ups and doctor visits."
            />
            <div className="grid gap-6 md:grid-cols-2">
              <ResponsibilityList title="Pending" items={overview.pending} timezone={zone} empty="Nothing pending right now." />
              <ResponsibilityList
                title="Completed"
                items={overview.completed}
                timezone={zone}
                empty="Nothing completed yet today."
                done
              />
            </div>
            {overview.unassignedMedicines.length ? (
              <Notice tone="info" className="mt-5">
                {overview.unassignedMedicines.length === 1
                  ? `${overview.unassignedMedicines[0].name} has nobody responsible.`
                  : `${overview.unassignedMedicines.length} medicines have nobody responsible.`}{" "}
                {can(membership, "assignResponsibilities") ? (
                  <Link href={`/p/${profile.id}/medications`} className="font-medium underline underline-offset-4">
                    Assign someone
                  </Link>
                ) : (
                  "A caretaker or admin can assign someone."
                )}{" "}
                so alerts reach the right person first.
              </Notice>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Recent care activity"
              icon={<ActivityIcon />}
              actions={
                <Link
                  href={`/p/${profile.id}/timeline`}
                  className="text-[0.95rem] font-medium text-teal-800 underline-offset-4 hover:underline"
                >
                  Full timeline
                </Link>
              }
            />
            {overview.recentActivity.length ? (
              <ol className="space-y-3">
                {overview.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-2 size-2 shrink-0 rounded-full",
                        entry.kind === "alert" ? "bg-red-500" : entry.kind === "acknowledgement" ? "bg-amber-500" : "bg-stone-300",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-stone-800">{entry.message}</p>
                      <p className="text-sm text-stone-500">{formatInstant(new Date(entry.createdAt), zone)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-stone-500">Nothing yet.</p>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title={`Members (${overview.members.length})`}
              icon={<Users />}
              description="Everyone who can see this profile, their role and what they’re responsible for."
            />
            <ul className="-my-2 divide-y divide-stone-100">
              {overview.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  context={context}
                  isOwner={member.userId === profile.createdBy}
                  assignments={overview.assignments[member.userId] ?? []}
                />
              ))}
            </ul>
          </Card>

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
              revokeAction={isAdmin ? revokeInvitations.bind(null, profile.id) : undefined}
              canRegenerate={isAdmin}
              updatedLabel={DateTime.fromISO(profile.passcodeUpdatedAt).setZone(zone).toFormat("d LLL yyyy")}
              expiresLabel={expiresAt.toFormat("d LLL, h:mm a")}
              expired={overview.inviteExpired}
            />
          </Card>

          <Card>
            <CardHeader
              title="What each role can do"
              icon={<ListChecks />}
              description="Checked by the server for every action, not just hidden in the app."
            />
            <RoleMatrix />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "error" }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className={cn("mt-1 text-3xl font-semibold tabular-nums tracking-tight", tone === "error" ? "text-red-700" : "text-stone-900")}>
        {value}
      </dd>
    </div>
  );
}

const APPOINTMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "Upcoming", tone: "info" },
  completed: { label: "Done", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function responsibilityStatus(item: Responsibility): { label: string; tone: Tone } {
  if (item.kind === "appointment") return APPOINTMENT_LABELS[item.status] ?? APPOINTMENT_LABELS.scheduled;
  if (item.kind === "alert") return item.status === "resolved" ? { label: "Resolved", tone: "success" } : { label: "Acknowledged", tone: "warning" };
  const status = item.status as DoseStatus;
  const tone: Tone =
    status === "taken" ? "success" : status === "pending" ? "warning" : status === "upcoming" ? "info" : status === "skipped" ? "neutral" : "error";
  return { label: DOSE_STATUS_LABELS[status] ?? status, tone };
}

function ResponsibilityList({
  title,
  items,
  timezone,
  empty,
  done = false,
}: {
  title: string;
  items: Responsibility[];
  timezone: string;
  empty: string;
  done?: boolean;
}) {
  return (
    <section aria-label={`${title} responsibilities`}>
      <h3 className="mb-3 text-[0.95rem] font-medium text-stone-500">
        {title} ({items.length})
      </h3>
      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const status = responsibilityStatus(item);
            return (
              <li key={item.key} className="rounded-xl border border-stone-200/80 bg-stone-50/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-stone-900">{item.title}</p>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-stone-600">
                  {item.kind === "alert" ? "" : `${formatInstant(new Date(item.when), timezone)} · `}
                  {done && item.doneByName
                    ? `${item.kind === "alert" ? "Followed up by" : "By"} ${item.doneByName}${item.doneAt ? ` at ${formatClock(new Date(item.doneAt), timezone)}` : ""}`
                    : item.assigneeName
                      ? `${item.assigneeName} is responsible`
                      : "Nobody assigned"}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 px-4 py-5 text-center text-[0.95rem] text-stone-500">{empty}</p>
      )}
    </section>
  );
}

function RoleMatrix() {
  const yes = <span className="font-semibold text-emerald-800">Yes</span>;
  const no = <span className="text-stone-500">No</span>;
  return (
    <table className="w-full text-left text-[0.95rem]">
      <thead>
        <tr className="border-b border-stone-200 text-sm text-stone-500">
          <th scope="col" className="pb-2 pr-2 font-medium">
            Can…
          </th>
          <th scope="col" className="pb-2 pr-2 text-center font-medium">
            Admin
          </th>
          <th scope="col" className="pb-2 pr-2 text-center font-medium">
            Caretaker
          </th>
          <th scope="col" className="pb-2 text-center font-medium">
            Family
          </th>
        </tr>
      </thead>
      <tbody>
        {capabilityMatrix().map((row) => (
          <tr key={row.capability} className="border-b border-stone-100 last:border-0">
            <th scope="row" className="py-2.5 pr-2 font-normal text-stone-800">
              {row.label}
            </th>
            <td className="py-2.5 pr-2 text-center">{row.admin ? yes : no}</td>
            <td className="py-2.5 pr-2 text-center">{row.caretaker ? yes : no}</td>
            <td className="py-2.5 text-center">{row.family ? yes : no}</td>
          </tr>
        ))}
      </tbody>
      <caption className="caption-bottom pt-3 text-left text-sm text-stone-500">
        The elder is always an admin of their own circle. Admins can make others admins.
      </caption>
    </table>
  );
}

function MemberRow({
  member,
  context,
  isOwner,
  assignments,
}: {
  member: MemberDTO;
  context: MemberContext;
  isOwner: boolean;
  assignments: string[];
}) {
  const isMe = member.userId === context.user.id;
  const canManage = context.membership.isAdmin && !isMe;
  const canRemove = canManage && (member.role !== "elder" || context.membership.role === "elder");

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={member.name} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-stone-900">
            {member.name}
            {isMe ? <span className="font-normal text-stone-500"> (you)</span> : null}
          </p>
          <p className="truncate text-sm text-stone-500">{member.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={member.role === "elder" ? "success" : "neutral"}>{ROLE_LABELS[member.role]}</Badge>
            {isOwner ? (
              <Badge tone="info">
                <Crown aria-hidden="true" /> Owner
              </Badge>
            ) : member.isAdmin ? (
              <Badge tone="info">Admin</Badge>
            ) : null}
            {!member.emailAlerts ? (
              <Badge>
                <BellRing aria-hidden="true" /> Emails off
              </Badge>
            ) : null}
          </div>
          {assignments.length ? (
            <p className="mt-2 text-sm text-stone-600">
              <span className="font-medium text-stone-700">Responsible for:</span> {assignments.join(", ")}
            </p>
          ) : null}
        </div>
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-1 pl-14">
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
