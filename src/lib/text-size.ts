// Text size preference, shared by the header toggle and Elderly mode. Client-safe.
// The root layout applies the saved size before first paint via <html data-text-size>.
import { TEXT_SIZE_STORAGE_KEY } from "./constants";

export const TEXT_SIZES = ["normal", "large", "xlarge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  normal: "Normal",
  large: "Large",
  xlarge: "Extra large",
};

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.includes(value as TextSize);
}

export function readTextSize(): TextSize {
  const value = document.documentElement.dataset.textSize;
  return isTextSize(value) ? value : "normal";
}

export function applyTextSize(size: TextSize): void {
  document.documentElement.dataset.textSize = size;
  try {
    localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // Private mode or blocked storage: the change still applies for this visit.
  }
}

/** Calls onChange whenever the page's text size changes (from any control). */
export function subscribeTextSize(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-text-size"] });
  return () => observer.disconnect();
}
