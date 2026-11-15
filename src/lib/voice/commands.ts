// Turns what the elder said (or typed) into a command for the voice assistant. Pure and safe to use in
// client code. Matching is rule-based on purpose: it works offline, costs nothing, and never guesses an
// action. Anything that would change data is confirmed with the person first (see replies.ts).

export type DayPartName = "morning" | "afternoon" | "evening" | "night";

export type VoiceCommand =
  | { intent: "list_today"; text: string }
  | { intent: "check_taken"; part: DayPartName | null; text: string }
  | { intent: "next_dose"; text: string }
  | { intent: "next_appointment"; text: string }
  | { intent: "remind_me"; minutes: number; text: string }
  | { intent: "mark_taken"; text: string }
  | { intent: "mark_skipped"; text: string }
  | { intent: "yes"; text: string }
  | { intent: "no"; text: string }
  | { intent: "help"; text: string }
  | { intent: "unknown"; text: string };

export type VoiceIntent = VoiceCommand["intent"];

export const DEFAULT_REMINDER_MINUTES = 10;
const MAX_REMINDER_MINUTES = 240;

/** Lowercase, expand common contractions, drop punctuation and extra spaces. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bi've\b/g, "i have")
    .replace(/\bi'd\b/g, "i had")
    .replace(/\bwhat's\b/g, "what is")
    .replace(/\bwhen's\b/g, "when is")
    .replace(/\bwhere's\b/g, "where is")
    .replace(/\bthat's\b/g, "that is")
    .replace(/\b(did|do|have|has|had|is|are|was|were)n't\b/g, "$1 not")
    .replace(/\bdon't\b/g, "do not")
    .replace(/\bcan't\b/g, "can not")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Words for medicines, in English and common Hinglish.
const MED = String.raw`(?:medicines?|medications?|meds|tablets?|pills?|capsules?|doses?|syrup|drops|injections?|dawai|dawaiyan|dawaiyon|dawa|davai|davaiyan|goli|goliyan)`;
const MED_RE = new RegExp(String.raw`\b${MED}\b`);
// "took" words that clearly mean a dose was taken; "had"/"finished" only count together with a medicine word.
const STRONG_TOOK_RE = /\b(taken|took|swallowed|consumed)\b/;
const WEAK_TOOK_RE = /\b(had|have had|finished|done|ate|eaten)\b/;
const HINDI_TOOK_RE = /\b(le li|le liya|le lia|kha li|kha liya|kha lia|li hai|le li hai|kha li hai|khayi|khai)\b/;
const NEGATION_RE = /\b(not|never|nahi|nahin|nhi|no)\b/;

const YES_RE =
  /^(yes|yeah|yea|yep|yup|ya|yah|haan|han|haa|ha|hanji|haan ji|ji|ji haan|ji han|correct|right|that is right|thats right|it is|confirm|confirmed|sure|ok|okay|of course|absolutely|go ahead)\b/;
const NO_RE = /^(no|nope|nah|nahi|nahin|nhi|na|cancel|stop|wrong|not now|do not|dont|never mind|nevermind|not right)\b/;
const AFFIRM_RE = /^(i did|i have|i took|done|ho gaya|ho gya|le li|kha li)\b/;
const OTHER_TOPIC_RE = /\b(next|today|aaj|appointments?|doctors?|remind|help|when|what|which)\b/;

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  "twenty five": 25,
  thirty: 30,
  forty: 40,
  "forty five": 45,
  fifty: 50,
  sixty: 60,
  ninety: 90,
  ek: 1,
  do: 2,
  paanch: 5,
  panch: 5,
  das: 10,
  pandrah: 15,
  bees: 20,
  tees: 30,
};

const UNIT_MINUTES: Record<string, number> = {
  minute: 1,
  minutes: 1,
  min: 1,
  mins: 1,
  minat: 1,
  hour: 60,
  hours: 60,
  hr: 60,
  hrs: 60,
  ghanta: 60,
  ghante: 60,
};

/** "in 10 minutes" -> 10, "in half an hour" -> 30, "in twenty five minutes" -> 25. */
export function parseMinutes(text: string): number | null {
  if (/\bhalf (an )?hour\b|\badha ghanta\b|\baadha ghanta\b/.test(text)) return 30;
  const tokens = text.split(" ");
  for (let index = 1; index < tokens.length; index++) {
    const unit = UNIT_MINUTES[tokens[index]];
    if (!unit) continue;
    const twoWords = index >= 2 ? NUMBER_WORDS[`${tokens[index - 2]} ${tokens[index - 1]}`] : undefined;
    const previous = tokens[index - 1];
    const value = twoWords ?? (/^\d+$/.test(previous) ? Number(previous) : NUMBER_WORDS[previous]);
    if (value) return Math.min(MAX_REMINDER_MINUTES, Math.max(1, value * unit));
  }
  return null;
}

/** Which part of the day the person asked about, if any. */
export function parseDayPart(text: string): DayPartName | null {
  if (/\b(morning|subah|breakfast)\b/.test(text)) return "morning";
  if (/\b(afternoon|dopahar|lunch|noon)\b/.test(text)) return "afternoon";
  if (/\b(evening|shaam|sham|dinner)\b/.test(text)) return "evening";
  if (/\b(night|tonight|bedtime|raat)\b/.test(text)) return "night";
  return null;
}

function classify(text: string): VoiceCommand {
  if (!text) return { intent: "unknown", text };
  const words = text.split(" ").length;
  const mentionsMedicine = MED_RE.test(text);

  // Short answers to a question ("yes", "haan ji", "no thanks"), but not "ok, what's next?".
  if (words <= 5 && !mentionsMedicine && !OTHER_TOPIC_RE.test(text)) {
    if (YES_RE.test(text)) return { intent: "yes", text };
    if (NO_RE.test(text)) return { intent: "no", text };
  }

  if (/\b(help|madad)\b|\bwhat can (you|i) (do|say|ask)\b|\bhow does this work\b/.test(text)) {
    return { intent: "help", text };
  }

  if (/\b(remind|reminder|yaad dila|yaad dilana|yaad dilao|alarm)\b/.test(text)) {
    return { intent: "remind_me", minutes: parseMinutes(text) ?? DEFAULT_REMINDER_MINUTES, text };
  }

  if (/\b(appointments?|doctors?|dr|clinic|hospital|check ?up|consultation)\b/.test(text)) {
    return { intent: "next_appointment", text };
  }

  // Questions about what was taken: "Have I taken my morning medicines?", "kya maine dawai li?"
  const isQuestion = /^(have|did|had|has|was|were|is|are|am|kya)\b/.test(text) || /\b(have i|did i|had i|kya maine)\b/.test(text);
  if (isQuestion && (mentionsMedicine || STRONG_TOOK_RE.test(text) || /\b(take|skip|skipped|miss|missed)\b/.test(text))) {
    return { intent: "check_taken", part: parseDayPart(text), text };
  }

  if (/\b(skip|skipping|chhod|chod|chhodo|chodo)\b/.test(text)) return { intent: "mark_skipped", text };

  // "I didn't take my tablets": not a confirmation, so say what is due instead.
  if (/\b(i|maine|main|mai)\b/.test(text) && NEGATION_RE.test(text) && (mentionsMedicine || /\btake\b/.test(text))) {
    return { intent: "next_dose", text };
  }

  // Statements that a dose was taken: "I have taken my medicine", "maine dawai le li".
  const tookStatement =
    STRONG_TOOK_RE.test(text) ||
    HINDI_TOOK_RE.test(text) ||
    (mentionsMedicine && WEAK_TOOK_RE.test(text));
  if (tookStatement) {
    // "I have not taken it yet" is not a confirmation: tell them what's due instead.
    return NEGATION_RE.test(text) ? { intent: "next_dose", text } : { intent: "mark_taken", text };
  }

  if (/\b(today|todays|aaj)\b/.test(text) && (mentionsMedicine || /\b(take|what|which|list)\b/.test(text))) {
    return { intent: "list_today", text };
  }
  if (
    /\b(next|agli|agla|upcoming|abhi)\b/.test(text) ||
    (/\b(when|kab|what time|now)\b/.test(text) && (mentionsMedicine || /\btake\b/.test(text)))
  ) {
    return { intent: "next_dose", text };
  }
  if (mentionsMedicine || /\b(what do i take|what should i take|schedule)\b/.test(text)) {
    return { intent: "list_today", text };
  }
  return { intent: "unknown", text };
}

/**
 * Parses one transcript, or several alternatives from speech recognition (best first). The first
 * alternative that means something wins.
 */
export function parseCommand(input: string | readonly string[]): VoiceCommand {
  const alternatives = (typeof input === "string" ? [input] : input).map(normalize).filter(Boolean);
  for (const text of alternatives) {
    const command = classify(text);
    if (command.intent !== "unknown") return command;
  }
  return { intent: "unknown", text: alternatives[0] ?? "" };
}

/**
 * Reads a yes/no answer to a confirmation question. Deliberately strict: anything with a "no" or
 * "not" in it counts as no, so a hesitant answer never changes anything. Returns null if unclear.
 */
export function confirmationAnswer(input: string | readonly string[]): "yes" | "no" | null {
  const alternatives = (typeof input === "string" ? [input] : input).map(normalize).filter(Boolean);
  for (const text of alternatives) {
    if (NO_RE.test(text) || NEGATION_RE.test(text)) return "no";
    if (YES_RE.test(text) || AFFIRM_RE.test(text) || STRONG_TOOK_RE.test(text) || HINDI_TOOK_RE.test(text)) return "yes";
  }
  return null;
}
