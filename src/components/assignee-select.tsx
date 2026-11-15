"use client";

import { ROLE_LABELS, type Role } from "@/lib/constants";
import { SelectField } from "./ui/field";

export interface AssignableMember {
  userId: string;
  name: string;
  role: Role;
}

/**
 * "Who is responsible?" for a medicine or appointment. Without permission to assign, the current
 * choice is shown read-only and sent back unchanged (the server checks permissions either way).
 */
export function AssigneeSelect({
  members,
  defaultValue,
  error,
  canAssign,
  label,
  hint,
}: {
  members: AssignableMember[];
  defaultValue: string;
  error?: string[];
  canAssign: boolean;
  label: string;
  hint?: string;
}) {
  if (!canAssign) {
    const current = members.find((member) => member.userId === defaultValue);
    return (
      <div className="space-y-1.5">
        <p className="text-[0.95rem] font-medium text-stone-800">{label}</p>
        <p className="text-stone-700">{current ? `${current.name} (${ROLE_LABELS[current.role].toLowerCase()})` : "Nobody yet"}</p>
        <p className="text-sm text-stone-500">Only caretakers and admins can change this.</p>
        <input type="hidden" name="assigneeId" value={defaultValue} />
      </div>
    );
  }
  return (
    <SelectField label={label} name="assigneeId" defaultValue={defaultValue} error={error} hint={hint}>
      <option value="">Nobody in particular</option>
      {members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {member.name} ({ROLE_LABELS[member.role].toLowerCase()})
        </option>
      ))}
    </SelectField>
  );
}
