// Runs before every integration test file: real MongoDB + mocked Next.js request APIs + captured email.
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, inject, vi } from "vitest";
import { connectDB } from "@/lib/db";

process.env.MONGODB_URI = inject("mongoUri");
process.env.MONGODB_DB = `saathi_test_${randomUUID().slice(0, 8)}`;
process.env.AUTH_SECRET = "integration-test-secret-that-is-long-enough";
process.env.APP_URL = "https://saathi.test";
process.env.CRON_SECRET = "integration-cron-secret";
process.env.BCRYPT_ROUNDS = "4";
process.env.SMTP_HOST = "smtp.saathi.test";
process.env.SMTP_PORT = "465";
process.env.SMTP_USER = "robot@saathi.test";
process.env.SMTP_PASS = "not-a-real-password";
process.env.EMAIL_FROM = "Saathi <robot@saathi.test>";
delete process.env.GEMINI_API_KEY;
delete process.env.EMAIL_OUTBOX_DIR;

export interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Shared, mutable request/response state the mocks read from. */
const state = vi.hoisted(() => {
  class RedirectSignal extends Error {
    location: string;
    constructor(location: string) {
      super(`NEXT_REDIRECT ${location}`);
      this.location = location;
    }
  }
  class NotFoundSignal extends Error {
    constructor() {
      super("NEXT_NOT_FOUND");
    }
  }
  return {
    cookies: new Map<string, string>(),
    ip: "203.0.113.10",
    outbox: [] as Array<{ to: string; subject: string; html: string; text: string }>,
    /** When true, the fake mail server rejects every message. */
    failEmails: false,
    RedirectSignal,
    NotFoundSignal,
  };
});

export const testState = state;
export const { RedirectSignal, NotFoundSignal } = state;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined),
    set: (name: string, value: string) => {
      state.cookies.set(name, value);
    },
    delete: (name: string) => {
      state.cookies.delete(name);
    },
  }),
  headers: async () => new Headers({ "x-forwarded-for": state.ip }),
}));

vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new state.RedirectSignal(location);
  },
  notFound: () => {
    throw new state.NotFoundSignal();
  },
}));

vi.mock("next/cache", () => ({
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// Every email "sent" in a test lands in testState.outbox.
vi.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: async (message: SentEmail) => {
      if (state.failEmails) throw new Error("SMTP unavailable");
      state.outbox.push(message);
      return { messageId: `test-${state.outbox.length}` };
    },
  }),
}));

beforeAll(async () => {
  // Unique indexes back several guarantees (one email per account, send-once reminders), so build them up front.
  await connectDB();
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));
});

beforeEach(async () => {
  testState.cookies.clear();
  testState.outbox.length = 0;
  testState.failEmails = false;
  // A fresh "client IP" per test keeps per-IP rate limits from leaking between tests.
  testState.ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  // Empty every collection but keep the indexes (unique keys matter for the code under test).
  await connectDB();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  (globalThis as { __saathiMongoose?: unknown }).__saathiMongoose = undefined;
});
