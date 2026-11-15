import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTransport } from "nodemailer";
import { env } from "@/lib/env";
import type { EmailContent } from "./templates";

interface MailSender {
  sendMail(message: { from: string; to: string; subject: string; html: string; text: string }): Promise<unknown>;
}

let transport: MailSender | null | undefined;

function getTransport(): MailSender | null {
  if (transport !== undefined) return transport;
  const smtp = env.smtp();
  transport = smtp
    ? createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      })
    : null;
  return transport;
}

export function isEmailConfigured(): boolean {
  return env.smtp() !== null;
}

/** "rahul@example.com" -> "ra***@example.com", so logs don't hold full addresses. */
export function maskEmail(address: string): string {
  const [name, domain] = address.split("@");
  return domain ? `${name.slice(0, 2)}***@${domain}` : "***";
}

export type DeliveryMode = "sent" | "preview";

/** Development/testing: also save previewed emails as JSON files (set EMAIL_OUTBOX_DIR). */
async function saveToOutbox(to: string, content: EmailContent): Promise<void> {
  const dir = process.env.EMAIL_OUTBOX_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}.json`);
  await writeFile(file, JSON.stringify({ to, ...content, createdAt: new Date().toISOString() }, null, 2));
}

/**
 * Sends one email. Without SMTP settings (local development) the email is printed to the
 * server console instead, so every reminder flow can be tested without an email account.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<DeliveryMode> {
  const smtp = env.smtp();
  const sender = getTransport();
  if (!smtp || !sender) {
    console.info(`\n[email preview] to ${maskEmail(to)}: ${content.subject}\n${content.text}\n`);
    await saveToOutbox(to, content);
    return "preview";
  }
  await sender.sendMail({ from: smtp.from, to, subject: content.subject, html: content.html, text: content.text });
  return "sent";
}

/** Sends the same email to each recipient separately (addresses aren't exposed to each other). Never throws. */
export async function sendToAll(recipients: Iterable<string>, content: EmailContent): Promise<{ sent: number; failed: number }> {
  const unique = [...new Set([...recipients].map((r) => r.trim().toLowerCase()).filter(Boolean))];
  const results = await Promise.allSettled(unique.map((to) => sendEmail(to, content)));
  let sent = 0;
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") sent++;
    else {
      failed++;
      console.error(`[email] failed to send to ${maskEmail(unique[index])}`, result.reason);
    }
  });
  return { sent, failed };
}
