import type { AppSettings } from "../shared/types";

export const WATCHED_FIELDS = [
  "name",
  "date",
  "status",
  "statusReason",
  "commitment",
  "monthlyUse",
  "ownerName",
  "accountName",
  "opportunityName",
  "forecastComments",
  "milestoneComments",
  "category",
  "workload",
  "solutionArea",
  "helpNeeded",
  "azureRegion",
  "nonRecurringMonths",
] as const;

export const DEFAULT_EXCLUDED_STATUSES = [
  { value: 861980003, label: "Completed" },
  { value: 861980004, label: "Cancelled" },
  { value: 861980005, label: "Lost to Competitor" },
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function microsoftFiscalYear(now = new Date()): {
  label: string;
  dateFrom: string;
  dateTo: string;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startYear = month >= 6 ? year : year - 1;
  const fiscalYear = (startYear + 1) % 100;
  return {
    label: `FY${String(fiscalYear).padStart(2, "0")}`,
    dateFrom: isoDate(new Date(Date.UTC(startYear, 6, 1))),
    dateTo: isoDate(new Date(Date.UTC(startYear + 1, 5, 30))),
  };
}

export function defaultSettings(now = new Date()): AppSettings {
  const fiscal = microsoftFiscalYear(now);
  return {
    scope: {
      ...fiscal,
      excludedStatusValues: DEFAULT_EXCLUDED_STATUSES.map((status) => status.value),
      excludedStatusLabels: DEFAULT_EXCLUDED_STATUSES.map((status) => status.label),
    },
    retentionSnapshots: 60,
    privacyAccepted: false,
  };
}
