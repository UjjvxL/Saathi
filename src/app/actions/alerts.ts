"use server";

import { refresh } from "next/cache";
import { acknowledgeAlert, loadAckLink, type AckOutcome } from "@/lib/alerts";
import { authorizeMember } from "@/lib/auth/guard";
import type { FormState } from "@/lib/validation";
import { guarded } from "./helpers";

function ackMessage(outcome: Extract<AckOutcome, { ok: true }>): FormState {
  if (!outcome.already) return { ok: true, message: "Thank you. Everyone can see you’re following up." };
  if (outcome.alert.status === "resolved") return { ok: true, message: "This alert is already resolved." };
  return { ok: true, message: `${outcome.alert.acknowledgedByName ?? "Someone"} is already following up.` };
}

/** "I'm on it" inside the app. */
export async function acknowledgeAlertAction(
  profileId: string,
  alertId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { capability: "acknowledgeAlerts" });
    const outcome = await acknowledgeAlert({
      profile: context.profile,
      alertId,
      actor: { id: context.user.id, name: context.user.name },
    });
    if (!outcome.ok) return { message: outcome.message };
    refresh();
    return ackMessage(outcome);
  });
}

/**
 * "I'm on it" from an alert email. The personal 24-hour token names one alert and one member (who
 * must still be in the circle), so a caretaker can respond from their inbox without logging in.
 */
export async function acknowledgeFromEmail(token: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const link = await loadAckLink(token);
  if (!link) return { message: "This link has expired. Please open Saathi to see the alert." };
  const outcome = await acknowledgeAlert({ profile: link.profile, alertId: link.alert.id, actor: link.user });
  if (!outcome.ok) return { message: outcome.message };
  refresh();
  return ackMessage(outcome);
}
