import { describe, expect, it, vi } from "vitest";
import { GET as healthCheck } from "@/app/api/health/route";
import { POST as cron } from "@/app/api/cron/reminders/route";
import { POST as scan } from "@/app/api/profiles/[profileId]/scan/route";
import { createCircle, createUser, signInAs } from "./helpers";

const gemini = vi.hoisted(() => ({ response: "", retired: new Set<string>(), calls: [] as string[] }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async ({ model }: { model: string }) => {
        gemini.calls.push(model);
        if (gemini.retired.has(model)) {
          throw new Error(`{"error":{"code":404,"message":"models/${model} is not found for API version v1","status":"NOT_FOUND"}}`);
        }
        return { text: gemini.response };
      },
    };
  },
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));

function scanRequest(file?: File) {
  const body = new FormData();
  if (file) body.append("image", file);
  return new Request("https://saathi.test/api/scan", { method: "POST", body });
}

const routeContext = (profileId: string) => ({ params: Promise.resolve({ profileId }) });

describe("cron endpoint", () => {
  it("requires the secret", async () => {
    const response = await cron(new Request("https://saathi.test/api/cron/reminders", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("runs the reminder engine with the right secret", async () => {
    const response = await cron(
      new Request("https://saathi.test/api/cron/reminders", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, errors: 0 });
  });

  it("refuses to run when no secret is configured", async () => {
    const secret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const response = await cron(new Request("https://saathi.test/api/cron/reminders", { method: "POST" }));
      expect(response.status).toBe(503);
    } finally {
      process.env.CRON_SECRET = secret;
    }
  });
});

describe("prescription scan endpoint", () => {
  it("is only for members of the care circle", async () => {
    const { profileId } = await createCircle(await createUser("Rahul"));
    await signInAs(await createUser("Stranger"));
    const response = await scan(scanRequest(), routeContext(profileId));
    expect(response.status).toBe(403);
  });

  it("explains when AI isn't configured", async () => {
    const owner = await createUser("Rahul");
    const { profileId } = await createCircle(owner);
    await signInAs(owner);
    const response = await scan(scanRequest(), routeContext(profileId));
    expect(response.status).toBe(503);
  });

  describe("with a Gemini key", () => {
    async function member() {
      const owner = await createUser("Rahul");
      const { profileId } = await createCircle(owner);
      await signInAs(owner);
      process.env.GEMINI_API_KEY = "test-key";
      return profileId;
    }

    it("rejects files that aren't photos", async () => {
      const profileId = await member();
      try {
        const response = await scan(scanRequest(new File(["x"], "notes.txt", { type: "text/plain" })), routeContext(profileId));
        expect(response.status).toBe(415);
      } finally {
        delete process.env.GEMINI_API_KEY;
      }
    });

    it("returns cleaned-up suggestions from the AI", async () => {
      const profileId = await member();
      gemini.response = JSON.stringify({
        medicines: [
          { name: "Paracetamol", dosage: "500 mg", form: "tablet", times: ["8:00", "20:00", "8:00"], instructions: "After food", durationDays: 5 },
          { name: "Cough syrup", dosage: "5 ml", form: "syrup", times: ["not a time"], instructions: "", durationDays: null },
        ],
        notes: "",
      });
      try {
        const response = await scan(scanRequest(new File(["fake image"], "rx.jpg", { type: "image/jpeg" })), routeContext(profileId));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.medicines[0].times).toEqual(["08:00", "20:00"]);
        expect(body.medicines[1].times).toEqual(["08:00"]); // unreadable timing falls back to morning
      } finally {
        delete process.env.GEMINI_API_KEY;
      }
    });

    it("falls back to another model when the configured one has been retired", async () => {
      const profileId = await member();
      process.env.GEMINI_MODEL = "gemini-retired-model";
      gemini.retired.add("gemini-retired-model");
      gemini.calls.length = 0;
      gemini.response = JSON.stringify({ medicines: [{ name: "Crocin", dosage: "500 mg", form: "tablet", times: ["08:00"], instructions: "", durationDays: null }], notes: "" });
      try {
        const response = await scan(scanRequest(new File(["fake image"], "rx.jpg", { type: "image/jpeg" })), routeContext(profileId));
        expect(response.status).toBe(200);
        expect(gemini.calls).toEqual(["gemini-retired-model", "gemini-3.5-flash"]);
      } finally {
        delete process.env.GEMINI_MODEL;
        delete process.env.GEMINI_API_KEY;
        gemini.retired.clear();
      }
    });

    it("turns unreadable AI output into a friendly error", async () => {
      const profileId = await member();
      gemini.response = "Sorry, I can't help with that";
      try {
        const response = await scan(scanRequest(new File(["fake image"], "rx.jpg", { type: "image/jpeg" })), routeContext(profileId));
        expect(response.status).toBe(422);
        expect((await response.json()).error).toMatch(/clearer/);
      } finally {
        delete process.env.GEMINI_API_KEY;
      }
    });
  });
});

describe("health check", () => {
  it("reports that the database is reachable", async () => {
    const response = await healthCheck();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });
});
