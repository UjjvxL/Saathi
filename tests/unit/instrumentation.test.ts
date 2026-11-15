import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

type TimerState = { __saathiReminderTimer?: unknown };

describe("in-app reminder scheduler", () => {
  beforeEach(() => {
    delete (globalThis as TimerState).__saathiReminderTimer;
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete (globalThis as TimerState).__saathiReminderTimer;
  });

  it("stays off unless REMINDER_INTERVAL_SECONDS is set, even during development", () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    vi.stubEnv("REMINDER_INTERVAL_SECONDS", undefined);
    register();
    expect(interval).not.toHaveBeenCalled();
  });

  it("starts when switched on, and warns that emails will link to localhost", () => {
    const fakeTimer = { unref: () => undefined } as unknown as ReturnType<typeof setInterval>;
    const interval = vi.spyOn(globalThis, "setInterval").mockReturnValue(fakeTimer);
    vi.spyOn(globalThis, "setTimeout").mockReturnValue(fakeTimer);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("REMINDER_INTERVAL_SECONDS", "60");
    vi.stubEnv("APP_URL", "http://localhost:3000");

    register();
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("will link to http://localhost:3000"));
  });

  it("ignores intervals under 30 seconds", () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    vi.stubEnv("REMINDER_INTERVAL_SECONDS", "5");
    register();
    expect(interval).not.toHaveBeenCalled();
  });
});
