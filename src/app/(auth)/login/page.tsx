import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/auth-forms";
import { Skeleton } from "@/components/ui/feedback";
import { safeNextPath } from "@/lib/navigation";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard title="Welcome back" description="Log in to see today’s medicines and appointments.">
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        {searchParams.then((query) => (
          <LoginForm
            next={safeNextPath(typeof query.next === "string" ? query.next : null)}
            expired={query.expired !== undefined}
          />
        ))}
      </Suspense>
    </AuthCard>
  );
}
