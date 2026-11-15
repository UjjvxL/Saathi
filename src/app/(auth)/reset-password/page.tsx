import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { ResetPasswordForm } from "@/components/auth-forms";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { findResetUser } from "@/lib/auth/reset";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <ResetView searchParams={searchParams} />
    </Suspense>
  );
}

async function ResetView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const user = token ? await findResetUser(token) : null;

  if (!user) {
    return (
      <AuthCard title="This link has expired" description="Reset links work for 30 minutes and only once.">
        <ButtonLink href="/forgot-password" size="lg" className="w-full">
          Send a new link
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description={`For ${user.email}`}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
