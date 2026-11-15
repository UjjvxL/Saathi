// What the voice assistant says back, built only from the elder's real schedule. Pure and client-safe.
// Nothing here changes data: commands that would (marking a dose) return a `pending` confirmation that
// the screen must ask about first, and only a clear "yes" carries it out.
import type { DoseStatus } from "@/lib/constants";
import { formatTime12h } from "@/lib/format";
import type { DayPartName, VoiceCommand } from "./commands";

export interface VoiceDose {
  key: string;
  medicationId: string;
  name: string;
  dosage: string;
  instructions: string;
  localTime: string;
  /** ISO instant the dose is due. */
  scheduledFor: string;
  status: DoseStatus;
  canMark: boolean;
}

export interface VoiceAppointment {
  id: string;
  doctorName: string;
  specialty: string;
  location: string;
  /** ISO instant */
  dateTime: string;
  /** Already formatted in the elder's timezone, e.g. "Thursday, 20 November at 10:30 AM". */
  whenLabel: string;
}

export interface VoiceContext {
  elderName: string;
  doses: VoiceDose[];
  appointments: VoiceAppointment[];
  /** Whether this account may record doses (the server checks this again). */
  canLog: boolean;
}

export interface PendingConfirmation {
  kind: "mark";
  status: "taken" | "skipped";
  doses: VoiceDose[];
}

export interface VoiceReply {
  /** What is read aloud. */
  speech: string;
  /** What is shown on screen (usually the same words). */
  display: string;
  /** An action waiting for a yes/no answer. */
  pending?: PendingConfirmation;
  /** "Remind me": set a reminder for this many minutes from now. */
  remindInMinutes?: number;
}

/** Doses that still need a decision. */
const OPEN: DoseStatus[] = ["pending", "unconfirmed", "upcoming"];
const DUE: DoseStatus[] = ["pending", "unconfirmed"];

const STATUS_PHRASE: Record<DoseStatus, string> = {
  taken: "taken",
  skipped: "skipped",
  missed: "recorded as not taken",
  unconfirmed: "not confirmed yet",
  pending: "due now",
  upcoming: "still to come",
};

const say = (speech: string, extra: Partial<VoiceReply> = {}): VoiceReply => ({ speech, display: speech, ...extra });

export function doseLabel(dose: Pick<VoiceDose, "name" | "dosage">): string {
  return dose.dosage ? `${dose.name} ${dose.dosage}` : dose.name;
}

/** ["A"] -> "A", ["A", "B"] -> "A and B", ["A", "B", "C"] -> "A, B and C" */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Same day parts as the rest of the app: morning 5–12, afternoon 12–17, evening 17–21, night. */
export function partOfDay(localTime: string): DayPartName {
  const hour = Number(localTime.slice(0, 2));
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

const byTime = (a: VoiceDose, b: VoiceDose) => a.scheduledFor.localeCompare(b.scheduledFor) || a.name.localeCompare(b.name);

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Words of a medicine name that are distinctive enough to listen for ("metformin", not "mg"). */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function mentions(text: string, dose: VoiceDose): boolean {
  const words = new Set(text.split(" "));
  const tokens = nameTokens(dose.name);
  if (tokens.some((token) => words.has(token))) return true;
  const full = dose.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return full.length >= 2 && ` ${text} `.includes(` ${full} `);
}

function withInstructions(dose: VoiceDose): string {
  return dose.instructions ? `${doseLabel(dose)}, ${dose.instructions}` : doseLabel(dose);
}

/** The earliest group of doses sharing one time. */
function firstSlot(doses: VoiceDose[]): VoiceDose[] {
  const sorted = [...doses].sort(byTime);
  return sorted.length ? sorted.filter((dose) => dose.scheduledFor === sorted[0].scheduledFor) : [];
}

function listToday(context: VoiceContext): VoiceReply {
  const doses = [...context.doses].sort(byTime);
  if (!doses.length) return say("You have no medicines scheduled for today.");
  const slots = new Map<string, VoiceDose[]>();
  for (const dose of doses) slots.set(dose.localTime, [...(slots.get(dose.localTime) ?? []), dose]);
  const lines = [...slots].map(([time, slotDoses]) => {
    const items = slotDoses.map((dose) =>
      OPEN.includes(dose.status) ? `${withInstructions(dose)}, ${STATUS_PHRASE[dose.status]}` : `${doseLabel(dose)}, ${STATUS_PHRASE[dose.status]}`,
    );
    return `At ${formatTime12h(time)}: ${joinList(items)}.`;
  });
  const intro = `Today you have ${count(doses.length, "medicine")}.`;
  return { speech: [intro, ...lines].join(" "), display: [intro, ...lines].join("\n") };
}

function checkTaken(context: VoiceContext, part: DayPartName | null): VoiceReply {
  const scope = part ? `${part} ` : "";
  const relevant = [...(part ? context.doses.filter((dose) => partOfDay(dose.localTime) === part) : context.doses)].sort(byTime);
  if (!relevant.length) return say(part ? `You don’t have any ${part} medicines today.` : "You have no medicines scheduled for today.");

  const taken = relevant.filter((dose) => dose.status === "taken");
  const due = relevant.filter((dose) => DUE.includes(dose.status));
  const skipped = relevant.filter((dose) => dose.status === "skipped");
  const missed = relevant.filter((dose) => dose.status === "missed");
  const later = relevant.filter((dose) => dose.status === "upcoming");

  if (!part && later.length === relevant.length) {
    const next = firstSlot(later);
    return say(`Nothing was due yet today. Your first medicine is ${joinList(next.map(doseLabel))} at ${formatTime12h(next[0].localTime)}.`);
  }
  if (later.length === relevant.length) {
    return say(`Your ${scope}medicines are later today: ${joinList(later.map((dose) => `${doseLabel(dose)} at ${formatTime12h(dose.localTime)}`))}.`);
  }

  const sentences: string[] = [];
  if (taken.length && !due.length && !missed.length) sentences.push("Yes.");
  else if (!taken.length && due.length) sentences.push("Not yet.");
  else if (taken.length && due.length) sentences.push("Not all of them.");
  if (taken.length) {
    sentences.push(
      taken.length === relevant.length
        ? `You have taken all your ${scope}medicines: ${joinList(taken.map(doseLabel))}.`
        : `You have taken ${joinList(taken.map(doseLabel))}.`,
    );
  }
  if (due.length) sentences.push(`Still to take: ${joinList(due.map((dose) => `${doseLabel(dose)}, due at ${formatTime12h(dose.localTime)}`))}.`);
  if (skipped.length) sentences.push(`${joinList(skipped.map(doseLabel))} ${skipped.length === 1 ? "was" : "were"} skipped.`);
  if (missed.length) sentences.push(`${joinList(missed.map(doseLabel))} ${missed.length === 1 ? "was" : "were"} recorded as not taken.`);
  if (later.length) sentences.push(`Later: ${joinList(later.map((dose) => `${doseLabel(dose)} at ${formatTime12h(dose.localTime)}`))}.`);
  return say(sentences.join(" "));
}

function nextDose(context: VoiceContext, now: Date): VoiceReply {
  const due = context.doses.filter((dose) => DUE.includes(dose.status)).sort(byTime);
  if (due.length) {
    const verb = due.length === 1 ? "is" : "are";
    const tail = context.canLog ? " Tell me when you have taken it." : "";
    return say(`${joinList(due.map(withInstructions))} ${verb} due now.${tail}`);
  }
  const later = context.doses.filter((dose) => dose.status === "upcoming" && new Date(dose.scheduledFor) >= new Date(now.getTime() - 60_000));
  const next = firstSlot(later);
  if (next.length) {
    return say(`Your next medicine is ${joinList(next.map(withInstructions))}, at ${formatTime12h(next[0].localTime)}.`);
  }
  return say(context.doses.length ? "You have finished all of today’s medicines. Well done." : "You have no medicines scheduled for today.");
}

function nextAppointment(context: VoiceContext): VoiceReply {
  const next = context.appointments[0];
  if (!next) return say("You have no upcoming doctor’s appointments.");
  const doctor = next.specialty ? `${next.doctorName}, ${next.specialty},` : next.doctorName;
  const place = next.location ? `, at ${next.location}` : "";
  return say(`Your next doctor’s appointment is with ${doctor} on ${next.whenLabel}${place}.`);
}

/** Which doses "I took my medicine" (or "skip my medicine") most likely means. */
function chooseDoses(context: VoiceContext, text: string): { doses: VoiceDose[]; explanation?: string } {
  const named = context.doses.filter((dose) => mentions(text, dose));
  if (named.length) {
    const markable = named.filter((dose) => dose.canMark && OPEN.includes(dose.status));
    if (!markable.length) {
      const dose = [...named].sort(byTime)[0];
      if (dose.status === "upcoming") {
        return { doses: [], explanation: `${doseLabel(dose)} isn’t due yet. It’s at ${formatTime12h(dose.localTime)}.` };
      }
      return { doses: [], explanation: `${doseLabel(dose)} is already ${STATUS_PHRASE[dose.status]}.` };
    }
    const dueNamed = markable.filter((dose) => DUE.includes(dose.status));
    return { doses: dueNamed.length ? dueNamed.sort(byTime) : firstSlot(markable) };
  }
  const due = context.doses.filter((dose) => dose.canMark && DUE.includes(dose.status)).sort(byTime);
  if (due.length) return { doses: due };
  // Nothing is due: the next dose, if it's close enough to be marked (up to 2 hours early).
  return { doses: firstSlot(context.doses.filter((dose) => dose.canMark && dose.status === "upcoming")) };
}

function markDoses(context: VoiceContext, text: string, status: "taken" | "skipped", now: Date): VoiceReply {
  if (!context.canLog) return say("Sorry, this account can’t update medicines. Please ask someone in your care circle.");
  const { doses, explanation } = chooseDoses(context, text);
  if (explanation) return say(explanation);
  if (!doses.length) {
    const next = nextDose(context, now);
    return say(`There’s no medicine due right now. ${next.speech}`);
  }
  const items = doses.map((dose) => `${doseLabel(dose)}, the ${formatTime12h(dose.localTime)} dose`);
  const what = doses.length === 1 ? items[0] : `${count(doses.length, "medicine")}: ${joinList(items)}`;
  const question =
    status === "taken" ? `You’re confirming ${what}. Is that right? Say yes or no.` : `You want to skip ${what}. Is that right? Say yes or no.`;
  return say(question, { pending: { kind: "mark", status, doses } });
}

export const HELP_TEXT =
  "You can ask me: What medicines do I take today? Have I taken my morning medicines? What is my next medicine? When is my next doctor’s appointment? You can also say: I have taken my medicine, or: remind me in 10 minutes.";

/** Answers a voice or typed command. Never changes data; see `pending`. */
export function respond(command: VoiceCommand, context: VoiceContext, now: Date = new Date()): VoiceReply {
  switch (command.intent) {
    case "list_today":
      return listToday(context);
    case "check_taken":
      return checkTaken(context, command.part);
    case "next_dose":
      return nextDose(context, now);
    case "next_appointment":
      return nextAppointment(context);
    case "remind_me": {
      const minutes = command.minutes;
      return say(`Okay. I’ll remind you in ${count(minutes, "minute")}, while this screen stays open.`, { remindInMinutes: minutes });
    }
    case "mark_taken":
      return markDoses(context, command.text, "taken", now);
    case "mark_skipped":
      return markDoses(context, command.text, "skipped", now);
    case "yes":
    case "no":
      return say("There’s nothing to confirm right now. " + HELP_TEXT);
    case "help":
      return say(HELP_TEXT);
    default:
      return say("Sorry, I didn’t understand that. You can ask: what medicines do I take today? Or say: I have taken my medicine.");
  }
}

export const CANCELLED_REPLY: VoiceReply = say("Okay, I haven’t changed anything.");
export const REPROMPT_REPLY: VoiceReply = say("Please say yes to confirm, or no to cancel.");
export const UNCLEAR_REPLY: VoiceReply = say("Sorry, I didn’t catch that clearly. Please say it again.");

/**
 * True when, during a confirmation, the person names medicines that aren't the ones being confirmed
 * ("I took my Metformin" while confirming Amlodipine). That is a new request, never a "yes".
 */
export function namesOtherDoses(text: string, pending: PendingConfirmation, context: VoiceContext): boolean {
  const pendingKeys = new Set(pending.doses.map((dose) => dose.key));
  const named = context.doses.filter((dose) => mentions(text, dose));
  return named.length > 0 && named.every((dose) => !pendingKeys.has(dose.key));
}

/** What to say after carrying out a confirmed action. Failures are reported honestly. */
export function outcomeReply(
  pending: PendingConfirmation,
  results: { dose: VoiceDose; ok: boolean; message?: string }[],
): VoiceReply {
  const done = results.filter((result) => result.ok).map((result) => doseLabel(result.dose));
  const failed = results.filter((result) => !result.ok);
  const verb = pending.status === "taken" ? "taken" : "skipped";
  if (!failed.length) {
    return say(
      pending.status === "taken"
        ? `Done. I’ve marked ${joinList(done)} as taken. Well done!`
        : `Okay. I’ve marked ${joinList(done)} as skipped.`,
    );
  }
  const reason = failed[0].message ? ` ${failed[0].message}` : "";
  const partial = done.length ? ` I did mark ${joinList(done)} as ${verb}.` : "";
  return say(`Sorry, I couldn’t update ${joinList(failed.map((result) => doseLabel(result.dose)))}.${reason}${partial}`);
}

/** The words for a spoken reminder of doses that are due ("It's 8:00 AM. Time to take …"). */
export function announcement(doses: VoiceDose[], kind: "due" | "follow-up"): string {
  const sorted = [...doses].sort(byTime);
  if (!sorted.length) return "";
  const names = joinList(sorted.map(withInstructions));
  if (kind === "due") return `It’s time for your ${formatTime12h(sorted[0].localTime)} medicine. Please take ${names}.`;
  const verb = sorted.length === 1 ? "is" : "are";
  return `A gentle reminder: ${names} ${verb} still waiting. Please take ${sorted.length === 1 ? "it" : "them"} and tell me when you have.`;
}

/** The words for a "remind me" reminder when it goes off. */
export function reminderMessage(context: VoiceContext): string {
  const due = context.doses.filter((dose) => DUE.includes(dose.status));
  if (due.length) return `This is your reminder. Please take ${joinList([...due].sort(byTime).map(withInstructions))}.`;
  return "This is your reminder to take your medicine.";
}
