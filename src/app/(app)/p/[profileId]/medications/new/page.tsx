import { PencilLine, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { addScannedMedications, createMedication } from "@/app/actions/medications";
import { MedicationForm } from "@/components/medication-form";
import { ScanPrescription } from "@/components/scan-prescription";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingCards, PageHeader } from "@/components/ui/feedback";
import { isAiConfigured } from "@/lib/ai/gemini";
import { requireMemberContext } from "@/lib/auth/dal";
import { todayInZone } from "@/lib/schedule";

export const metadata: Metadata = { title: "Add medicine" };

export default function NewMedicationPage({ params }: PageProps<"/p/[profileId]/medications/new">) {
  return (
    <>
      <PageHeader as="h2" title="Add medicines" description="Scan the prescription, or type a medicine in yourself." />
      <Suspense fallback={<LoadingCards count={2} label="Loading" />}>
        <NewMedicationView params={params} />
      </Suspense>
    </>
  );
}

async function NewMedicationView({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const { profile } = await requireMemberContext(profileId);
  const today = todayInZone(profile.timezone);

  return (
    <div className="space-y-6">
      <Card id="scan" className="scroll-mt-24">
        <CardHeader
          title="Scan a prescription"
          icon={<ScanLine />}
          description="Gemini AI reads the medicines and timings for you to check."
        />
        <ScanPrescription
          profileId={profile.id}
          action={addScannedMedications.bind(null, profile.id)}
          aiEnabled={isAiConfigured()}
        />
      </Card>

      <Card>
        <CardHeader title="Add a medicine yourself" icon={<PencilLine />} />
        <MedicationForm
          action={createMedication.bind(null, profile.id)}
          submitLabel="Save medicine"
          cancelHref={`/p/${profile.id}/medications`}
          initial={{
            name: "",
            dosage: "",
            form: "tablet",
            instructions: "",
            times: ["08:00"],
            frequency: "daily",
            daysOfWeek: [],
            startDate: today,
            endDate: "",
            stock: "",
            unitsPerDose: "1",
            refillThreshold: "",
          }}
        />
      </Card>
    </div>
  );
}
