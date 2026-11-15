import { describe, expect, it } from "vitest";
import {
  appointmentReminderEmail,
  doseReminderEmail,
  escalationEmail,
  lowStockEmail,
  memberJoinedEmail,
  missedDoseEmail,
  passwordResetEmail,
} from "@/lib/email/templates";

describe("email templates", () => {
  it("builds the medicine-time email with a one-tap confirm link", () => {
    const email = doseReminderEmail({
      elderName: "Kamala",
      timeLabel: "8:00 AM",
      medicines: ["Metformin 500 mg (After food)", "Amlodipine 5 mg"],
      confirmUrl: "https://saathi.test/confirm?token=abc",
      appUrl: "https://saathi.test/p/1",
    });
    expect(email.subject).toBe("Medicine time (8:00 AM): Metformin 500 mg (After food) and 1 more");
    expect(email.html).toContain('href="https://saathi.test/confirm?token=abc"');
    expect(email.text).toContain("I’ve taken them: https://saathi.test/confirm?token=abc");
    expect(email.text).toContain("- Amlodipine 5 mg");
  });

  it("escapes anything a user typed", () => {
    const email = missedDoseEmail({
      elderName: `<script>alert("x")</script>`,
      timeLabel: "8:00 AM",
      medicines: [`<img src=x onerror=alert(1)>`],
      confirmUrl: "https://saathi.test/confirm",
      appUrl: "https://saathi.test",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("describes how late a dose is in plain words", () => {
    const base = { elderName: "Kamala", timeLabel: "8:00 AM", medicines: ["Metformin"], appUrl: "https://saathi.test" };
    expect(escalationEmail({ ...base, minutesLate: 45 }).text).toContain("about 45 minutes");
    expect(escalationEmail({ ...base, minutesLate: 61 }).text).toContain("about 1 hour ");
    expect(escalationEmail({ ...base, minutesLate: 125 }).text).toContain("about 2 hours");
    expect(escalationEmail({ ...base, minutesLate: 61 }).subject).toBe("Missed dose alert: Kamala (8:00 AM)");
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
    expect(lowStockEmail({ elderName: "Kamala", medicine: "Calcium", stock: 3, appUrl: "x" }).subject).toBe(
      "Running low: Calcium for Kamala",
    );
    expect(memberJoinedEmail({ elderName: "Kamala", memberName: "Priya", roleLabel: "caretaker", appUrl: "x" }).text).toContain(
      "remove them and generate a new passcode",
    );
    expect(passwordResetEmail({ name: "Rahul", resetUrl: "https://saathi.test/reset-password?token=t" }).text).toContain(
      "https://saathi.test/reset-password?token=t",
    );
  });
});
