import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/components/copy-button";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { TextSizeToggle } from "@/components/text-size-toggle";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar, Badge, ProgressBar } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/constants";

describe("ActionButton", () => {
  it("runs its action and shows the returned message", async () => {
    const action = vi.fn(async () => ({ ok: false, message: "This dose isn’t due yet." }));
    render(<ActionButton action={action}>I took it</ActionButton>);
    await userEvent.click(screen.getByRole("button", { name: "I took it" }));
    expect(await screen.findByRole("status")).toHaveTextContent("This dose isn’t due yet.");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("asks before destructive actions and does nothing if cancelled", async () => {
    const action = vi.fn(async () => ({ ok: true }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ActionButton action={action} confirmMessage="Delete this appointment?">
        Delete
      </ActionButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith("Delete this appointment?");
    expect(action).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("can hide success messages", async () => {
    const action = vi.fn(async () => ({ ok: true, message: "Saved" }));
    render(
      <ActionButton action={action} showSuccessMessage={false}>
        Save
      </ActionButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(screen.queryByText("Saved")).toBeNull();
  });
});

describe("TextSizeToggle", () => {
  it("switches the whole page to bigger text and remembers it", async () => {
    render(<TextSizeToggle />);
    const button = screen.getByRole("button", { name: /bigger text/i });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button);
    expect(document.documentElement.dataset.textSize).toBe("large");
    expect(localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe("large");
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));

    await userEvent.click(button);
    expect(document.documentElement.dataset.textSize).toBe("normal");
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
  });
});

describe("CopyButton", () => {
  it("copies text with this site's address filled in", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CopyButton text={"Join: {origin}/join\nCare ID: K7M2XQ"} label="Copy invite" />);
    await user.click(screen.getByRole("button", { name: "Copy invite" }));
    expect(writeText).toHaveBeenCalledWith(`Join: ${window.location.origin}/join\nCare ID: K7M2XQ`);
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });
});

describe("ReadAloudButton", () => {
  it("renders nothing where speech isn't supported", () => {
    const { container } = render(<ReadAloudButton text="Hello" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reads the text out loud in Indian English and can stop", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        rate = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    render(<ReadAloudButton text="At 8:00 AM: Metformin 500 mg" />);
    await userEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toMatchObject({ text: "At 8:00 AM: Metformin 500 mg", lang: "en-IN" });

    const stop = screen.getByRole("button", { name: "Stop reading" });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(stop);
    expect(cancel).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("display components", () => {
  it("labels progress for screen readers", () => {
    render(<ProgressBar value={140} label="Doses taken today" />);
    const bar = screen.getByRole("progressbar", { name: "Doses taken today" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows initials in avatars and keeps them out of the accessibility tree", () => {
    const { container } = render(<Avatar name="Kamala Devi" />);
    expect(container.firstChild).toHaveTextContent("KD");
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders badges", () => {
    render(<Badge tone="error" dot>Missed</Badge>);
    expect(screen.getByText("Missed")).toBeInTheDocument();
  });

  it("connects fields to their hints and errors", () => {
    render(<TextField label="Email" name="email" hint="Reminders go here." error={["Enter a valid email address"]} />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Reminders go here. Enter a valid email address");
  });
});
