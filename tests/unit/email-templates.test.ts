import { describe, expect, it } from "vitest";
import {
  appointmentReminderEmail,
  doseReminderEmail,
  escalationEmail,
  followUpEmail,
  lowStockEmail,
  memberJoinedEmail,
  passwordResetEmail,
} from "@/lib/email/templates";

const MEDICINES = ["Metformin 500 mg (After food)", "Amlodipine 5 mg"];

/** The hidden preview text that mail apps show next to the subject. */
function preheader(html: string): string {
  return html.match(/<div style="display:none[^>]*>([^<&]*)/)?.[1] ?? "";
}

describe("email templates", () => {
  it("builds the medicine-time email with a one-tap confirm link", () => {
    const email = doseReminderEmail({
      elderName: "Kamala",
      timeLabel: "8:00 AM",
      medicines: MEDICINES,
      confirmUrl: "https://saathi.test/confirm?token=abc",
      appUrl: "https://saathi.test/p/1",
    });
    expect(email.subject).toBe("Medicine reminder for Kamala · 8:00 AM");
    expect(email.html).toContain('href="https://saathi.test/confirm?token=abc"');
    expect(email.text).toContain("I’ve taken them: https://saathi.test/confirm?token=abc");
    expect(email.text).toContain("- Amlodipine 5 mg");
  });

  it("never puts medicine names in subjects or preview text (they show on lock screens)", () => {
    const emails = [
      doseReminderEmail({ elderName: "Kamala", timeLabel: "8:00 AM", medicines: MEDICINES, confirmUrl: "x", appUrl: "x" }),
      followUpEmail({ elderName: "Kamala", timeLabel: "8:00 AM", medicines: MEDICINES, minutesLate: 15, confirmUrl: "x", appUrl: "x" }),
      escalationEmail({
        recipientName: "Priya",
        elderName: "Kamala",
        timeLabel: "8:00 AM",
        medicines: MEDICINES,
        minutesLate: 30,
        ackUrl: "x",
        appUrl: "x",
      }),
      lowStockEmail({ elderName: "Kamala", medicine: "Metformin 500 mg", stock: 3, appUrl: "x" }),
    ];
    for (const email of emails) {
      for (const name of ["Metformin", "Amlodipine"]) {
        expect(email.subject).not.toContain(name);
        expect(preheader(email.html)).not.toContain(name);
        expect(email.text.split("\n")[0]).not.toContain(name);
      }
      expect(preheader(email.html).length).toBeGreaterThan(0);
    }
    // Doctors (and so specialities) stay out of appointment subjects too.
    const visit = appointmentReminderEmail({
      elderName: "Kamala",
      doctorName: "Dr. Mehta",
      specialty: "Oncologist",
      whenLabel: "Tue, 18 Nov · 10:30 AM",
      location: "",
      notes: "",
      soon: true,
      appUrl: "x",
    });
    expect(visit.subject).not.toContain("Mehta");
    expect(visit.subject).not.toContain("Oncologist");
    expect(visit.text).toContain("With: Dr. Mehta (Oncologist)");
  });

  it("escapes anything a user typed", () => {
    const email = followUpEmail({
      elderName: `<script>alert("x")</script>`,
      timeLabel: "8:00 AM",
      medicines: [`<img src=x onerror=alert(1)>`],
      minutesLate: 15,
      confirmUrl: "https://saathi.test/confirm",
      appUrl: "https://saathi.test",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("asks the responsible person to acknowledge, with their own link", () => {
    const base = {
      recipientName: "Priya Nair",
      elderName: "Kamala",
      timeLabel: "8:00 AM",
      medicines: ["Metformin"],
      ackUrl: "https://saathi.test/alerts/ack?token=t1",
      appUrl: "https://saathi.test/p/1",
    };
    const first = escalationEmail({ ...base, minutesLate: 30 });
    expect(first.subject).toBe("Action needed: Kamala’s 8:00 AM medicines are unconfirmed");
    expect(first.text).toContain("Hi Priya, please check on Kamala");
    expect(first.text).toContain("30 minutes after they were due");
    expect(first.text).toContain("I’m on it: https://saathi.test/alerts/ack?token=t1");
    expect(escalationEmail({ ...base, minutesLate: 61 }).text).toContain("1 hour after");
    expect(escalationEmail({ ...base, minutesLate: 125 }).text).toContain("2 hours after");

    const widened = escalationEmail({ ...base, recipientName: "Rahul", minutesLate: 45, alreadyAlerted: ["Priya Nair"] });
    expect(widened.subject).toBe("Still no response: Kamala’s 8:00 AM medicines");
    expect(widened.text).toContain("Priya Nair was alerted first, but nobody has responded yet.");
  });

  it("distinguishes 'soon' and 'tomorrow' appointment reminders", () => {
    const base = {
      elderName: "Kamala",
      doctorName: "Dr. Mehta",
      specialty: "Cardiologist",
      whenLabel: "Tue, 18 Nov · 10:30 AM",
      location: "City Hospital",
      notes: "",
      appUrl: "https://saathi.test",
    };
    expect(appointmentReminderEmail({ ...base, soon: true }).subject).toMatch(/^Soon: /);
    expect(appointmentReminderEmail({ ...base, soon: false }).subject).toMatch(/^Reminder: /);
    expect(appointmentReminderEmail({ ...base, soon: false }).text).toContain("Where: City Hospital");
    expect(appointmentReminderEmail({ ...base, soon: false }).text).not.toContain("Notes:");
  });

  it("covers stock, joins and password resets", () => {
    const stock = lowStockEmail({ elderName: "Kamala", medicine: "Calcium", stock: 3, appUrl: "x" });
    expect(stock.subject).toBe("Refill needed for Kamala’s medicines");
    expect(stock.text).toContain("Calcium: only 3 left");
    expect(memberJoinedEmail({ elderName: "Kamala", memberName: "Priya", roleLabel: "caretaker", appUrl: "x" }).text).toContain(
      "remove them and generate a new passcode",
    );
    expect(passwordResetEmail({ name: "Rahul", resetUrl: "https://saathi.test/reset-password?token=t" }).text).toContain(
      "https://saathi.test/reset-password?token=t",
    );
  });
});
