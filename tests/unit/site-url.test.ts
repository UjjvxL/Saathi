import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "@/lib/site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

function env(values: Record<string, string | undefined>) {
  for (const key of ["APP_URL", "VERCEL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) {
    vi.stubEnv(key, values[key] ?? "");
  }
}

describe("siteUrl", () => {
  it("uses APP_URL when it is set, without a trailing slash", () => {
    env({ APP_URL: "https://care.example.com/" });
    expect(siteUrl()).toBe("https://care.example.com");
  });

  it("falls back to the Vercel production domain", () => {
    env({ VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "saathi.vercel.app" });
    expect(siteUrl()).toBe("https://saathi.vercel.app");
  });

  it("ignores a localhost APP_URL copied into Vercel", () => {
    env({ APP_URL: "http://localhost:3000", VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "saathi.vercel.app" });
    expect(siteUrl()).toBe("https://saathi.vercel.app");
  });

  it("keeps a custom domain on Vercel", () => {
    env({ APP_URL: "https://saathi.care", VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "saathi.vercel.app" });
    expect(siteUrl()).toBe("https://saathi.care");
  });

  it("defaults to localhost for local development", () => {
    env({});
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
