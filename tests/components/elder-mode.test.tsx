import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NowCard } from "@/components/elder/elder-doses";
import { ElderMode, type ElderModeProps } from "@/components/elder/elder-mode";
import { TextSizeControl } from "@/components/elder/text-size-control";
import { VoiceAssistant } from "@/components/elder/voice-assistant";
import { TextSizeToggle } from "@/components/text-size-toggle";
import type { DoseItem } from "@/lib/types";
import type { VoiceContext } from "@/lib/voice/replies";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  markDose: vi.fn(async (..._args: unknown[]) => ({ ok: true }) as { ok?: boolean; message?: string }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }), usePathname: () => "/elder/p1" }));
vi.mock("@/app/actions/doses", () => ({ markDose: mocks.markDose, markSlot: vi.fn(), unmarkDose: vi.fn() }));

/** A stand-in for the browser's SpeechRecognition that the test can "speak" into. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 1;
  started = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  say(transcript: string, confidence = 0.92) {
    const result = Object.assign([{ transcript, confidence }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [result] });
    this.onend?.();
  }
  fail(error: string) {
    this.onerror?.({ error });
    this.onend?.();
  }
  static latest() {
    return FakeRecognition.instances[FakeRecognition.instances.length - 1];
  }
}

function dose(overrides: Partial<DoseItem>): DoseItem {
  return {
    key: `${overrides.medicationId ?? "m1"}@${overrides.scheduledFor ?? "2026-11-15T02:30:00.000Z"}`,
    medicationId: "m1",
    name: "Metformin",
    dosage: "500 mg",
    form: "tablet",
    instructions: "after food",
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

const metformin = dose({});
const atorvastatin = dose({
  medicationId: "m2",
  name: "Atorvastatin",
  dosage: "10 mg",
  instructions: "",
  localTime: "20:00",
  scheduledFor: "2026-11-15T14:30:00.000Z",
  status: "upcoming",
  canMark: false,
});

const voiceContext: VoiceContext = {
  elderName: "Kamala Devi",
  doses: [metformin, atorvastatin],
  appointments: [],
  canLog: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  FakeRecognition.instances = [];
});

afterEach(() => {
  Reflect.deleteProperty(window, "webkitSpeechRecognition");
});

function installRecognition() {
  Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true, writable: true });
}

async function ask(question: string) {
  await userEvent.type(screen.getByLabelText(/type your question/i), question);
  await userEvent.click(screen.getByRole("button", { name: "Ask" }));
}

describe("VoiceAssistant without speech recognition", () => {
  it("shows a typed fallback that answers from the schedule", async () => {
    render(<VoiceAssistant profileId="p1" context={voiceContext} onRemind={vi.fn()} />);
    expect(screen.getByText(/Voice isn’t available in this browser/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tap to speak" })).toBeNull();

    await ask("What is my next medicine?");
    expect(screen.getByText(/“What is my next medicine\?”/)).toBeInTheDocument();
    expect(screen.getByText("Metformin 500 mg, after food is due now. Tell me when you have taken it.")).toBeInTheDocument();
  });

  it("asks before marking a dose, and marks it only after yes", async () => {
    render(<VoiceAssistant profileId="p1" context={voiceContext} onRemind={vi.fn()} />);
    await ask("I have taken my medicine");
    expect(screen.getByText("You’re confirming Metformin 500 mg, the 8:00 AM dose. Is that right? Say yes or no.")).toBeInTheDocument();
    expect(mocks.markDose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Yes, that’s right" }));
    await waitFor(() => expect(screen.getByText("Done. I’ve marked Metformin 500 mg as taken. Well done!")).toBeInTheDocument());
    expect(mocks.markDose).toHaveBeenCalledTimes(1);
    expect(mocks.markDose.mock.calls[0].slice(0, 5)).toEqual(["p1", "m1", "2026-11-15T02:30:00.000Z", "taken", {}]);
    expect(mocks.markDose.mock.calls[0][5]).toBeInstanceOf(FormData);
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Yes, that’s right" })).toBeNull();
  });

  it("changes nothing when the answer is no, and keeps asking when it's unclear", async () => {
    render(<VoiceAssistant profileId="p1" context={voiceContext} onRemind={vi.fn()} />);
    await ask("I have taken my medicine");
    await ask("banana");
    expect(screen.getByText("Please say yes to confirm, or no to cancel.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, that’s right" })).toBeInTheDocument();

    await ask("no");
    expect(screen.getByText("Okay, I haven’t changed anything.")).toBeInTheDocument();
    expect(mocks.markDose).not.toHaveBeenCalled();
  });

  it("reports a failed save honestly", async () => {
    mocks.markDose.mockResolvedValueOnce({ message: "This dose isn’t due yet. It can be marked up to 2 hours early." });
    render(<VoiceAssistant profileId="p1" context={voiceContext} onRemind={vi.fn()} />);
    await ask("I have taken my medicine");
    await ask("yes");
    await waitFor(() =>
      expect(
        screen.getByText("Sorry, I couldn’t update Metformin 500 mg. This dose isn’t due yet. It can be marked up to 2 hours early."),
      ).toBeInTheDocument(),
    );
  });

  it("sets an in-page reminder", async () => {
    const onRemind = vi.fn();
    render(<VoiceAssistant profileId="p1" context={voiceContext} onRemind={onRemind} />);
    await userEvent.click(screen.getByRole("button", { name: "What can you do?" }));
    expect(screen.getByText(/You can ask me/)).toBeInTheDocument();
    await ask("remind me in 15 minutes");
    expect(onRemind).toHaveBeenCalledWith(15);
  });

  it("doesn't offer to record doses for accounts that can't", async () => {
    render(<VoiceAssistant profileId="p1" context={{ ...voiceContext, canLog: false }} onRemind={vi.fn()} />);
    await ask("I have taken my medicine");
    expect(screen.getByText(/can’t update medicines/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, that’s right" })).toBeNull();
  });
});

describe("VoiceAssistant with speech recognition", () => {
  it("listens, shows what it heard, and confirms by voice", async () => {
    installRecognition();
    render(<VoiceAssistant profileId="p1" context={voiceContext} onRemind={vi.fn()} />);
    expect(screen.queryByText(/Voice isn’t available/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Tap to speak" }));
    const first = FakeRecognition.latest();
    expect(first).toMatchObject({ started: true, lang: "en-IN", continuous: false, interimResults: false, maxAlternatives: 3 });
    expect(screen.getByRole("button", { name: "Stop listening" })).toHaveAttribute("aria-pressed", "true");

    act(() => first.say("have I taken my morning medicines"));
    expect(screen.getByText(/“have I taken my morning medicines”/)).toBeInTheDocument();
    expect(screen.getByText("Not yet. Still to take: Metformin 500 mg, due at 8:00 AM.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tap to speak" }));
    act(() => FakeRecognition.latest().say("I have taken my medicine"));
    expect(screen.getByText(/You’re confirming Metformin 500 mg/)).toBeInTheDocument();

    // It listens for the answer by itself (here straight away, since this test browser can't talk).
    const answer = FakeRecognition.latest();
    expect(answer.started).toBe(true);
    await act(async () => answer.say("yes"));
    await waitFor(() => expect(mocks.markDose).toHaveBeenCalledTimes(1));
    expect(mocks.markDose.mock.calls[0][3]).toBe("taken");
  });

  it("asks again instead of acting on a low-confidence answer", async () => {
    installRecognition();
    render(<VoiceAssistant profileId="p1" context={voiceContext} onRemind={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Tap to speak" }));
    act(() => FakeRecognition.latest().say("I have taken my medicine", 0.1));
    expect(screen.getByText("Sorry, I didn’t catch that clearly. Please say it again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, that’s right" })).toBeNull();
  });

  it("explains how to allow the microphone when it is blocked", async () => {
    installRecognition();
    render(<VoiceAssistant profileId="p1" context={voiceContext} onRemind={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Tap to speak" }));
    act(() => FakeRecognition.latest().fail("not-allowed"));
    expect(screen.getByText(/isn’t allowed to use the microphone/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tap to speak" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText(/type your question/i)).toBeInTheDocument();
  });
});

describe("NowCard", () => {
  it("shows what to take now with big buttons", async () => {
    render(<NowCard profileId="p1" doses={[metformin, atorvastatin]} canLog />);
    expect(screen.getByRole("heading", { name: "Time to take now" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "I took it for Metformin" }));
    await waitFor(() => expect(mocks.markDose).toHaveBeenCalled());
    expect(mocks.markDose.mock.calls[0].slice(0, 4)).toEqual(["p1", "m1", "2026-11-15T02:30:00.000Z", "taken"]);
  });

  it("hides the buttons from viewers who can't record doses", () => {
    render(<NowCard profileId="p1" doses={[metformin]} canLog={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the next medicine, or that the day is done", () => {
    const { rerender } = render(<NowCard profileId="p1" doses={[atorvastatin]} canLog />);
    expect(screen.getByRole("heading", { name: "Next medicine at 8:00 PM" })).toBeInTheDocument();
    rerender(<NowCard profileId="p1" doses={[{ ...metformin, status: "taken" }]} canLog />);
    expect(screen.getByRole("heading", { name: "All done for today" })).toBeInTheDocument();
  });
});

describe("text size", () => {
  it("steps through normal, large and extra large, and remembers it", async () => {
    render(
      <>
        <TextSizeControl />
        <TextSizeToggle />
      </>,
    );
    const control = within(screen.getByRole("group", { name: "Text size" }));
    const bigger = control.getByRole("button", { name: "Bigger text" });
    expect(control.getByRole("button", { name: "Smaller text" })).toBeDisabled();
    expect(control.getByText("Normal")).toBeInTheDocument();

    await userEvent.click(bigger);
    expect(document.documentElement.dataset.textSize).toBe("large");
    await userEvent.click(bigger);
    expect(document.documentElement.dataset.textSize).toBe("xlarge");
    expect(localStorage.getItem("saathi-text-size")).toBe("xlarge");
    expect(control.getByText("Extra large")).toBeInTheDocument();
    expect(bigger).toBeDisabled();

    // The header toggle treats extra large as "bigger text on", and switches back to normal.
    const toggle = screen.getAllByRole("button", { name: "Bigger text" }).find((button) => button.hasAttribute("aria-pressed"));
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle as HTMLElement);
    expect(document.documentElement.dataset.textSize).toBe("normal");
    expect(control.getByRole("button", { name: "Smaller text" })).toBeDisabled();
  });
});

describe("ElderMode", () => {
  const props: ElderModeProps = {
    profileId: "p1",
    elderName: "Kamala Devi",
    timezone: "Asia/Kolkata",
    todayLabel: "Sunday, 15 November",
    doses: [metformin, atorvastatin],
    appointments: [
      {
        id: "a1",
        doctorName: "Dr. Mehta",
        specialty: "Cardiologist",
        location: "Apollo Hospital",
        dateTime: "2026-11-19T05:00:00.000Z",
        whenLabel: "Thursday, 19 November at 10:30 AM",
        shortLabel: "Thu, 19 Nov · 10:30 AM",
      },
    ],
    emergencyContact: { name: "Rahul", phone: "+91 98765 43210", href: "tel:+919876543210" },
    canLog: true,
    followUpAfterMinutes: 15,
  };

  it("puts everything an elder needs on one large screen", () => {
    render(<ElderMode {...props} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/, Kamala$/);
    expect(screen.getByText(/Sunday, 15 November/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to full view/ })).toHaveAttribute("href", "/p/p1");
    expect(screen.getByRole("heading", { name: "Time to take now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask Saathi" })).toBeInTheDocument();
    const list = screen.getByRole("heading", { name: "Today’s medicines" }).closest("section") as HTMLElement;
    expect(within(list).getByText("Later today")).toBeInTheDocument();
    expect(screen.getByText("Thursday, 19 November at 10:30 AM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call Rahul/ })).toHaveAttribute("href", "tel:+919876543210");
  });

  it("turns spoken reminders on and remembers the choice", async () => {
    render(<ElderMode {...props} />);
    const toggle = screen.getByRole("button", { name: /Read reminders aloud/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("saathi-spoken-reminders")).toBe("on");
  });
});
