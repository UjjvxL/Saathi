import "server-only";
import { APP_NAME } from "@/lib/constants";
import { escapeHtml } from "@/lib/security";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export type EmailTone = "info" | "warning" | "danger";

const TONE_COLORS: Record<EmailTone, string> = {
  info: "#0f766e",
  warning: "#b45309",
  danger: "#b91c1c",
};

export interface LayoutOptions {
  subject: string;
  /** Inbox preview text. Keep it free of medical details (it shows on lock screens). */
  preheader?: string;
  heading: string;
  paragraphs: string[];
  items?: string[];
  cta?: { label: string; url: string };
  secondaryLink?: { label: string; url: string };
  tone?: EmailTone;
}

/** Builds a simple, large-type email (all text is escaped) plus a plain-text version. */
export function render(options: LayoutOptions): EmailContent {
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

  // Hidden preview text, padded so mail apps don't pull medical details from the body into the preview.
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(
    options.preheader ?? "Open this email for the details.",
  )}${"&#8199;&#847;".repeat(60)}</div>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border-top:6px solid ${color}">
<tr><td style="padding:26px 26px 8px">
<p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#0f766e">${APP_NAME}</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#1c1917">${escapeHtml(options.heading)}</h1>
${paragraphs}${items}${cta}${secondary}
</td></tr>
<tr><td style="padding:14px 26px 24px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4">
You get this because you are part of a ${APP_NAME} care circle. You can turn off email alerts in the circle’s Settings.
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

/** "Kamala Devi" -> "Kamala": friendlier in the first line of an email. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function lateLabel(minutesLate: number): string {
  const hours = Math.floor(minutesLate / 60);
  if (hours >= 1) return `${hours} hour${hours > 1 ? "s" : ""}`;
  return `${Math.max(1, Math.round(minutesLate))} minutes`;
}

// Subjects and headings never name medicines: they show in inbox lists and on lock screens.
// Medicine names only appear inside the email, which goes to the care circle alone.

export function doseReminderEmail(input: {
  elderName: string;
  timeLabel: string;
  medicines: string[];
  confirmUrl: string;
  appUrl: string;
}): EmailContent {
  return render({
    subject: `Medicine reminder for ${input.elderName} · ${input.timeLabel}`,
    preheader: "It’s time for the next medicines. Open for the list.",
    heading: `It’s ${input.timeLabel}: time for ${input.elderName}’s medicines`,
    paragraphs: ["Please take these medicines, then tap the button so the family knows:"],
    items: input.medicines,
    cta: { label: "I’ve taken them", url: input.confirmUrl },
    secondaryLink: { label: "Open today’s schedule", url: input.appUrl },
  });
}

export function followUpEmail(input: {
  elderName: string;
  timeLabel: string;
  medicines: string[];
  minutesLate: number;
  confirmUrl: string;
  appUrl: string;
}): EmailContent {
  return render({
    tone: "warning",
    subject: `Still pending: ${input.elderName}’s ${input.timeLabel} medicines`,
    preheader: "These medicines haven’t been confirmed yet.",
    heading: `The ${input.timeLabel} medicines are still pending`,
    paragraphs: [
      `It’s been ${lateLabel(input.minutesLate)} and nobody has confirmed these medicines for ${input.elderName} yet. If they’ve been taken, please tap the button.`,
    ],
    items: input.medicines,
    cta: { label: "Yes, they’re taken", url: input.confirmUrl },
    secondaryLink: { label: "Open today’s schedule", url: input.appUrl },
  });
}

export function escalationEmail(input: {
  recipientName: string;
  elderName: string;
  timeLabel: string;
  medicines: string[];
  minutesLate: number;
  ackUrl: string;
  appUrl: string;
  /** Set when this is the second alert, because nobody responded to the first one. */
  alreadyAlerted?: string[];
}): EmailContent {
  const second = input.alreadyAlerted !== undefined;
  const earlier = input.alreadyAlerted?.length ? input.alreadyAlerted.join(" and ") : "the responsible caretaker";
  return render({
    tone: "danger",
    subject: second
      ? `Still no response: ${input.elderName}’s ${input.timeLabel} medicines`
      : `Action needed: ${input.elderName}’s ${input.timeLabel} medicines are unconfirmed`,
    preheader: "Please check in and let the family know you’re following up.",
    heading: `Hi ${firstName(input.recipientName)}, please check on ${input.elderName}`,
    paragraphs: [
      `Nobody has confirmed the ${input.timeLabel} medicines, ${lateLabel(input.minutesLate)} after they were due.`,
      ...(second ? [`${earlier} ${input.alreadyAlerted?.length === 1 ? "was" : "were"} alerted first, but nobody has responded yet.`] : []),
      "Tap “I’m on it” so everyone knows you’re following up. Then call or visit, and record what happened in Saathi.",
    ],
    items: input.medicines,
    cta: { label: "I’m on it", url: input.ackUrl },
    secondaryLink: { label: "Open today’s schedule", url: input.appUrl },
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
    subject: `${input.soon ? "Soon" : "Reminder"}: ${input.elderName}’s doctor appointment, ${input.whenLabel}`,
    preheader: "Appointment details inside.",
    heading: input.soon
      ? `${input.elderName}’s doctor appointment is coming up soon`
      : `Reminder: ${input.elderName} has a doctor appointment`,
    paragraphs: [
      `With: ${doctor}`,
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
    subject: `Refill needed for ${input.elderName}’s medicines`,
    preheader: "A medicine is running low.",
    heading: "A medicine is running low",
    paragraphs: [
      `${input.medicine}: only ${input.stock} left for ${input.elderName}. Please arrange a refill soon so no doses are missed.`,
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
      `${input.memberName} used the Care ID and passcode to join ${input.elderName}’s care circle. They can now see the medicine schedule and appointments.`,
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
