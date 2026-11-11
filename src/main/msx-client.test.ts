import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedMilestone, ScopeSettings } from "../shared/types";
import { classifyGone, MsxClient } from "./msx-client";

const scope: ScopeSettings = {
  label: "FY27",
  dateFrom: "2026-07-01",
  dateTo: "2027-06-30",
  excludedStatusValues: [861980003, 861980004, 861980005],
  excludedStatusLabels: ["Completed", "Cancelled", "Lost to Competitor"],
};

function milestone(
  overrides: Partial<NormalizedMilestone> = {},
): NormalizedMilestone {
  return {
    id: "m1",
    number: "M-1",
    name: "Migration",
    date: "2026-10-01",
    status: "On Track",
    statusValue: 861980000,
    statusReason: null,
    commitment: "Committed",
    category: null,
    workload: null,
    milestoneWorkload: null,
    solutionArea: null,
    helpNeeded: null,
    azureRegion: null,
    azureCapacityType: null,
    monthlyUse: 100,
    monthlyUseFormatted: null,
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

describe("classifyGone", () => {
  it("classifies an out-of-window milestone as re-dated", () => {
    const result = classifyGone(
      scope,
      milestone({ date: "2027-07-01", status: "At Risk", statusValue: 861980001 }),
      new Set(["a1"]),
    );
    expect(result.reason).toBe("date");
  });

  it("prefers a terminal status when status and date changed", () => {
    const result = classifyGone(
      scope,
      milestone({
        date: "2027-07-01",
        status: "Cancelled",
        statusValue: 861980004,
      }),
      new Set(["a1"]),
    );
    expect(result.reason).toBe("status");
    expect(result.causes).toEqual(["status", "date"]);
  });

  it("does not claim an unreadable record was deleted", () => {
    const result = classifyGone(scope, null, new Set(["a1"]));
    expect(result.reason).toBe("unavailable");
    expect(result.summary).toContain("outside your access");
  });
});

describe("MsxClient query construction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("URL-encodes structural characters in account searches", async () => {
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const client = new MsxClient({
      getAccessToken: async () => "token",
    });

    await client.searchAccounts("AT&T #1");

    const filter = new URL(requestedUrl).searchParams.get("$filter");
    expect(filter).toBe(
      "statecode eq 0 and msp_mstopparentid ne null and contains(name,'AT&T #1')",
    );
    expect(new URL(requestedUrl).searchParams.get("$top")).toBe("100");
  });

  it("resolves a TPID search directly to its top-parent account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            value: [
              {
                accountid: "child-id",
                name: "Child account",
                msp_mstopparentid: "1877639",
                "msp_parentinglevelcode@OData.Community.Display.V1.FormattedValue":
                  "Child",
              },
              {
                accountid: "top-id",
                name: "Top account",
                msp_mstopparentid: "1877639",
                "msp_parentinglevelcode@OData.Community.Display.V1.FormattedValue":
                  "Top",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const client = new MsxClient({
      getAccessToken: async () => "token",
    });

    const results = await client.searchAccounts("1877639");

    expect(results).toEqual([
      expect.objectContaining({
        id: "top-id",
        name: "Top account",
        tpid: "1877639",
        parentingLevel: "Top",
      }),
    ]);
  });

  it("builds a valid milestone filter when no statuses are excluded", async () => {
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const client = new MsxClient({
      getAccessToken: async () => "token",
    });

    await client.fetchMilestones(
      { ...scope, excludedStatusValues: [], excludedStatusLabels: [] },
      ["00000000-0000-0000-0000-000000000001"],
    );

    const filter = new URL(requestedUrl).searchParams.get("$filter");
    expect(filter).not.toContain("and  and");
    expect(filter).toContain("msp_milestonedate ge 2026-07-01");
  });
});
