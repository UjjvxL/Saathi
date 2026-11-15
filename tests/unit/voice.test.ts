import { describe, expect, it } from "vitest";
import { recognitionErrorMessage, speechChunks } from "@/components/elder/speech";
import type { DoseStatus } from "@/lib/constants";
import { announcementsDue } from "@/lib/voice/announcements";
import { confirmationAnswer, normalize, parseCommand, parseMinutes, type VoiceCommand } from "@/lib/voice/commands";
import {
  announcement,
  joinList,
  outcomeReply,
  partOfDay,
  reminderMessage,
  respond,
  type VoiceContext,
  type VoiceDose,
} from "@/lib/voice/replies";

// 09:00 in India on Sun 15 Nov 2026.
const NOW = new Date("2026-11-15T03:30:00.000Z");

/** A dose on 15 Nov 2026 at a local India time. */
function dose(name: string, localTime: string, status: DoseStatus, extra: Partial<VoiceDose> = {}): VoiceDose {
  const [hours, minutes] = localTime.split(":").map(Number);
  const scheduledFor = new Date(Date.UTC(2026, 10, 15, 0, hours * 60 + minutes - 330)).toISOString();
  return {
    key: `${name}@${scheduledFor}`,
    medicationId: name.toLowerCase(),
    name,
    dosage: "5 mg",
    instructions: "",
    localTime,
    scheduledFor,
    status,
    canMark: true,
    ...extra,
  };
}

function context(doses: VoiceDose[], extra: Partial<VoiceContext> = {}): VoiceContext {
  return { elderName: "Kamala Devi", doses, appointments: [], canLog: true, ...extra };
}

const intent = (text: string | string[]) => parseCommand(text).intent;

describe("parseCommand", () => {
  it("understands the example questions and statements", () => {
    expect(intent("What medicines do I need to take today?")).toBe("list_today");
    expect(parseCommand("Have I taken my morning medicines?")).toMatchObject({ intent: "check_taken", part: "morning" });
    expect(intent("When is my next doctor's appointment?")).toBe("next_appointment");
    expect(parseCommand("Remind me to take my medicine.")).toMatchObject({ intent: "remind_me", minutes: 10 });
    expect(intent("I have taken my medicine.")).toBe("mark_taken");
  });

  it("understands other everyday ways of asking", () => {
    expect(parseCommand("did I take my evening tablet")).toMatchObject({ intent: "check_taken", part: "evening" });
    expect(parseCommand("have I taken my medicines")).toMatchObject({ intent: "check_taken", part: null });
    expect(intent("What's my next medicine?")).toBe("next_dose");
    expect(intent("what do I take now")).toBe("next_dose");
    expect(intent("tell me my medicines")).toBe("list_today");
    expect(intent("I took my Metformin")).toBe("mark_taken");
    expect(intent("I had my tablets")).toBe("mark_taken");
    expect(intent("skip my evening medicine")).toBe("mark_skipped");
    expect(intent("what can you do")).toBe("help");
  });

  it("understands common Hinglish", () => {
    expect(intent("maine dawai le li")).toBe("mark_taken");
    expect(intent("aaj ki dawai batao")).toBe("list_today");
    expect(intent("doctor kab hai")).toBe("next_appointment");
    expect(parseCommand("kya maine subah ki dawai li")).toMatchObject({ intent: "check_taken", part: "morning" });
    expect(intent("haan")).toBe("yes");
    expect(intent("nahi")).toBe("no");
  });

  it("never treats a denial as having taken a dose", () => {
    expect(intent("I have not taken my medicine yet")).toBe("next_dose");
    expect(intent("I didn't take my tablets")).toBe("next_dose");
  });

  it("doesn't mistake a question that starts with okay for a yes", () => {
    expect(intent("ok what's my next medicine")).toBe("next_dose");
    expect(intent("okay")).toBe("yes");
  });

  it("reads how long to wait for a reminder", () => {
    expect(parseMinutes(normalize("remind me in 5 minutes"))).toBe(5);
    expect(parseMinutes(normalize("remind me in twenty five minutes"))).toBe(25);
    expect(parseMinutes(normalize("remind me in half an hour"))).toBe(30);
    expect(parseMinutes(normalize("remind me in an hour"))).toBe(60);
    expect(parseMinutes(normalize("remind me in 2 hours"))).toBe(120);
    expect(parseMinutes(normalize("remind me in 900 minutes"))).toBe(240);
    expect(parseMinutes(normalize("remind me later"))).toBeNull();
    expect(parseCommand("remind me in 15 minutes")).toMatchObject({ intent: "remind_me", minutes: 15 });
  });

  it("uses the first speech alternative that makes sense", () => {
    expect(intent(["blue lemon", "what is my next medicine"])).toBe("next_dose");
    expect(parseCommand(["tell me a joke"])).toEqual({ intent: "unknown", text: "tell me a joke" });
    expect(intent("")).toBe("unknown");
  });
});

describe("confirmationAnswer", () => {
  it("accepts clear yeses", () => {
    for (const answer of ["yes", "Yes!", "haan ji", "yes I took it", "okay", "I did", "maine le li"]) {
      expect(confirmationAnswer(answer)).toBe("yes");
    }
  });

  it("treats anything hesitant or negative as no", () => {
    for (const answer of ["no", "nahi", "not yet", "yes but not that one", "cancel", "I did not"]) {
      expect(confirmationAnswer(answer)).toBe("no");
    }
  });

  it("returns null when the answer is unclear", () => {
    expect(confirmationAnswer("banana")).toBeNull();
    expect(confirmationAnswer(["", "maybe later"])).toBeNull();
  });
});

describe("respond", () => {
  const amlodipine = dose("Amlodipine", "08:00", "taken");
  const metformin = dose("Metformin", "08:00", "pending", { dosage: "500 mg", instructions: "after food" });
  const atorvastatin = dose("Atorvastatin", "20:00", "upcoming", { dosage: "10 mg", canMark: false });
  const day = context([amlodipine, metformin, atorvastatin]);
  const reply = (text: string, ctx: VoiceContext = day) => respond(parseCommand(text), ctx, NOW);

  it("lists today's medicines by time, with their status", () => {
    const { speech, display } = reply("what medicines do I need to take today");
    expect(speech).toBe(
      "Today you have 3 medicines. At 8:00 AM: Amlodipine 5 mg, taken and Metformin 500 mg, after food, due now. At 8:00 PM: Atorvastatin 10 mg, still to come.",
    );
    expect(display.split("\n")).toHaveLength(3);
    expect(reply("today's medicines", context([])).speech).toBe("You have no medicines scheduled for today.");
  });

  it("answers whether a part of the day is done", () => {
    expect(reply("have I taken my morning medicines").speech).toBe(
      "Not all of them. You have taken Amlodipine 5 mg. Still to take: Metformin 500 mg, due at 8:00 AM.",
    );
    const allTaken = context([amlodipine, { ...metformin, status: "taken" }]);
    expect(reply("have I taken my morning medicines", allTaken).speech).toBe(
      "Yes. You have taken all your morning medicines: Amlodipine 5 mg and Metformin 500 mg.",
    );
    expect(reply("did I take my evening medicine").speech).toBe("Your evening medicines are later today: Atorvastatin 10 mg at 8:00 PM.");
    expect(reply("did I take my night medicine").speech).toBe("You don’t have any night medicines today.");
    const notYet = context([{ ...amlodipine, status: "pending" }]);
    expect(reply("have I taken my medicines", notYet).speech).toBe("Not yet. Still to take: Amlodipine 5 mg, due at 8:00 AM.");
  });

  it("mentions skipped and not-taken doses honestly", () => {
    const mixed = context([{ ...amlodipine, status: "skipped" }, { ...metformin, status: "missed" }]);
    const { speech } = reply("have I taken my morning medicines", mixed);
    expect(speech).toContain("Amlodipine 5 mg was skipped.");
    expect(speech).toContain("Metformin 500 mg was recorded as not taken.");
    expect(speech).not.toMatch(/^Yes/);
  });

  it("tells what to take next", () => {
    expect(reply("what is my next medicine").speech).toBe("Metformin 500 mg, after food is due now. Tell me when you have taken it.");
    const later = context([amlodipine, atorvastatin]);
    expect(reply("what is my next medicine", later).speech).toBe("Your next medicine is Atorvastatin 10 mg, at 8:00 PM.");
    expect(reply("what is my next medicine", context([amlodipine])).speech).toBe("You have finished all of today’s medicines. Well done.");
  });

  it("reads the next doctor's appointment", () => {
    const withVisit = context([], {
      appointments: [
        {
          id: "a1",
          doctorName: "Dr. Mehta",
          specialty: "Cardiologist",
          location: "Apollo Hospital",
          dateTime: "2026-11-19T05:00:00.000Z",
          whenLabel: "Thursday, 19 November at 10:30 AM",
        },
      ],
    });
    expect(reply("when is my next doctor's appointment", withVisit).speech).toBe(
      "Your next doctor’s appointment is with Dr. Mehta, Cardiologist, on Thursday, 19 November at 10:30 AM, at Apollo Hospital.",
    );
    expect(reply("when is my next doctor's appointment").speech).toBe("You have no upcoming doctor’s appointments.");
  });

  it("sets a reminder only for while the screen is open", () => {
    const result = reply("remind me in 15 minutes");
    expect(result.remindInMinutes).toBe(15);
    expect(result.speech).toBe("Okay. I’ll remind you in 15 minutes, while this screen stays open.");
    expect(result.pending).toBeUndefined();
  });

  it("asks before marking a dose as taken", () => {
    const result = reply("I have taken my medicine");
    expect(result.speech).toBe("You’re confirming Metformin 500 mg, the 8:00 AM dose. Is that right? Say yes or no.");
    expect(result.pending).toEqual({ kind: "mark", status: "taken", doses: [metformin] });
  });

  it("confirms every due dose at once, or just the one that was named", () => {
    const vitamin = dose("Vitamin D3", "08:30", "unconfirmed", { dosage: "" });
    const twoDue = context([metformin, vitamin, atorvastatin]);
    const all = reply("I took my medicines", twoDue);
    expect(all.pending?.doses.map((d) => d.name)).toEqual(["Metformin", "Vitamin D3"]);
    expect(all.speech).toBe(
      "You’re confirming 2 medicines: Metformin 500 mg, the 8:00 AM dose and Vitamin D3, the 8:30 AM dose. Is that right? Say yes or no.",
    );
    expect(reply("I took my vitamin", twoDue).pending?.doses.map((d) => d.name)).toEqual(["Vitamin D3"]);
  });

  it("explains instead of asking when the named medicine can't be marked", () => {
    expect(reply("I took my atorvastatin").speech).toBe("Atorvastatin 10 mg isn’t due yet. It’s at 8:00 PM.");
    expect(reply("I took my amlodipine").speech).toBe("Amlodipine 5 mg is already taken.");
    expect(reply("I took my atorvastatin").pending).toBeUndefined();
  });

  it("offers the next dose when it is close enough, and says so when nothing is due", () => {
    const soon = dose("Amlodipine", "09:20", "upcoming");
    expect(reply("I have taken my medicine", context([soon])).pending?.doses).toEqual([soon]);
    const nothing = reply("I have taken my medicine", context([amlodipine, atorvastatin]));
    expect(nothing.pending).toBeUndefined();
    expect(nothing.speech).toBe("There’s no medicine due right now. Your next medicine is Atorvastatin 10 mg, at 8:00 PM.");
  });

  it("asks before skipping too", () => {
    const result = reply("skip my medicine");
    expect(result.pending?.status).toBe("skipped");
    expect(result.speech).toBe("You want to skip Metformin 500 mg, the 8:00 AM dose. Is that right? Say yes or no.");
  });

  it("doesn't offer actions to people who can't record doses", () => {
    const viewer = context([metformin], { canLog: false });
    const result = reply("I have taken my medicine", viewer);
    expect(result.pending).toBeUndefined();
    expect(result.speech).toMatch(/can’t update medicines/);
    expect(reply("what is my next medicine", viewer).speech).toBe("Metformin 500 mg, after food is due now.");
  });

  it("only ever proposes changes for the mark intents", () => {
    const commands: VoiceCommand[] = [
      { intent: "list_today", text: "" },
      { intent: "check_taken", part: null, text: "" },
      { intent: "next_dose", text: "" },
      { intent: "next_appointment", text: "" },
      { intent: "remind_me", minutes: 10, text: "" },
      { intent: "yes", text: "yes" },
      { intent: "no", text: "no" },
      { intent: "help", text: "" },
      { intent: "unknown", text: "hmm" },
    ];
    for (const command of commands) expect(respond(command, day, NOW).pending).toBeUndefined();
    expect(respond({ intent: "yes", text: "yes" }, day, NOW).speech).toMatch(/^There’s nothing to confirm right now/);
    expect(respond({ intent: "unknown", text: "hmm" }, day, NOW).speech).toMatch(/^Sorry, I didn’t understand/);
  });
});

describe("after a confirmed action", () => {
  const metformin = dose("Metformin", "08:00", "pending", { dosage: "500 mg" });
  const vitamin = dose("Vitamin D3", "08:00", "pending", { dosage: "" });

  it("reports success", () => {
    const pending = { kind: "mark" as const, status: "taken" as const, doses: [metformin, vitamin] };
    expect(outcomeReply(pending, [{ dose: metformin, ok: true }, { dose: vitamin, ok: true }]).speech).toBe(
      "Done. I’ve marked Metformin 500 mg and Vitamin D3 as taken. Well done!",
    );
    const skip = { kind: "mark" as const, status: "skipped" as const, doses: [vitamin] };
    expect(outcomeReply(skip, [{ dose: vitamin, ok: true }]).speech).toBe("Okay. I’ve marked Vitamin D3 as skipped.");
  });

  it("reports failures honestly", () => {
    const pending = { kind: "mark" as const, status: "taken" as const, doses: [metformin, vitamin] };
    expect(
      outcomeReply(pending, [
        { dose: metformin, ok: true },
        { dose: vitamin, ok: false, message: "That dose couldn’t be found. Please refresh the page." },
      ]).speech,
    ).toBe("Sorry, I couldn’t update Vitamin D3. That dose couldn’t be found. Please refresh the page. I did mark Metformin 500 mg as taken.");
  });
});

describe("spoken reminders", () => {
  it("announces due and still-pending doses", () => {
    const due = [dose("Metformin", "08:00", "pending", { dosage: "500 mg", instructions: "after food" })];
    expect(announcement(due, "due")).toBe("It’s time for your 8:00 AM medicine. Please take Metformin 500 mg, after food.");
    expect(announcement(due, "follow-up")).toBe(
      "A gentle reminder: Metformin 500 mg, after food is still waiting. Please take it and tell me when you have.",
    );
    expect(announcement([], "due")).toBe("");
    expect(reminderMessage(context(due))).toBe("This is your reminder. Please take Metformin 500 mg, after food.");
    expect(reminderMessage(context([]))).toBe("This is your reminder to take your medicine.");
  });
});

describe("announcementsDue", () => {
  const metformin = dose("Metformin", "09:00", "pending", { dosage: "500 mg" });
  const minutesAfter = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

  it("reads a dose out once when it is due, and once more at the follow-up time", () => {
    const due = announcementsDue([metformin], minutesAfter(2), 15, new Set(), "p1:");
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ id: `p1:${metformin.scheduledFor}:due`, kind: "due" });
    expect(due[0].text).toBe("It’s time for your 9:00 AM medicine. Please take Metformin 500 mg.");

    // Already read: nothing new until the follow-up time.
    const read = new Set([due[0].id]);
    expect(announcementsDue([metformin], minutesAfter(10), 15, read, "p1:")).toEqual([]);
    const followUp = announcementsDue([metformin], minutesAfter(16), 15, read, "p1:");
    expect(followUp.map((item) => item.kind)).toEqual(["follow-up"]);
    read.add(followUp[0].id);
    expect(announcementsDue([metformin], minutesAfter(20), 15, read, "p1:")).toEqual([]);
  });

  it("stays quiet before the time, for recorded doses and for old doses", () => {
    expect(announcementsDue([metformin], minutesAfter(-1), 15, new Set())).toEqual([]);
    expect(announcementsDue([{ ...metformin, status: "taken" }], minutesAfter(2), 15, new Set())).toEqual([]);
    expect(announcementsDue([metformin], minutesAfter(90), 15, new Set())).toEqual([]);
  });

  it("groups medicines that are due at the same time", () => {
    const vitamin = dose("Vitamin D3", "09:00", "upcoming", { dosage: "" });
    const [item] = announcementsDue([metformin, vitamin], minutesAfter(1), 15, new Set());
    expect(item.doses.map((d) => d.name)).toEqual(["Metformin", "Vitamin D3"]);
    expect(item.text).toBe("It’s time for your 9:00 AM medicine. Please take Metformin 500 mg and Vitamin D3.");
  });
});

describe("speech helpers", () => {
  it("splits long answers into sentence-sized pieces", () => {
    const text = "Today you have 3 medicines. At 8:00 AM: Amlodipine 5 mg, taken. At 8:00 PM: Atorvastatin 10 mg, still to come.";
    expect(speechChunks(text, 60)).toEqual([
      "Today you have 3 medicines.",
      "At 8:00 AM: Amlodipine 5 mg, taken.",
      "At 8:00 PM: Atorvastatin 10 mg, still to come.",
    ]);
    expect(speechChunks(text)).toEqual([text]);
    expect(speechChunks("   ")).toEqual([]);
  });

  it("explains microphone problems and when to type instead", () => {
    expect(recognitionErrorMessage("not-allowed")).toMatchObject({ offerTyping: true });
    expect(recognitionErrorMessage("not-allowed").message).toMatch(/allow/);
    expect(recognitionErrorMessage("no-speech")).toEqual({ message: "I didn’t hear anything. Tap the microphone and try again.", offerTyping: false });
    expect(recognitionErrorMessage("aborted").message).toBe("");
    expect(recognitionErrorMessage("something-new").offerTyping).toBe(true);
  });
});

describe("helpers", () => {
  it("joins lists and finds the part of the day", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["A"])).toBe("A");
    expect(joinList(["A", "B", "C"])).toBe("A, B and C");
    expect(["04:59", "05:00", "12:00", "17:00", "21:00"].map(partOfDay)).toEqual(["night", "morning", "afternoon", "evening", "night"]);
  });
});
