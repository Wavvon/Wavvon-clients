import type { BadgeRule } from "../types";

export type BadgeUnit = "days" | "months" | "years" | "hours" | "count";

const SECONDS: Record<Exclude<BadgeUnit, "count">, number> = {
  hours: 3600,
  days: 86400,
  months: 30 * 86400,
  years: 365 * 86400,
};

export function ruleUnits(rule: BadgeRule): BadgeUnit[] {
  if (rule === "member_age" || rule === "role_held") return ["days", "months", "years"];
  if (rule === "online" || rule === "voice") return ["hours"];
  return ["count"];
}

export function toThreshold(amount: number, unit: BadgeUnit): number {
  return unit === "count" ? Math.round(amount) : Math.round(amount * SECONDS[unit]);
}

/** The largest unit the threshold is a whole number of, for showing a saved level. */
export function fromThreshold(threshold: number, rule: BadgeRule): { amount: number; unit: BadgeUnit } {
  const units = ruleUnits(rule);
  if (units[0] === "count") return { amount: threshold, unit: "count" };
  for (const unit of [...units].reverse()) {
    const s = SECONDS[unit as Exclude<BadgeUnit, "count">];
    if (threshold >= s && threshold % s === 0) return { amount: threshold / s, unit };
  }
  const first = units[0] as Exclude<BadgeUnit, "count">;
  return { amount: threshold / SECONDS[first], unit: first };
}
