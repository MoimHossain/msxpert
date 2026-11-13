import type { MilestoneRow } from "./types";

export interface HygieneEnrichment {
  commitmentTransitionAt?: string | null;
  segment?: string | null;
  intentEligible?: boolean | null;
  excluded?: boolean;
  currency?: string | null;
  opportunity?: {
    id: string;
    stageName: string | null;
    reportStage?: number | null;
    checkedAt: string;
  };
  ownerValidity?: {
    ownerId: string;
    status: "valid" | "inactive" | "no-msx-access";
    source: "msx";
    checkedAt: string;
  };
}

export interface HygieneCapture {
  accountId: string;
  name: string;
  watched: boolean;
  hasData: boolean;
  refreshedAt: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  excludedStatuses: string[];
}

export interface HygieneSnapshot {
  milestones: MilestoneRow[];
  watchedMilestoneIds: string[];
  captures: HygieneCapture[];
  currentUserId: string | null;
}

export type HygieneScope = "watched" | "mine";
export const HYGIENE_RULES = [
  { id: "committed-non-csu", title: "Committed for >7 days and not CSU owned", tone: "violet", description: "Enterprise, eligible category, actual commitment age and known non-CSU owner." },
  { id: "due-uncommitted", title: "Due in next 30 days and not Committed", tone: "amber", description: "Today through day 30, inclusive. Past dates are excluded." },
  { id: "invalid-owner", title: "Missing valid owner", tone: "rose", description: "Missing owner or authoritative cached evidence of inactive / no MSX access." },
  { id: "past-due", title: "Date past due", tone: "coral", description: "An open milestone before today, even when its status is On Track." },
  { id: "low-stage", title: "Committed in low stage", tone: "blue", description: "Production and Committed at Listen & Consult or Inspire & Design." },
  { id: "coaching", title: "Coaching: At-Risk or Blocked due in next 60 days", tone: "teal", description: "A coaching conversation, not a Priority exception. Today through day 60." },
] as const;
export type HygieneRule = typeof HYGIENE_RULES[number]["id"];
export interface HygieneCheck {
  rule: HygieneRule;
  result: "flagged" | "clear" | "unknown";
  reason: string;
}
export interface HygieneRow {
  milestone: MilestoneRow;
  checks: HygieneCheck[];
}
export interface MonthlyPipeline {
  totals: Array<{ currency: string; value: number }>;
  missingCurrency: number;
  missingValue: number;
}
