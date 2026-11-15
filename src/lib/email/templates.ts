import "server-only";
import { APP_NAME } from "@/lib/constants";
import { escapeHtml } from "@/lib/security";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

type Tone = "info" | "warning" | "danger";

const TONE_COLORS: Record<Tone, string> = {
  info: "#0f766e",
  warning: "#b45309",
  danger: "#b91c1c",
};

interface LayoutOptions {
  subject: string;
  heading: string;
  paragraphs: string[];
  items?: string[];
  cta?: { label: string; url: string };
  secondaryLink?: { label: string; url: string };
  tone?: Tone;
}

/** Builds a simple, large-type email (all text is escaped) plus a plain-text version. */
function render(options: LayoutOptions): EmailContent {
  const color = TONE_COLORS[options.tone ?? "info"];
  const paragraphs = options.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:18px;line-height:1.5;color:#1c1917">${escapeHtml(p)}</p>`)
    .join("");
  const items = options.items?.length
    ? `<ul style="margin:0 0 18px;padding-left:22px;font-size:18px;line-height:1.6;color:#1c1917">${options.items
        .map((item) => `<li style="margin:4px 0"><strong>${escapeHtml(item)}</strong></li>`)
        .join("")}</ul>`
    : "";
  const cta = options.cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(options.cta.url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-size:18px;font-weight:bold;padding:14px 22px;border-radius:10px">${escapeHtml(options.cta.label)}</a></p>`
    : "";
  const secondary = options.secondaryLink
    ? `<p style="margin:0 0 8px;font-size:16px"><a href="${escapeHtml(options.secondaryLink.url)}" style="color:#0f766e">${escapeHtml(options.secondaryLink.label)}</a></p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border-top:6px solid ${color}">
<tr><td style="padding:26px 26px 8px">
<p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#0f766e">${APP_NAME}</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#1c1917">${escapeHtml(options.heading)}</h1>
${paragraphs}${items}${cta}${secondary}
</td></tr>
<tr><td style="padding:14px 26px 24px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4">
You get this because you are part of a ${APP_NAME} care circle. You can turn off email alerts on the Care circle page.
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    options.heading,
    "",
    ...options.paragraphs,
    ...(options.items?.length ? ["", ...options.items.map((item) => `- ${item}`)] : []),
    ...(options.cta ? ["", `${options.cta.label}: ${options.cta.url}`] : []),
    ...(options.secondaryLink ? [`${options.secondaryLink.label}: ${options.secondaryLink.url}`] : []),
    "",
    `- ${APP_NAME}`,
  ].join("\n");

  return { subject: options.subject, html, text };
}

function summarizeList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items[0]} and ${items.length - 1} more`;
}

export function doseReminderEmail(input: {
  elderName: string;
  timeLabel: string;
  medicines: string[];
  confirmUrl: string;
  appUrl: string;
}): EmailContent {
  return render({
    subject: `Medicine time (${input.timeLabel}): ${summarizeList(input.medicines)}`,
    heading: `It’s almost ${input.timeLabel}: time for ${input.elderName}’s medicines`,
    paragraphs: ["Please take these medicines:"],
    items: input.medicines,
    cta: { label: "I’ve taken them", url: input.confirmUrl },
    secondaryLink: { label: "Open today’s schedule", url: input.appUrl },
  });
}

export function missedDoseEmail(input: {
  elderName: string;
  timeLabel: string;
  medicines: string[];
  confirmUrl: string;
  appUrl: string;
}): EmailContent {
  return render({
    tone: "warning",
    subject: `Did ${input.elderName} take the ${input.timeLabel} medicines?`,
    heading: `The ${input.timeLabel} medicines haven’t been marked as taken`,
    paragraphs: [
      `These medicines for ${input.elderName} were due at ${input.timeLabel}. If they’ve been taken, please tap the button so the family knows.`,
    ],
    items: input.medicines,
    cta: { label: "Yes, they’re taken", url: input.confirmUrl },
    secondaryLink: { label: "Open today’s schedule", url: input.appUrl },
  });
}

export function escalationEmail(input: {
  elderName: string;
  timeLabel: string;
  medicines: string[];
  minutesLate: number;
  appUrl: string;
}): EmailContent {
  const hours = Math.floor(input.minutesLate / 60);
  const late = hours >= 1 ? `${hours} hour${hours > 1 ? "s" : ""}` : `${Math.round(input.minutesLate)} minutes`;
  return render({
    tone: "danger",
    subject: `Missed dose alert: ${input.elderName} (${input.timeLabel})`,
    heading: `${input.elderName} may have missed the ${input.timeLabel} medicines`,
    paragraphs: [
      `It’s been about ${late} and these medicines still aren’t marked as taken. You may want to check in with ${input.elderName}.`,
    ],
    items: input.medicines,
    cta: { label: "View today’s schedule", url: input.appUrl },
  });
}

export function appointmentReminderEmail(input: {
  elderName: string;
  doctorName: string;
  specialty: string;
  whenLabel: string;
  location: string;
  notes: string;
  soon: boolean;
  appUrl: string;
}): EmailContent {
  const doctor = input.specialty ? `${input.doctorName} (${input.specialty})` : input.doctorName;
  return render({
    subject: `${input.soon ? "Soon" : "Reminder"}: ${input.elderName}’s appointment with ${input.doctorName}, ${input.whenLabel}`,
    heading: input.soon
      ? `${input.elderName}’s appointment with ${doctor} is coming up soon`
      : `Reminder: ${input.elderName} has an appointment with ${doctor}`,
    paragraphs: [
      `When: ${input.whenLabel}`,
      ...(input.location ? [`Where: ${input.location}`] : []),
      ...(input.notes ? [`Notes: ${input.notes}`] : []),
      "Remember to carry previous prescriptions and reports.",
    ],
    cta: { label: "See appointment details", url: input.appUrl },
  });
}

export function lowStockEmail(input: {
  elderName: string;
  medicine: string;
  stock: number;
  appUrl: string;
}): EmailContent {
  return render({
    tone: "warning",
    subject: `Running low: ${input.medicine} for ${input.elderName}`,
    heading: `${input.medicine} is running low`,
    paragraphs: [
      `Only ${input.stock} left for ${input.elderName}. Please arrange a refill soon so no doses are missed.`,
    ],
    cta: { label: "Update stock", url: input.appUrl },
  });
}

export function memberJoinedEmail(input: {
  elderName: string;
  memberName: string;
  roleLabel: string;
  appUrl: string;
}): EmailContent {
  return render({
    subject: `${input.memberName} joined ${input.elderName}’s care circle`,
    heading: `${input.memberName} joined as ${input.roleLabel}`,
    paragraphs: [
      `${input.memberName} used the Care ID and passcode to join ${input.elderName}’s care circle. They can now see and manage medicines and appointments.`,
      "If you don’t recognise this person, remove them and generate a new passcode from the Care circle page.",
    ],
    cta: { label: "Review the care circle", url: input.appUrl },
  });
}

export function passwordResetEmail(input: { name: string; resetUrl: string }): EmailContent {
  return render({
    subject: `Reset your ${APP_NAME} password`,
    heading: `Hi ${input.name}, reset your password`,
    paragraphs: [
      "Someone (hopefully you) asked to reset the password for this account. The link works for 30 minutes and only once.",
      "If you didn’t ask for this, you can ignore this email. Your password won’t change.",
    ],
    cta: { label: "Choose a new password", url: input.resetUrl },
  });
}

export function testEmail(input: { name: string; appUrl: string }): EmailContent {
  return render({
    subject: `${APP_NAME} test email`,
    heading: `Hi ${input.name}, email reminders are working`,
    paragraphs: ["This is a test message. Medicine and appointment reminders will look like this."],
    cta: { label: `Open ${APP_NAME}`, url: input.appUrl },
  });
}
