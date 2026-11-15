import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?" description="Enter your email and we’ll send you a link to choose a new one.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
