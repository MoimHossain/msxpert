import type { MilestoneRow } from "../shared/types";
import { HYGIENE_RULES, type HygieneCheck, type HygieneRow, type HygieneScope, type HygieneSnapshot, type MonthlyPipeline } from "../shared/hygiene";

const DAY = 86_400_000;
const text = (value: string | null | undefined) => value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
const sameId = (left: string | null | undefined, right: string | null | undefined) => Boolean(left && right && left.toLowerCase() === right.toLowerCase());

export function localBusinessDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateValue(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const number = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(number) && new Date(number).toISOString().slice(0, 10) === value ? number : null;
}

export function businessDateAfter(today: string, days: number): string {
  const value = dateValue(today);
  if (value === null) throw new Error("A valid local business date is required.");
  return new Date(value + days * DAY).toISOString().slice(0, 10);
}

function timestamp(value: string | null | undefined): number | null {
  if (!value || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const number = Date.parse(value);
  return Number.isFinite(number) ? number : null;
}

export function mappedOpportunityStage(row: MilestoneRow): { number: number; label: string } | null {
  const evidence = row.hygiene?.opportunity;
  if (!evidence || !sameId(evidence.id, row.opportunityId) || timestamp(evidence.checkedAt) === null) return null;
  const meaning = text(evidence.stageName).replace(/^(?:\d+[\s-]*)+/, "").replace(/\band\b/g, "&");
  if (meaning === "listen & consult") return { number: 1, label: "1 - Listen & Consult" };
  if (meaning === "inspire & design") return { number: 2, label: "2 - Inspire & Design" };
  if (Number.isInteger(evidence.reportStage) && evidence.reportStage! >= 1 && evidence.reportStage! <= 5) {
    return { number: evidence.reportStage!, label: `${evidence.reportStage} - ${evidence.stageName || "Cached report stage"}` };
  }
  return null;
}

export function selectHygieneScope(snapshot: HygieneSnapshot, scope: HygieneScope): MilestoneRow[] {
  if (scope === "mine") return snapshot.currentUserId ? snapshot.milestones.filter(row =>
    sameId(row.ownerId, snapshot.currentUserId)) : [];
  const watched = new Set(snapshot.watchedMilestoneIds.map(id => id.toLowerCase()));
  return snapshot.milestones.filter(row => watched.has(row.id.toLowerCase()));
}

interface Fact { value: boolean | null; reason: string }
function all(rule: HygieneCheck["rule"], facts: Fact[]): HygieneCheck {
  if (facts.some(fact => fact.value === false)) return { rule, result: "clear", reason: "Known cached inputs rule out this exception." };
  const unknown = facts.filter(fact => fact.value === null);
  return { rule, result: unknown.length ? "unknown" : "flagged",
    reason: (unknown.length ? unknown : facts).map(fact => fact.reason).join(" · ") };
}

export function evaluateHygiene(rows: MilestoneRow[], now = new Date()): HygieneRow[] {
  const today = localBusinessDate(now);
  const day = dateValue(today)!;
  const distinct = new Map(rows.map(row => [row.id.toLowerCase(), row]));
  return [...distinct.values()].flatMap(row => {
    const status = text(row.status) || new Map([
      [861980000, "on track"], [861980001, "at risk"], [861980002, "blocked"],
    ]).get(row.statusValue ?? -1) || "";
    if ([861980003, 861980004, 861980005].includes(row.statusValue ?? -1) ||
      ["completed", "cancelled", "canceled", "lost to competitor"].includes(status) ||
      row.hygiene?.excluded === true ||
      [row.category, row.statusReason].some(value => /^(?:hygiene(?:\s*\/\s*duplicate)?|duplicate)$/i.test(value?.trim() ?? ""))) return [];
    const open = ["on track", "at risk", "at-risk", "blocked"].includes(status) ||
      [861980000, 861980001, 861980002].includes(row.statusValue ?? -1);
    if (!open) return [{ milestone: row, checks: HYGIENE_RULES.map(rule => ({
      rule: rule.id, result: "unknown", reason: "Open/closed milestone status is not cached or recognized.",
    })) }];
    const committed = text(row.commitment);
    const commitment: Fact = { value: committed ? committed === "committed" : null, reason: committed ? "Committed" : "Commitment is not cached." };
    const category = text(row.category);
    const production: Fact = { value: category ? category === "production" : null, reason: category ? "Production category" : "Category is not cached." };
    const date = dateValue(row.date);
    const inWindow = (days: number): Fact => ({ value: date === null ? null : date >= day && date <= day + days * DAY,
      reason: date === null ? "A valid estimated date is not cached." : `Due ${row.date}; local window ${today} through ${businessDateAfter(today, days)}.` });
    const since = timestamp(row.hygiene?.commitmentTransitionAt);
    const age = since === null ? null : now.getTime() - since;
    const unit = row.ownerOrg;
    const segment = text(row.hygiene?.segment);
    const eligibleCategory: Fact = { value: category === "production" ? true :
      category === "intent" ? row.hygiene?.intentEligible ?? null : category ? false : null,
      reason: category === "production" ? "Production category" : "Applicable Intent/category eligibility is not cached." };
    const evidence = row.hygiene?.ownerValidity;
    const validEvidence = evidence?.source === "msx" && sameId(evidence.ownerId, row.ownerId) &&
      timestamp(evidence.checkedAt) !== null;
    const invalidOwner: Fact = !row.ownerId ? { value: true, reason: "No current MSX owner ID." } :
      validEvidence && evidence ? { value: evidence.status === "valid" ? false :
        evidence.status === "inactive" || evidence.status === "no-msx-access" ? true : null,
        reason: `Authoritative MSX owner evidence: ${evidence.status}, checked ${evidence.checkedAt}.` } :
        { value: null, reason: "Authoritative validity/MSX-access evidence for this owner is not cached; Team membership is not evidence." };
    const stage = mappedOpportunityStage(row);
    return [{ milestone: row, checks: [
      all("committed-non-csu", [
        commitment,
        { value: age === null || age < 0 ? null : age > 7 * DAY, reason: age === null || age < 0 ?
          "Actual commitment-transition timestamp is not cached or valid." :
          `Committed for ${(age / DAY).toFixed(1)} days since ${row.hygiene!.commitmentTransitionAt}.` },
        { value: !unit || unit === "Unknown" ? null : unit !== "CSU", reason: !unit || unit === "Unknown" ?
          "Current owner's organization is not known." : `Current owner organization: ${unit} (${row.ownerOrgBasis || "cached classification"}).` },
        { value: segment ? segment === "enterprise" : null, reason: segment ? "Enterprise segment" : "Enterprise account segment is not cached." },
        eligibleCategory,
      ]),
      all("due-uncommitted", [inWindow(30), { value: committed ? committed !== "committed" : null,
        reason: committed ? `Commitment: ${row.commitment}.` : "Commitment is not cached." }]),
      all("invalid-owner", [invalidOwner]),
      all("past-due", [{ value: date === null ? null : date < day, reason: date === null ?
        "A valid estimated date is not cached." : `Estimated date ${row.date} is before local today ${today}; status ${row.status} does not override it.` }]),
      all("low-stage", [production, commitment, { value: stage ? stage.number === 1 || stage.number === 2 : null,
        reason: stage ? `Linked opportunity mapped to ${stage.label}.` : "Linked-opportunity report sales stage is not cached or cannot be mapped." }]),
      all("coaching", [{ value: ["at risk", "at-risk", "blocked"].includes(status), reason: `Status ${row.status}.` }, inWindow(60)]),
    ] }];
  });
}

export function monthlyPipeline(rows: MilestoneRow[]): MonthlyPipeline {
  const totals = new Map<string, number>();
  let missingCurrency = 0, missingValue = 0;
  const distinct = new Map(rows.map(row => [row.id.toLowerCase(), row]));
  for (const row of distinct.values()) {
    if (row.monthlyUse === null || !Number.isFinite(row.monthlyUse)) { missingValue++; continue; }
    const currency = row.hygiene?.currency?.trim().toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency)) { missingCurrency++; continue; }
    totals.set(currency, (totals.get(currency) ?? 0) + row.monthlyUse);
  }
  return { totals: [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({ currency, value })), missingCurrency, missingValue };
}

export function priorityRows(rows: HygieneRow[]): HygieneRow[] {
  return rows.filter(row => row.checks.some(check => check.rule !== "coaching" && check.result === "flagged"));
}
