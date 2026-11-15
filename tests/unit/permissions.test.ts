import { describe, expect, it } from "vitest";
import { CAPABILITIES, can, capabilityMatrix } from "@/lib/permissions";

describe("role-based permissions", () => {
  it("gives admins (and so the elder) every capability", () => {
    for (const capability of CAPABILITIES) {
      expect(can({ role: "family", isAdmin: true }, capability)).toBe(true);
      expect(can({ role: "elder", isAdmin: true }, capability)).toBe(true);
    }
  });

  it("lets caretakers run day-to-day care but not the circle itself", () => {
    const caretaker = { role: "caretaker" as const, isAdmin: false };
    expect(can(caretaker, "manageMedications")).toBe(true);
    expect(can(caretaker, "assignResponsibilities")).toBe(true);
    expect(can(caretaker, "acknowledgeAlerts")).toBe(true);
    expect(can(caretaker, "manageCircle")).toBe(false);
  });

  it("lets family stay informed, confirm doses, follow up and handle visits", () => {
    const family = { role: "family" as const, isAdmin: false };
    expect(can(family, "logDoses")).toBe(true);
    expect(can(family, "acknowledgeAlerts")).toBe(true);
    expect(can(family, "manageAppointments")).toBe(true);
    expect(can(family, "manageMedications")).toBe(false);
    expect(can(family, "assignResponsibilities")).toBe(false);
    expect(can(family, "manageCircle")).toBe(false);
  });

  it("describes the same rules in the matrix shown to people", () => {
    const matrix = capabilityMatrix();
    expect(matrix).toHaveLength(CAPABILITIES.length);
    for (const row of matrix) {
      expect(row.admin).toBe(true);
      expect(row.caretaker).toBe(can({ role: "caretaker", isAdmin: false }, row.capability));
      expect(row.family).toBe(can({ role: "family", isAdmin: false }, row.capability));
    }
  });
});
