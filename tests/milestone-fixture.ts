import type { MilestoneRow } from "../src/shared/types";

export function milestone(overrides: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id: "m1", number: "M-1", name: "Migration", date: "2026-10-01",
    status: "On Track", statusValue: 1, statusReason: null, commitment: "Committed",
    category: null, workload: "Azure", milestoneWorkload: "Azure", solutionArea: "Infrastructure",
    helpNeeded: null, azureRegion: null, azureCapacityType: null, monthlyUse: 100,
    monthlyUseFormatted: "100", nonRecurringMonths: null, forecastComments: null,
    forecastCommentsModifiedOn: null, milestoneComments: null, ownerId: "u1", ownerName: "Alex",
    accountId: "child", accountName: "Child customer", opportunityId: null, opportunityName: null,
    opportunityUrl: null, createdOn: null, createdById: null, createdByName: null, modifiedOn: null, modifiedByName: null,
    versionNumber: "1", url: "https://example.invalid/milestone",
    portfolioAccountId: "portfolio", portfolioAccountName: "Parent customer", portfolioTpid: "00100",
    ...overrides,
  };
}
