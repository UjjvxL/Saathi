import { DEFAULT_TIMEZONE } from "./constants";

const FALLBACK = [DEFAULT_TIMEZONE, "UTC", "Asia/Dubai", "Europe/London", "America/New_York", "Australia/Sydney"];

/** IANA timezones for the profile form, with the default first. */
export function listTimezones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : FALLBACK;
  return [DEFAULT_TIMEZONE, ...zones.filter((zone) => zone !== DEFAULT_TIMEZONE)];
}
