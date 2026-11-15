import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/navigation";
import {
  escapeHtml,
  generateCareId,
  generatePasscode,
  normalizeCareId,
  safeEqual,
  safeRedirectPath,
} from "@/lib/security";

describe("Care ID and passcode", () => {
  it("creates 6-character Care IDs without look-alike characters", () => {
    for (let i = 0; i < 500; i++) {
      const id = generateCareId();
      expect(id).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it("creates distinct Care IDs", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateCareId()));
    expect(ids.size).toBe(1000);
  });

  it("creates 6-digit passcodes, keeping leading zeros", () => {
    for (let i = 0; i < 500; i++) expect(generatePasscode()).toMatch(/^\d{6}$/);
  });

  it("normalises what people type", () => {
    expect(normalizeCareId(" k7m-2xq ")).toBe("K7M2XQ");
  });
});

describe("redirect safety", () => {
  it("allows same-site paths", () => {
    expect(safeRedirectPath("/p/123?x=1")).toBe("/p/123?x=1");
    expect(safeNextPath("/join")).toBe("/join");
  });

  it("blocks open redirects to other sites", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("https://evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.example")).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(42)).toBe("/dashboard");
  });
});

describe("safeEqual", () => {
  it("compares secrets", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("short", "longer value")).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("neutralises markup from user input in emails", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;",
    );
  });
});
