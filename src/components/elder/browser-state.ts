// Small browser stores for Elderly mode, read with useSyncExternalStore so server and first client
// render agree (no hydration mismatch). Storage access is always wrapped: private mode can block it.

// ---------------------------------------------------------------------------
// A shared clock that ticks every few seconds (0 on the server).
// ---------------------------------------------------------------------------
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

export function subscribeClock(onChange: () => void): () => void {
  clockListeners.add(onChange);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((listener) => listener());
    }, 10_000);
  }
  return () => {
    clockListeners.delete(onChange);
    if (!clockListeners.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

export function getClockSnapshot(): number {
  if (!clockNow) clockNow = Date.now();
  return clockNow;
}

export const getServerClockSnapshot = () => 0;

// ---------------------------------------------------------------------------
// An on/off preference saved in localStorage (kept in memory if storage is blocked).
// ---------------------------------------------------------------------------
export function createFlagStore(key: string) {
  const listeners = new Set<() => void>();
  let memory: boolean | null = null;

  const read = (): boolean => {
    if (memory !== null) return memory;
    try {
      return localStorage.getItem(key) === "on";
    } catch {
      return false;
    }
  };

  return {
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot: read,
    getServerSnapshot: () => false,
    set(value: boolean) {
      memory = value;
      try {
        localStorage.setItem(key, value ? "on" : "off");
      } catch {
        // Blocked storage: the setting still applies until the page is closed.
      }
      listeners.forEach((listener) => listener());
    },
  };
}

// ---------------------------------------------------------------------------
// Which spoken reminders were already read out (so a refresh doesn't repeat them).
// ---------------------------------------------------------------------------
const ANNOUNCED_KEY = "saathi-announced-reminders";
let announcedMemory: string[] | null = null;

export function loadAnnounced(): Set<string> {
  if (announcedMemory) return new Set(announcedMemory);
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ANNOUNCED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveAnnounced(ids: Set<string>): void {
  const recent = [...ids].slice(-100);
  announcedMemory = recent;
  try {
    localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(recent));
  } catch {
    // Blocked storage: remembered in memory for this visit.
  }
}
