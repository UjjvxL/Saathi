import type { Metadata } from "next";
import { createProfile } from "@/app/actions/profiles";
import { ProfileForm } from "@/components/profile-form";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { listTimezones } from "@/lib/timezones";

export const metadata: Metadata = { title: "New care profile" };

export default function NewProfilePage() {
  return (
    <>
      <PageHeader
        title="New care profile"
        description="Set up a shared profile for an elder. You can add medicines and invite family next."
      />
      <Card>
        <ProfileForm mode="create" action={createProfile} timezones={listTimezones()} defaultTimezone={DEFAULT_TIMEZONE} />
      </Card>
    </>
  );
}
