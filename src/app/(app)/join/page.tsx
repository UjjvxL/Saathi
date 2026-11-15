import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { JoinForm } from "@/components/join-form";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Join a care circle" };

export default function JoinPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Join a care circle"
        description="Enter the Care ID and passcode a family member shared with you."
      />
      <Card>
        <JoinForm />
      </Card>
      <Notice tone="neutral" icon={<ShieldCheck aria-hidden="true" />} className="mt-5">
        For safety, the elder and the circle’s admins get an email whenever someone joins, and only a few attempts are
        allowed before a short lockout.
      </Notice>
    </div>
  );
}
