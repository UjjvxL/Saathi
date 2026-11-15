"use client";

import { Camera, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { MED_FORMS } from "@/lib/constants";
import type { FormState, ScannedMedicine } from "@/lib/validation";
import { Button } from "./ui/button";
import { Notice } from "./ui/feedback";
import { inputStyles } from "./ui/field";
import { FormMessage, SubmitButton } from "./ui/form-bits";

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

interface ReviewItem {
  id: number;
  include: boolean;
  name: string;
  dosage: string;
  form: ScannedMedicine["form"];
  timesText: string;
  instructions: string;
  durationDays: string;
}

/** Matches the server limit (hosts like Vercel reject request bodies above 4.5 MB). */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Shrinks big phone photos before upload (faster, and well under the size limit). */
async function prepareImage(file: File): Promise<Blob> {
  if (file.type === "image/heic" || file.type === "image/heif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function ScanPrescription({
  profileId,
  action,
  aiEnabled,
}: {
  profileId: string;
  action: FormAction;
  aiEnabled: boolean;
}) {
  const inputId = useId();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [state, formAction, saving] = useActionState(action, {});

  if (!aiEnabled) {
    return (
      <Notice tone="neutral" icon={<Sparkles aria-hidden="true" />} title="AI scanning is not switched on">
        Ask the person running this server to add a Gemini API key (GEMINI_API_KEY). Until then, add medicines with
        the form below.
      </Notice>
    );
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const image = await prepareImage(file);
      if (image.size > MAX_UPLOAD_BYTES) {
        throw new Error("That photo is too large. Please take a new photo or use one under 4 MB.");
      }
      const body = new FormData();
      body.append("image", image, image === file ? file.name : "prescription.jpg");
      const response = await fetch(`/api/profiles/${profileId}/scan`, { method: "POST", body });
      // Hosting platforms can answer with a plain-text error page (e.g. "payload too large"), so don't assume JSON.
      let data: { medicines?: ScannedMedicine[]; notes?: string; error?: string } = {};
      try {
        data = await response.json();
      } catch {
        // Not JSON: fall through to the generic message below.
      }
      if (!response.ok || !data.medicines) {
        throw new Error(
          data.error ??
            (response.status === 413
              ? "That photo is too large. Please use one under 4 MB."
              : "Couldn’t read the prescription. Please try again."),
        );
      }
      setNotes(data.notes ?? "");
      setItems(
        data.medicines.map((medicine, index) => ({
          id: index,
          include: true,
          name: medicine.name,
          dosage: medicine.dosage,
          form: medicine.form,
          timesText: medicine.times.join(", "),
          instructions: medicine.instructions,
          durationDays: medicine.durationDays ? String(medicine.durationDays) : "",
        })),
      );
      if (!data.medicines.length) setError(data.notes || "No medicines were found in that photo.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t read the prescription.");
    } finally {
      setReading(false);
    }
  }

  const update = (id: number, patch: Partial<ReviewItem>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const selected = items.filter((item) => item.include && item.name.trim());
  const payload = JSON.stringify(
    selected.map((item) => ({
      name: item.name.trim(),
      dosage: item.dosage.trim(),
      form: item.form,
      instructions: item.instructions.trim(),
      times: item.timesText.split(/[\s,]+/).filter(Boolean),
      durationDays: item.durationDays ? Number(item.durationDays) : null,
    })),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50/60 px-6 py-8 text-center">
        <label
          htmlFor={inputId}
          className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-stone-900 px-6 font-medium text-white shadow-sm transition-colors hover:bg-stone-800 has-focus-visible:ring-4 has-focus-visible:ring-stone-900/20"
        >
          {reading ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Camera className="size-5" aria-hidden="true" />}
          {reading ? "Reading prescription…" : items.length ? "Scan another photo" : "Take or upload a photo"}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={reading}
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <p className="text-sm text-stone-500">A clear, well-lit photo of the prescription or medicine strip works best.</p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {items.length ? (
        <form action={formAction} className="space-y-4">
          <Notice tone="info" icon={<Sparkles aria-hidden="true" />} title="Please check before saving">
            AI can make mistakes. Compare each medicine with the prescription and fix anything that’s wrong.
            {notes ? <span className="mt-1 block text-sm">Note from the reader: {notes}</span> : null}
          </Notice>
          <FormMessage state={state} />
          <input type="hidden" name="payload" value={payload} />
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft has-checked:border-stone-400"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-3 font-medium">
                    <input
                      type="checkbox"
                      checked={item.include}
                      onChange={(event) => update(item.id, { include: event.target.checked })}
                      className="size-5 accent-stone-900"
                    />
                    Add this medicine
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setItems((current) => current.filter((i) => i.id !== item.id))}
                    aria-label={`Remove ${item.name || "this medicine"} from the list`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReviewInput label="Name" value={item.name} onChange={(name) => update(item.id, { name })} />
                  <ReviewInput label="Dose" value={item.dosage} onChange={(dosage) => update(item.id, { dosage })} />
                  <ReviewInput
                    label="Times (24h, comma separated)"
                    value={item.timesText}
                    onChange={(timesText) => update(item.id, { timesText })}
                  />
                  <ReviewInput
                    label="Instructions"
                    value={item.instructions}
                    onChange={(instructions) => update(item.id, { instructions })}
                  />
                  <div className="space-y-1">
                    <span className="block text-sm font-medium text-stone-700">Form</span>
                    <select
                      aria-label="Form"
                      value={item.form}
                      onChange={(event) => update(item.id, { form: event.target.value as ReviewItem["form"] })}
                      className={inputStyles}
                    >
                      {MED_FORMS.map((form) => (
                        <option key={form} value={form}>
                          {form.charAt(0).toUpperCase() + form.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <ReviewInput
                    label="For how many days (optional)"
                    value={item.durationDays}
                    inputMode="numeric"
                    onChange={(durationDays) => update(item.id, { durationDays: durationDays.replace(/\D/g, "") })}
                  />
                </div>
              </li>
            ))}
          </ul>
          <SubmitButton pending={saving} size="lg" disabled={!selected.length}>
            Add {selected.length} medicine{selected.length === 1 ? "" : "s"}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function ReviewInput({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "numeric";
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className={inputStyles}
      />
    </div>
  );
}
