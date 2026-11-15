import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AssigneeSelect } from "@/components/assignee-select";
import { MedicationForm, type MedicationFormValues } from "@/components/medication-form";
import { PasscodePanel } from "@/components/passcode-panel";
import { ProfileForm } from "@/components/profile-form";
import { ScanPrescription } from "@/components/scan-prescription";

const emptyMedication: MedicationFormValues = {
  name: "",
  dosage: "",
  form: "tablet",
  instructions: "",
  times: ["08:00"],
  frequency: "daily",
  daysOfWeek: [],
  startDate: "2026-11-15",
  endDate: "",
  stock: "",
  unitsPerDose: "1",
  refillThreshold: "",
  assigneeId: "",
};

describe("MedicationForm", () => {
  it("builds the schedule with time presets, removal and weekdays", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (_state: unknown, _data: FormData) => ({}));
    render(<MedicationForm action={action} initial={emptyMedication} submitLabel="Save medicine" cancelHref="/back" />);

    expect(screen.getByLabelText("Time 1")).toHaveValue("08:00");
    expect(screen.getByRole("button", { name: /Morning · 8:00 AM/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Evening · 8:00 PM/ }));
    expect(screen.getByLabelText("Time 2")).toHaveValue("20:00");

    await user.click(screen.getByRole("button", { name: "Remove time 1" }));
    expect(screen.getByLabelText("Time 1")).toHaveValue("20:00");
    expect(screen.queryByLabelText("Time 2")).toBeNull();

    expect(screen.queryByRole("group", { name: "Days of the week" })).toBeNull();
    await user.click(screen.getByLabelText("Only on some days"));
    await user.click(screen.getByRole("checkbox", { name: "Monday" }));
    await user.click(screen.getByRole("checkbox", { name: "Friday" }));

    await user.type(screen.getByLabelText(/Medicine name/), "Amlodipine");
    await user.click(screen.getByRole("button", { name: "Save medicine" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("name")).toBe("Amlodipine");
    expect(submitted.getAll("times")).toEqual(["20:00"]);
    expect(submitted.get("frequency")).toBe("specific_days");
    expect(submitted.getAll("daysOfWeek")).toEqual(["1", "5"]);
  });

  it("shows server-side errors next to the right fields", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ errors: { times: ["Add at least one time"], name: ["Enter the medicine name"] } }));
    render(<MedicationForm action={action} initial={{ ...emptyMedication, name: "X" }} submitLabel="Save" cancelHref="/back" />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Add at least one time")).toBeInTheDocument();
    expect(screen.getByLabelText(/Medicine name/)).toHaveAttribute("aria-invalid", "true");
  });
});

describe("ProfileForm", () => {
  it("shows the Care ID and one-time passcode after creating a profile", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (_state: unknown, _data: FormData) => ({ ok: true, profileId: "p123", careId: "K7M2XQ", passcode: "042517" }));
    render(<ProfileForm mode="create" action={action} timezones={["Asia/Kolkata"]} defaultTimezone="Asia/Kolkata" />);

    expect(screen.getByLabelText(/Family/)).toBeChecked();
    await user.type(screen.getByLabelText(/Elder’s full name/), "Kamala Devi");
    await user.click(screen.getByRole("button", { name: "Create care profile" }));

    expect(await screen.findByText("Care profile created")).toBeInTheDocument();
    expect(screen.getByText("K7M2XQ")).toBeInTheDocument();
    expect(screen.getByText("042517")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open care profile" })).toHaveAttribute("href", "/p/p123");
    expect((action.mock.calls[0][1] as FormData).get("relationship")).toBe("family");
  });

  it("hides the relationship question when editing", () => {
    render(<ProfileForm mode="edit" action={vi.fn()} timezones={["Asia/Kolkata"]} defaultTimezone="Asia/Kolkata" />);
    expect(screen.queryByText("How are you related?")).toBeNull();
    expect(screen.getByRole("button", { name: "Save details" })).toBeInTheDocument();
  });
});

describe("PasscodePanel", () => {
  it("lets admins generate a new passcode that is shown once", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const action = vi.fn(async () => ({ ok: true, passcode: "918273" }));
    render(
      <PasscodePanel
        careId="K7M2XQ"
        elderName="Kamala"
        action={action}
        canRegenerate
        updatedLabel="15 Nov 2026"
        expiresLabel="22 Nov, 3:15 PM"
        expired={false}
      />,
    );

    expect(screen.getByText(/Hidden · set 15 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByText(/works until 22 Nov, 3:15 PM/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Generate a new passcode/ }));
    expect(await screen.findByText("918273")).toBeInTheDocument();
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
  });

  it("tells non-admins who to ask", () => {
    render(
      <PasscodePanel
        careId="K7M2XQ"
        elderName="Kamala"
        action={vi.fn()}
        canRegenerate={false}
        updatedLabel="today"
        expiresLabel="22 Nov"
        expired={false}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Ask an admin/)).toBeInTheDocument();
  });

  it("says when invitations are off, and lets admins turn them off", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const revoke = vi.fn(async () => ({ ok: true, message: "Invitations are off." }));
    const { rerender } = render(
      <PasscodePanel
        careId="K7M2XQ"
        elderName="Kamala"
        action={vi.fn()}
        revokeAction={revoke}
        canRegenerate
        updatedLabel="today"
        expiresLabel="22 Nov"
        expired={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Turn off invitations/ }));
    await waitFor(() => expect(revoke).toHaveBeenCalled());

    rerender(
      <PasscodePanel
        careId="K7M2XQ"
        elderName="Kamala"
        action={vi.fn()}
        revokeAction={revoke}
        canRegenerate
        updatedLabel="today"
        expiresLabel="22 Nov"
        expired
      />,
    );
    expect(screen.getByText(/Invitations are off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Turn off invitations/ })).toBeNull();
  });
});

describe("AssigneeSelect", () => {
  const members = [
    { userId: "u1", name: "Priya Nair", role: "caretaker" as const },
    { userId: "u2", name: "Rahul Sharma", role: "family" as const },
  ];

  it("lists the circle's members with their roles", () => {
    render(<AssigneeSelect label="Responsible person" members={members} defaultValue="u1" canAssign />);
    const select = screen.getByLabelText("Responsible person");
    expect(select).toHaveValue("u1");
    expect(screen.getByRole("option", { name: "Nobody in particular" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Rahul Sharma (family)" })).toBeInTheDocument();
  });

  it("is read-only without permission, keeping the current choice", () => {
    const { container } = render(
      <AssigneeSelect label="Responsible person" members={members} defaultValue="u2" canAssign={false} />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Rahul Sharma (family)")).toBeInTheDocument();
    expect(container.querySelector('input[name="assigneeId"]')).toHaveValue("u2");
  });
});

describe("ScanPrescription", () => {
  it("explains when AI scanning is switched off", () => {
    render(<ScanPrescription profileId="p1" action={vi.fn()} aiEnabled={false} />);
    expect(screen.getByText("AI scanning is not switched on")).toBeInTheDocument();
  });

  it("lets a person review and edit what the AI read before saving", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        medicines: [
          { name: "Paracetamol", dosage: "500 mg", form: "tablet", times: ["08:00", "20:00"], instructions: "After food", durationDays: 5 },
          { name: "Cough syrup", dosage: "5 ml", form: "syrup", times: ["21:00"], instructions: "", durationDays: null },
        ],
        notes: "",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const action = vi.fn(async (_state: unknown, _data: FormData) => ({}));
    render(<ScanPrescription profileId="p1" action={action} aiEnabled />);

    await user.upload(screen.getByLabelText(/Take or upload a photo/), new File(["img"], "rx.jpg", { type: "image/jpeg" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/profiles/p1/scan", expect.objectContaining({ method: "POST" }));
    expect(await screen.findByDisplayValue("Paracetamol")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 2 medicines" })).toBeInTheDocument();

    // Fix the dose and leave out the syrup.
    const dose = screen.getByDisplayValue("500 mg");
    await user.clear(dose);
    await user.type(dose, "650 mg");
    await user.click(screen.getAllByRole("checkbox", { name: "Add this medicine" })[1]);
    await user.click(screen.getByRole("button", { name: "Add 1 medicine" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const payload = JSON.parse(String((action.mock.calls[0][1] as FormData).get("payload")));
    expect(payload).toEqual([
      { name: "Paracetamol", dosage: "650 mg", form: "tablet", instructions: "After food", times: ["08:00", "20:00"], durationDays: 5 },
    ]);
    vi.unstubAllGlobals();
  });

  it("shows the reader's error message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "Please try a clearer, well-lit photo." }) })),
    );
    render(<ScanPrescription profileId="p1" action={vi.fn()} aiEnabled />);
    await user.upload(screen.getByLabelText(/Take or upload a photo/), new File(["img"], "rx.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try a clearer, well-lit photo.");
    vi.unstubAllGlobals();
  });
});
