import type { ChangeSet, ModifiedMilestone } from "../../shared/types";

/**
 * Matches the main-process definition in `getOverview` exactly (added + modified +
 * disappeared, including unwatched-only edits) so every view reports the same number.
 */
export function pendingChangeCount(changes: ChangeSet): number {
  return changes.added.length + changes.modified.length + changes.disappeared.length;
}

export function watchedModifications(changes: ChangeSet): ModifiedMilestone[] {
  return changes.modified.filter((item) => !item.unwatchedOnly);
}

export function unwatchedModifications(changes: ChangeSet): ModifiedMilestone[] {
  return changes.modified.filter((item) => item.unwatchedOnly);
}

export function hasOutstandingChanges(changes: ChangeSet): boolean {
  return pendingChangeCount(changes) > 0 || changes.churn.length > 0;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  date: "Milestone date",
  status: "Status",
  statusReason: "Status reason",
  commitment: "Commitment",
  monthlyUse: "Monthly use",
  ownerName: "Owner",
  accountName: "Account",
  opportunityName: "Opportunity",
  forecastComments: "Forecast comments",
  milestoneComments: "Milestone comments",
  category: "Category",
  workload: "Workload",
  solutionArea: "Solution area",
  helpNeeded: "Help needed",
  azureRegion: "Azure region",
  nonRecurringMonths: "Non-recurring months",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function formatFieldValue(value: unknown): string {
  if (value == null || value === "") return "(empty)";
  if (typeof value === "number") return new Intl.NumberFormat("en-US").format(value);
  return String(value);
}
