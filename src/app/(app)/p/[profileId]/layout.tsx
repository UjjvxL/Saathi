import { HeartPulse, Phone, ShieldAlert } from "lucide-react";
import { Suspense } from "react";
import { ProfileNav } from "@/components/profile-nav";
import { Avatar, Skeleton } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/constants";

export default function ProfileLayout({ children, params }: LayoutProps<"/p/[profileId]">) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<HeaderSkeleton />}>
        <ProfileHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

async function ProfileHeader({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const { profile, membership } = await requireMemberContext(profileId);
  const chip = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ring-inset [&_svg]:size-3.5";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={profile.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">{profile.name}</h1>
          <p className="mt-0.5 text-[0.95rem] text-stone-500">
            You’re {membership.role === "elder" ? "the elder" : ROLE_LABELS[membership.role].toLowerCase()}
            {membership.isAdmin ? " · Admin" : ""} · Care ID{" "}
            <span className="font-mono font-medium tracking-wider text-stone-700">{profile.careId}</span>
          </p>
        </div>
      </div>

      {profile.allergies.length || profile.conditions.length || profile.emergencyContactPhone ? (
        <ul className="flex flex-wrap gap-2">
          {profile.allergies.length ? (
            <li className={`${chip} bg-red-50 font-medium text-red-800 ring-red-600/15`}>
              <ShieldAlert aria-hidden="true" /> Allergic to {profile.allergies.join(", ")}
            </li>
          ) : null}
          {profile.conditions.length ? (
            <li className={`${chip} bg-white text-stone-700 ring-stone-200`}>
              <HeartPulse aria-hidden="true" /> {profile.conditions.join(", ")}
            </li>
          ) : null}
          {profile.emergencyContactPhone ? (
            <li>
              <a
                href={`tel:${profile.emergencyContactPhone.replace(/[^\d+]/g, "")}`}
                className={`${chip} bg-white text-stone-700 ring-stone-200 transition-colors hover:bg-stone-50 hover:text-stone-900`}
              >
                <Phone aria-hidden="true" /> Emergency: {profile.emergencyContactName ?? "Call"} ·{" "}
                {profile.emergencyContactPhone}
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}

      <ProfileNav profileId={profile.id} />
    </div>
  );
}
