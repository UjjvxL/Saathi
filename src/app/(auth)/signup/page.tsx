import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { SignupForm } from "@/components/auth-forms";
import { Skeleton } from "@/components/ui/feedback";
import { safeNextPath } from "@/lib/navigation";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthCard
      title="Create your account"
      description="For the elder, a family member or a caretaker. Everyone gets their own login."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        {searchParams.then((query) => (
          <SignupForm next={safeNextPath(typeof query.next === "string" ? query.next : null)} />
        ))}
      </Suspense>
    </AuthCard>
  );
}
