import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteMedication, updateMedication } from "@/app/actions/medications";
import { MedicationForm } from "@/components/medication-form";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingCards, Notice, PageHeader } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { getMedication, getMembers } from "@/lib/data";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit medicine" };

export default function EditMedicationPage({ params }: PageProps<"/p/[profileId]/medications/[medicationId]">) {
  return (
    <Suspense fallback={<LoadingCards count={2} label="Loading medicine" />}>
      <EditMedicationView params={params} />
    </Suspense>
  );
}

async function EditMedicationView({ params }: { params: Promise<{ profileId: string; medicationId: string }> }) {
  const { profileId, medicationId } = await params;
  const { profile, membership } = await requireMemberContext(profileId);
  const [med, members] = await Promise.all([getMedication(profile.id, medicationId), getMembers(profile.id)]);
  if (!med) notFound();
  if (!can(membership, "manageMedications")) {
    return <Notice tone="info">Only caretakers and admins can change medicine schedules.</Notice>;
  }

  return (
    <>
      <PageHeader as="h2" title={`Edit ${med.name}`} description="Changes apply to doses from now on." />
      <div className="space-y-6">
        <Card>
          <MedicationForm
            action={updateMedication.bind(null, profile.id, med.id)}
            submitLabel="Save changes"
            cancelHref={`/p/${profile.id}/medications`}
            initial={{
              name: med.name,
              dosage: med.dosage,
              form: med.form,
              instructions: med.instructions,
              times: med.times,
              frequency: med.frequency,
              daysOfWeek: med.daysOfWeek,
              startDate: med.startDate,
              endDate: med.endDate ?? "",
              stock: med.stock === null ? "" : String(med.stock),
              unitsPerDose: String(med.unitsPerDose),
              refillThreshold: med.refillThreshold === null ? "" : String(med.refillThreshold),
              assigneeId: med.assigneeId ?? "",
            }}
            members={members}
            canAssign={can(membership, "assignResponsibilities")}
          />
        </Card>
        <Card className="border-red-200">
          <CardHeader
            title="Delete medicine"
            description="Only for mistakes. To stop a medicine but keep its history, use “Stop” on the Medicines page."
          />
          <ActionButton
            action={deleteMedication.bind(null, profile.id, med.id)}
            variant="danger"
            confirmMessage={`Delete ${med.name} and its whole dose history? This can’t be undone.`}
          >
            <Trash2 aria-hidden="true" /> Delete permanently
          </ActionButton>
        </Card>
      </div>
    </>
  );
}
