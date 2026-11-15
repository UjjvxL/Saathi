import type { Page } from "@playwright/test";

interface FakeSpeechControls {
  say(text: string): void;
  spoken(): string[];
  listening(): boolean;
}

declare global {
  interface Window {
    __speech?: FakeSpeechControls;
  }
}

/**
 * Replaces the browser's speech APIs with fakes the test controls (real microphones and voices aren't
 * available in CI). `say()` is what the person says into the microphone; `spokenTexts()` is everything
 * Saathi read aloud. With `recognition: false` the browser behaves as if it can't recognise speech.
 */
export async function installFakeSpeech(page: Page, options: { recognition?: boolean } = {}) {
  await page.addInitScript(
    ({ recognition }) => {
      type Recognizer = {
        onresult: ((event: unknown) => void) | null;
        onend: (() => void) | null;
      };
      const state = { queue: [] as string[], spoken: [] as string[], active: null as Recognizer | null };

      const emit = (text: string) => {
        const recognizer = state.active;
        if (!recognizer) {
          state.queue.push(text);
          return;
        }
        state.active = null;
        const result = Object.assign([{ transcript: text, confidence: 0.95 }], { isFinal: true });
        recognizer.onresult?.({ resultIndex: 0, results: [result] });
        recognizer.onend?.();
      };

      class FakeRecognition implements Recognizer {
        lang = "";
        continuous = false;
        interimResults = false;
        maxAlternatives = 1;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          state.active = this;
          const next = state.queue.shift();
          if (next !== undefined) setTimeout(() => emit(next), 50);
        }
        stop() {
          if (state.active !== this) return;
          state.active = null;
          setTimeout(() => this.onend?.(), 0);
        }
        abort() {
          this.stop();
        }
      }

      const speechWindow = window as unknown as Record<string, unknown>;
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
        Object.defineProperty(speechWindow, name, { value: recognition ? FakeRecognition : undefined, configurable: true, writable: true });
      }

      const synthesis = {
        speaking: false,
        pending: false,
        paused: false,
        onvoiceschanged: null,
        getVoices: () => [],
        speak(utterance: SpeechSynthesisUtterance) {
          state.spoken.push(utterance.text);
          setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 20);
        },
        cancel() {},
        pause() {},
        resume() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => true,
      };
      Object.defineProperty(window, "speechSynthesis", { value: synthesis, configurable: true });

      window.__speech = {
        say: emit,
        spoken: () => [...state.spoken],
        listening: () => state.active !== null,
      };
    },
    { recognition: options.recognition ?? true },
  );
}

export async function say(page: Page, text: string) {
  await page.evaluate((value) => window.__speech?.say(value), text);
}

export async function spokenTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__speech?.spoken() ?? []);
}

export async function isListening(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__speech?.listening() ?? false);
}

/** "09:50" -> "9:50 AM" (same format as the app). */
export function to12h(localTime: string): string {
  const [hourText, minute] = localTime.split(":");
  const hour = Number(hourText);
  return `${((hour + 11) % 12) + 1}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}
