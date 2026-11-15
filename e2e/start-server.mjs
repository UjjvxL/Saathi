// Starts the production build against a throwaway MongoDB for Playwright.
// Emails are written as JSON files to e2e/.outbox so tests can open the links inside them.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server-core";

const port = process.env.E2E_PORT ?? "3100";
const outbox = path.resolve("e2e/.outbox");

if (!existsSync(path.resolve(".next/BUILD_ID"))) {
  console.error("No production build found. Run `npm run build` before the end-to-end tests.");
  process.exit(1);
}

rmSync(outbox, { recursive: true, force: true });
mkdirSync(outbox, { recursive: true });

const mongo = process.env.MONGODB_TEST_URI ? null : await MongoMemoryServer.create();
const mongoUri = process.env.MONGODB_TEST_URI ?? mongo.getUri();

const server = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    MONGODB_URI: mongoUri,
    MONGODB_DB: "saathi_e2e",
    AUTH_SECRET: "e2e-test-secret-that-is-at-least-32-characters",
    CRON_SECRET: "e2e-cron-secret",
    APP_URL: `http://localhost:${port}`,
    EMAIL_OUTBOX_DIR: outbox,
    // Explicitly empty, so values from .env.local never leak into the test run.
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASS: "",
    GEMINI_API_KEY: "",
  },
});

async function shutdown(code = 0) {
  server.kill("SIGTERM");
  await mongo?.stop();
  process.exit(code);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
server.on("exit", (code) => void shutdown(code ?? 0));
