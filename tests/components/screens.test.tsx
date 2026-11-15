import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm, LoginForm } from "@/components/auth-forms";
import { DoseTimeline } from "@/components/dose-timeline";
import { ProfileNav } from "@/components/profile-nav";
import type { DoseItem } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  pathname: "/p/abc",
  login: vi.fn(),
  signup: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  markDose: vi.fn(async () => ({ ok: true })),
  markSlot: vi.fn(async () => ({ ok: true })),
  unmarkDose: vi.fn(async () => ({ ok: true })),
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/auth", () => ({
  login: mocks.login,
  signup: mocks.signup,
  requestPasswordReset: mocks.requestPasswordReset,
  resetPassword: mocks.resetPassword,
}));
vi.mock("@/app/actions/doses", () => ({ markDose: mocks.markDose, markSlot: mocks.markSlot, unmarkDose: mocks.unmarkDose }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfileNav", () => {
  it("marks the current section for assistive technology", () => {
    mocks.pathname = "/p/abc/medications/new";
    render(<ProfileNav profileId="abc" />);
    expect(screen.getByRole("link", { name: "Medicines" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Care circle" })).toHaveAttribute("href", "/p/abc/circle");
  });

  it("treats the profile home as Today", () => {
    mocks.pathname = "/p/abc";
    render(<ProfileNav profileId="abc" />);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });
});

describe("auth forms", () => {
  it("explains expired sessions and shows login errors", async () => {
    mocks.login.mockResolvedValue({ message: "Email or password is incorrect.", values: { email: "rahul@example.com" } });
    render(<LoginForm next="/join" expired />);
    expect(screen.getByText("Please log in again to continue.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?next=%2Fjoin");

    await userEvent.type(screen.getByLabelText(/Email/), "rahul@example.com");
    await userEvent.type(screen.getByLabelText(/Password/), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect((mocks.login.mock.calls[0][1] as FormData).get("next")).toBe("/join");
  });

  it("confirms a reset email was sent", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ ok: true, message: "If an account exists for that email, we’ve sent a link." });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/Email/), "rahul@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });
});

function dose(overrides: Partial<DoseItem>): DoseItem {
  return {
    key: `${overrides.medicationId ?? "m1"}@${overrides.scheduledFor ?? "2026-11-15T02:30:00.000Z"}`,
    medicationId: "m1",
    name: "Metformin",
    dosage: "500 mg",
    form: "tablet",
    instructions: "After food",
    localDate: "2026-11-15",
    localTime: "08:00",
    scheduledFor: "2026-11-15T02:30:00.000Z",
    status: "pending",
    canMark: true,
    takenAt: null,
    loggedByName: null,
    loggedAt: null,
    assigneeId: null,
    alert: null,
    ...overrides,
  };
}

describe("DoseTimeline", () => {
  const doses = [
    dose({ medicationId: "m1", name: "Metformin" }),
    dose({ medicationId: "m2", name: "Amlodipine", dosage: "5 mg", instructions: "" }),
    dose({
      medicationId: "m3",
      name: "Vitamin D3",
      localTime: "13:00",
      scheduledFor: "2026-11-15T07:30:00.000Z",
      status: "taken",
      takenAt: "2026-11-15T07:35:00.000Z",
      loggedByName: "Priya",
    }),
    dose({ medicationId: "m4", name: "Atorvastatin", localTime: "21:00", scheduledFor: "2026-11-15T15:30:00.000Z", status: "upcoming", canMark: false }),
  ];

  it("groups doses by time and shows who marked them", () => {
    render(<DoseTimeline profileId="p1" doses={doses} timezone="Asia/Kolkata" />);
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(3);
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    expect(screen.getByText(/Taken at 1:05 PM · marked by Priya/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I took all 2/ })).toBeInTheDocument();
    // Doses more than two hours away can't be marked yet.
    const later = screen.getByText("Atorvastatin").closest("li") as HTMLElement;
    expect(within(later).queryByRole("button")).toBeNull();
  });

  it("marks a single dose with the right medicine and time", async () => {
    render(<DoseTimeline profileId="p1" doses={doses} timezone="Asia/Kolkata" />);
    await userEvent.click(screen.getByRole("button", { name: "I took it for Amlodipine" }));
    await waitFor(() => expect(mocks.markDose).toHaveBeenCalled());
    expect(mocks.markDose.mock.calls[0].slice(0, 4)).toEqual(["p1", "m2", "2026-11-15T02:30:00.000Z", "taken"]);
  });

  it("undoes a recorded dose", async () => {
    render(<DoseTimeline profileId="p1" doses={doses} timezone="Asia/Kolkata" />);
    await userEvent.click(screen.getByRole("button", { name: "Undo taken for Vitamin D3" }));
    await waitFor(() => expect(mocks.unmarkDose).toHaveBeenCalled());
    expect(mocks.unmarkDose.mock.calls[0].slice(0, 3)).toEqual(["p1", "m3", "2026-11-15T07:30:00.000Z"]);
  });
});
