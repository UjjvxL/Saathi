"use client";

import { Check, Keyboard, LoaderCircle, Mic, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { markDose } from "@/app/actions/doses";
import { cn } from "@/lib/utils";
import { confirmationAnswer, parseCommand } from "@/lib/voice/commands";
import {
  CANCELLED_REPLY,
  namesOtherDoses,
  outcomeReply,
  REPROMPT_REPLY,
  respond,
  UNCLEAR_REPLY,
  type PendingConfirmation,
  type VoiceContext,
  type VoiceReply,
} from "@/lib/voice/replies";
import { Notice } from "../ui/feedback";
import { alternativesOf, getRecognitionConstructor, isRecognitionSupported, recognitionErrorMessage, speak, stopSpeaking, type RecognitionLike } from "./speech";
import { elderButton, elderCard } from "./styles";

const noopSubscribe = () => () => {};

export const QUICK_QUESTIONS = [
  "What medicines do I take today?",
  "Have I taken my medicines?",
  "What is my next medicine?",
  "When is my next doctor’s appointment?",
  "I have taken my medicine",
  "What can you do?",
];

/** Below this recognition confidence (when the browser reports one) we ask the person to repeat. */
const MIN_CONFIDENCE = 0.3;

type Via = "voice" | "text";

/**
 * The voice assistant: listen (Web Speech API) or type, answer from the real schedule, read the answer
 * aloud, and ask before changing anything. Only a clear "yes" (spoken or tapped) records a dose.
 */
export function VoiceAssistant({
  profileId,
  context,
  onRemind,
}: {
  profileId: string;
  context: VoiceContext;
  onRemind: (minutes: number) => void;
}) {
  const router = useRouter();
  // "unknown" while server rendering and hydrating, so no browser is told it lacks voice by mistake.
  const support = useSyncExternalStore(noopSubscribe, () => (isRecognitionSupported() ? "yes" : "no"), () => "unknown");
  const canListen = support === "yes";
  const inputId = useId();
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [reply, setReply] = useState<VoiceReply | null>(null);
  const [pending, setPendingState] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  // Recognition and speech callbacks run long after a render, so they read the latest values from refs.
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const contextRef = useRef(context);
  const onRemindRef = useRef(onRemind);

  useEffect(() => {
    contextRef.current = context;
    onRemindRef.current = onRemind;
  });

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      stopSpeaking();
    },
    [],
  );

  function setPending(next: PendingConfirmation | null) {
    pendingRef.current = next;
    setPendingState(next);
  }

  function show(next: VoiceReply, listenAfterwards: boolean) {
    setReply(next);
    speak(next.speech, listenAfterwards ? () => listen() : undefined);
  }

  async function carryOut(waiting: PendingConfirmation) {
    // A double tap, or a spoken "yes" plus a tap, must not record the same answer twice.
    if (pendingRef.current !== waiting) return;
    setPending(null);
    setBusy(true);
    const results: { dose: PendingConfirmation["doses"][number]; ok: boolean; message?: string }[] = [];
    for (const dose of waiting.doses) {
      try {
        const state = await markDose(profileId, dose.medicationId, dose.scheduledFor, waiting.status, {}, new FormData());
        results.push({ dose, ok: state.ok === true, message: state.message });
      } catch {
        results.push({ dose, ok: false, message: "Something went wrong. Please check the internet connection and try again." });
      }
    }
    setBusy(false);
    show(outcomeReply(waiting, results), false);
    router.refresh();
  }

  function cancel() {
    setPending(null);
    show(CANCELLED_REPLY, false);
  }

  function handle(alternatives: string[], via: Via) {
    if (!alternatives.length) return;
    setHeard(alternatives[0]);
    setProblem(null);
    const current = contextRef.current;
    const command = parseCommand(alternatives);
    const waiting = pendingRef.current;

    if (waiting) {
      const answer = confirmationAnswer(alternatives);
      // "I took my Metformin" while confirming something else (or "skip" while confirming "taken") is a new request.
      const changedRequest =
        (command.intent === "mark_taken" && waiting.status !== "taken") ||
        (command.intent === "mark_skipped" && waiting.status !== "skipped") ||
        ((command.intent === "mark_taken" || command.intent === "mark_skipped") && namesOtherDoses(command.text, waiting, current));
      if (answer === "no") return cancel();
      if (answer === "yes" && !changedRequest) return void carryOut(waiting);
      if (!changedRequest) return show(REPROMPT_REPLY, via === "voice");
      setPending(null);
    }

    const next = respond(command, current, new Date());
    if (next.pending) setPending(next.pending);
    if (next.remindInMinutes) onRemindRef.current(next.remindInMinutes);
    show(next, via === "voice" && Boolean(next.pending));
  }

  function listen() {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) return;
    stopSpeaking();
    const previous = recognitionRef.current;
    recognitionRef.current = null;
    previous?.abort();
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.onresult = (event) => {
      const alternatives = alternativesOf(event);
      if (!alternatives.length) return;
      const best = alternatives[0];
      if (best.confidence > 0 && best.confidence < MIN_CONFIDENCE) {
        // Never act on something we probably misheard.
        setHeard(best.transcript);
        show(pendingRef.current ? REPROMPT_REPLY : UNCLEAR_REPLY, Boolean(pendingRef.current));
        return;
      }
      handle(
        alternatives.map((alternative) => alternative.transcript),
        "voice",
      );
    };
    recognition.onerror = (event) => {
      const { message } = recognitionErrorMessage(event.error);
      if (message) setProblem(message);
    };
    recognition.onend = () => {
      // A newer recognition may already be listening (e.g. waiting for "yes"); leave it alone.
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      if (recognitionRef.current === recognition) {
        setListening(true);
        setProblem(null);
      }
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setProblem("The microphone couldn’t start. Please try again, or type your question below.");
    }
  }

  function toggleListening() {
    if (listening) recognitionRef.current?.stop();
    else listen();
  }

  function submitTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    handle([text], "text");
  }

  return (
    <section aria-labelledby={`${inputId}-title`} className={cn(elderCard, "border-teal-200 bg-teal-50/40")}>
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        {canListen ? (
          <button
            type="button"
            onClick={toggleListening}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Tap to speak"}
            className={cn(
              "relative flex size-28 shrink-0 items-center justify-center rounded-full text-white shadow-lift transition-[background-color,transform] active:scale-95 [&_svg]:size-12",
              listening ? "bg-red-700 hover:bg-red-800" : "bg-teal-700 hover:bg-teal-800",
            )}
          >
            {listening ? (
              <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
            ) : null}
            {listening ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="flex size-20 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-700 [&_svg]:size-9"
          >
            {support === "no" ? <Keyboard /> : <Mic />}
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h2 id={`${inputId}-title`} className="text-3xl font-semibold tracking-tight text-stone-900">
            Ask Saathi
          </h2>
          <p className="text-xl text-stone-700">
            {support === "yes"
              ? listening
                ? "Listening… please speak now."
                : "Tap the microphone and ask about your medicines."
              : support === "no"
                ? "Type your question, or tap one below."
                : "Ask about your medicines by voice or by typing."}
          </p>
        </div>
      </div>

      {support === "no" ? (
        <Notice tone="info" className="mt-5 text-lg">
          Voice isn’t available in this browser, so you can type instead. Saathi still reads answers aloud where it can.
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="warning" className="mt-5 text-lg">
          {problem}
        </Notice>
      ) : null}

      <div className="mt-6 space-y-3" aria-live="polite">
        {heard ? (
          <p className="text-lg text-stone-600">
            I heard: <span className="font-medium text-stone-900">“{heard}”</span>
          </p>
        ) : null}
        {busy ? (
          <p className="flex items-center gap-3 text-2xl font-medium text-stone-900">
            <LoaderCircle className="size-7 animate-spin" aria-hidden="true" /> Saving…
          </p>
        ) : reply ? (
          <p className="whitespace-pre-line text-2xl font-medium leading-snug text-stone-900">{reply.display}</p>
        ) : null}
      </div>

      {pending ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => void carryOut(pending)} className={elderButton("success")}>
            <Check aria-hidden="true" /> Yes, that’s right
          </button>
          <button type="button" onClick={cancel} className={elderButton("secondary")}>
            <X aria-hidden="true" /> No
          </button>
        </div>
      ) : null}

      <form onSubmit={submitTyped} className="mt-6 space-y-2">
        <label htmlFor={inputId} className="block text-lg font-medium text-stone-800">
          {canListen ? "Or type your question" : "Type your question"}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="e.g. What is my next medicine?"
            autoComplete="off"
            className="block min-h-16 w-full rounded-2xl border-2 border-stone-300 bg-white px-5 text-xl text-stone-900 placeholder:text-stone-500 focus:border-stone-900 focus:outline-none focus:ring-4 focus:ring-stone-900/10"
          />
          <button type="submit" className={elderButton("primary", "sm:w-40")}>
            Ask
          </button>
        </div>
      </form>

      <div className="mt-5">
        <p className="text-lg font-medium text-stone-800">Quick questions</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((question) => (
            <li key={question}>
              <button
                type="button"
                onClick={() => handle([question], "text")}
                className="min-h-14 rounded-full border-2 border-stone-300 bg-white px-5 text-lg font-medium text-stone-900 transition-colors hover:border-stone-500 hover:bg-stone-50"
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
