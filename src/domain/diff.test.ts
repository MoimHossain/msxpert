import { describe, expect, it } from "vitest";
import type { ChangeDocument, NormalizedMilestone } from "../shared/types";
import { diffSnapshots, foldChanges } from "./diff";

function milestone(overrides: Partial<NormalizedMilestone> = {}): NormalizedMilestone {
  return {
    id: "m1",
    number: "M-1",
    name: "Migration",
    date: "2026-10-01",
    status: "On Track",
    statusValue: 1,
    statusReason: null,
    commitment: "Committed",
    category: null,
    workload: "Azure",
    milestoneWorkload: "Azure",
    solutionArea: "Infrastructure",
    helpNeeded: null,
    azureRegion: null,
    azureCapacityType: null,
    monthlyUse: 100,
    monthlyUseFormatted: "100",
    nonRecurringMonths: null,
    forecastComments: null,
    forecastCommentsModifiedOn: null,
    milestoneComments: null,
    ownerId: "u1",
    ownerName: "Alex",
    accountId: "a1",
    accountName: "Customer",
    opportunityId: null,
    opportunityName: null,
    opportunityUrl: null,
    createdOn: null,
    modifiedOn: null,
    modifiedByName: null,
    versionNumber: "1",
    url: "https://microsoftsales.crm.dynamics.com/m1",
    ...overrides,
  };
}

function document(
  runId: string,
  before: unknown,
  after: unknown,
): ChangeDocument {
  return {
    runId,
    generatedAt: "2026-08-24T00:00:00Z",
    baseline: false,
    previousRunId: null,
    account: { id: "a", name: "Account", tpid: "1" },
    filter: {
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
      windowLabel: "FY27",
      excludedStatuses: [],
      accountIdCount: 1,
    },
    counts: { added: 0, modified: 1, unwatchedOnly: 0, disappeared: 0, total: 1 },
    added: [],
    disappeared: [],
    modified: [
      {
        id: "m1",
        number: "M-1",
        name: "Migration",
        date: "2026-10-01",
        status: "On Track",
        commitment: "Committed",
        monthlyUse: 100,
        ownerName: "Alex",
        accountName: "Customer",
        url: "https://example.test",
        fields: [{ field: "status", before, after }],
      },
    ],
  };
}

describe("diffSnapshots", () => {
  it("uses version number as a fast path", () => {
    const result = diffSnapshots(
      [milestone()],
      [milestone({ status: "Blocked" })],
      ["status"],
    );
    expect(result.modified).toHaveLength(0);
  });

  it("records watched changes when the version moves", () => {
    const result = diffSnapshots(
      [milestone()],
      [milestone({ status: "Blocked", versionNumber: "2" })],
      ["status"],
    );
    expect(result.modified[0]?.fields).toEqual([
      { field: "status", before: "On Track", after: "Blocked" },
    ]);
  });
});

describe("foldChanges", () => {
  it("folds multiple edits to their net value", () => {
    const result = foldChanges([
      document("1", "On Track", "At Risk"),
      document("2", "At Risk", "Blocked"),
    ]);
    expect(result.modified[0]?.fields[0]).toMatchObject({
      before: "On Track",
      after: "Blocked",
      hops: 2,
    });
  });

  it("reports a value returning to its origin as churn", () => {
    const result = foldChanges([
      document("1", "On Track", "At Risk"),
      document("2", "At Risk", "On Track"),
    ]);
    expect(result.modified).toHaveLength(0);
    expect(result.churn).toHaveLength(1);
  });

  it("preserves unwatched-only modifications in the review queue", () => {
    const doc = document("1", "On Track", "At Risk");
    doc.modified[0]!.fields = [];
    doc.modified[0]!.unwatchedOnly = true;
    const result = foldChanges([doc]);
    expect(result.modified).toEqual([
      expect.objectContaining({ id: "m1", fields: [], unwatchedOnly: true }),
    ]);
  });
});
