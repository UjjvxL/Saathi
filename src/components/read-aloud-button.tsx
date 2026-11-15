"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "./ui/button";

const noopSubscribe = () => () => {};

/** Reads the day's medicines out loud (Web Speech API) for elders who find small text hard. */
export function ReadAloudButton({ text }: { text: string }) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "speechSynthesis" in window,
    () => false,
  );
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (!supported) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  }

  return (
    <Button variant="secondary" size="sm" onClick={toggle} aria-pressed={speaking}>
      {speaking ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      {speaking ? "Stop reading" : "Read aloud"}
    </Button>
  );
}
