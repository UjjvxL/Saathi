// Thin, feature-detected wrappers around the browser's Web Speech API: speech recognition (listening)
// and speech synthesis (talking). No paid services: everything runs in the browser. Every function is
// safe to call where speech isn't available; callers show a typed fallback instead.

export interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface RecognitionResultLike {
  readonly length: number;
  readonly isFinal?: boolean;
  readonly [index: number]: RecognitionAlternative;
}

export interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResultLike };
}

export interface RecognitionErrorEventLike {
  readonly error: string;
}

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

/** The browser's speech recognition class (Chrome, Edge and Safari prefix it with "webkit"), or null. */
export function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export function isSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/** Reads the alternatives (best first) out of a recognition result. */
export function alternativesOf(event: RecognitionEventLike): RecognitionAlternative[] {
  const result = event.results[event.resultIndex] ?? event.results[event.results.length - 1];
  if (!result) return [];
  const alternatives: RecognitionAlternative[] = [];
  for (let index = 0; index < result.length; index++) {
    const alternative = result[index];
    if (alternative?.transcript?.trim()) alternatives.push({ transcript: alternative.transcript.trim(), confidence: alternative.confidence ?? 0 });
  }
  return alternatives;
}

/** What to tell the person when listening fails, and whether to point them to typing instead. */
export function recognitionErrorMessage(code: string): { message: string; offerTyping: boolean } {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        message:
          "Saathi isn’t allowed to use the microphone. To allow it, tap the lock or settings icon next to the web address and turn on the microphone. You can also type your question below.",
        offerTyping: true,
      };
    case "no-speech":
      return { message: "I didn’t hear anything. Tap the microphone and try again.", offerTyping: false };
    case "audio-capture":
      return { message: "No microphone was found. Check that one is connected, or type your question below.", offerTyping: true };
    case "network":
      return { message: "Voice recognition needs an internet connection right now. Please type your question below.", offerTyping: true };
    case "language-not-supported":
      return { message: "Voice recognition isn’t available for this language here. Please type your question below.", offerTyping: true };
    case "aborted":
      return { message: "", offerTyping: false };
    default:
      return { message: "Listening stopped unexpectedly. Please try again, or type your question below.", offerTyping: true };
  }
}

/** Increases with every new speech, so callbacks of interrupted speech are ignored. */
let generation = 0;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  return (
    voices.find((voice) => voice.lang === "en-IN") ??
    voices.find((voice) => voice.lang?.toLowerCase().replace("_", "-") === "en-in") ??
    voices.find((voice) => /india/i.test(voice.name)) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) ??
    null
  );
}

/** Splits long text into sentence-sized pieces (some browsers stop reading long utterances part-way). */
export function speechChunks(text: string, maxLength = 180): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const last = chunks[chunks.length - 1];
    if (last && last.length + sentence.length + 1 <= maxLength) chunks[chunks.length - 1] = `${last} ${sentence}`;
    else chunks.push(sentence);
  }
  return chunks;
}

/**
 * Says the text out loud in an Indian English voice where one is installed, a little slower than usual.
 * Calls onDone when finished (or straight away if speech isn't available). Returns whether it spoke.
 */
export function speak(text: string, onDone?: () => void): boolean {
  const id = ++generation;
  const chunks = speechChunks(text);
  if (!isSynthesisSupported() || !chunks.length) {
    onDone?.();
    return false;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice();
  let finished = false;
  // Speech that was interrupted by newer speech (or stopSpeaking) never runs its callback.
  const done = () => {
    if (finished) return;
    finished = true;
    if (id === generation) onDone?.();
  };
  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;
    if (voice) utterance.voice = voice;
    if (index === chunks.length - 1) utterance.onend = done;
    utterance.onerror = done;
    synth.speak(utterance);
  });
  return true;
}

export function stopSpeaking(): void {
  generation++;
  if (isSynthesisSupported()) window.speechSynthesis.cancel();
}
