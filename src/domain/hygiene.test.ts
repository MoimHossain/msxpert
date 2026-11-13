import { describe, expect, it } from "vitest";
import { milestone } from "../../tests/milestone-fixture";
import { businessDateAfter, evaluateHygiene, localBusinessDate, mappedOpportunityStage, monthlyPipeline, priorityRows, selectHygieneScope } from "./hygiene";
import type { HygieneRule, HygieneSnapshot } from "../shared/hygiene";

const now = new Date("2026-11-13T12:00:00Z");
const today = localBusinessDate(now);
const evaluate = (overrides: Parameters<typeof milestone>[0], rule: HygieneRule) =>
  evaluateHygiene([milestone(overrides)], now)[0]?.checks.find(check => check.rule === rule);

describe("local hygiene rules", () => {
  it("uses local calendar dates and preserves calendar windows across DST and year boundaries", () => {
    const local = new Date(2026, 10, 13, 0, 5);
    expect(localBusinessDate(local)).toBe("2026-11-13");
    expect(businessDateAfter("2026-12-31", 30)).toBe("2027-01-30");
    expect(businessDateAfter("2026-03-20", 30)).toBe("2026-04-19");
    expect(() => businessDateAfter("2026-02-30", 1)).toThrow("valid local");
  });

  it.each([[-1, "clear"], [0, "flagged"], [30, "flagged"], [31, "clear"]] as const)(
    "evaluates uncommitted due offset %s without admitting past dates", (offset, result) => {
      expect(evaluate({ date: businessDateAfter(today, offset), commitment: "Uncommitted" }, "due-uncommitted")?.result).toBe(result);
    });

  it("separates coaching, includes day 60 and does not let On Track hide a past date", () => {
    expect(evaluate({ date: businessDateAfter(today, 60), status: "At Risk" }, "coaching")?.result).toBe("flagged");
    expect(evaluate({ date: businessDateAfter(today, 61), status: "Blocked" }, "coaching")?.result).toBe("clear");
    expect(evaluate({ date: businessDateAfter(today, -1), status: "Blocked" }, "coaching")?.result).toBe("clear");
    expect(evaluate({ date: businessDateAfter(today, -1), status: "On Track" }, "past-due")?.result).toBe("flagged");
    expect(evaluate({ date: today, status: null, statusValue: 861980001 }, "coaching")?.result).toBe("flagged");
  });

  it.each(["Completed", "Cancelled", "Lost to Competitor"])("excludes terminal status %s", status => {
    expect(evaluateHygiene([milestone({ status, date: "2020-01-01", ownerId: null })], now)).toEqual([]);
  });

  it("excludes explicit Hygiene/Duplicate but not words in the name or comments", () => {
    expect(evaluateHygiene([milestone({ statusReason: "Hygiene / Duplicate" })], now)).toEqual([]);
    expect(evaluateHygiene([milestone({ category: "Duplicate" })], now)).toEqual([]);
    expect(evaluate({ name: "Duplicate network migration", milestoneComments: "Hygiene review", date: "2020-01-01" }, "past-due")?.result).toBe("flagged");
  });

  it("keeps missing lifecycle, date, commitment, category and stages unevaluable", () => {
    expect(evaluate({ status: null, statusValue: null }, "past-due")?.result).toBe("unknown");
    expect(evaluate({ date: "2026-02-30" }, "past-due")?.result).toBe("unknown");
    expect(evaluate({ date: today, commitment: null }, "due-uncommitted")?.result).toBe("unknown");
    expect(evaluate({ category: "Production" }, "low-stage")?.result).toBe("unknown");
    expect(evaluate({ category: "Production" }, "committed-non-csu")?.reason).toContain("transition");
    expect(evaluate({ commitment: "Uncommitted" }, "low-stage")?.result).toBe("clear");
  });

  it("uses actual transition age strictly greater than seven days plus Enterprise and eligible category", () => {
    const row = { category: "Production", ownerOrg: "STU" as const,
      createdOn: "2020-01-01T00:00:00Z", hygiene: { commitmentTransitionAt: "2026-11-06T12:00:00Z", segment: "Enterprise" } };
    expect(evaluate(row, "committed-non-csu")?.result).toBe("clear");
    expect(evaluate({ ...row, hygiene: { ...row.hygiene, commitmentTransitionAt: "2026-11-06T11:59:59Z" } }, "committed-non-csu")?.result).toBe("flagged");
    expect(evaluate({ ...row, hygiene: { segment: "Enterprise" } }, "committed-non-csu")?.result).toBe("unknown");
    expect(evaluate({ ...row, hygiene: { ...row.hygiene, segment: "SMB" } }, "committed-non-csu")?.result).toBe("clear");
    expect(evaluate({ ...row, ownerOrg: "CSU" }, "committed-non-csu")?.result).toBe("clear");
    expect(evaluate({ ...row, category: "Intent", hygiene: { segment: "Enterprise", commitmentTransitionAt: "2026-11-01T00:00:00Z" } }, "committed-non-csu")?.result).toBe("unknown");
    expect(evaluate({ ...row, category: "Intent", hygiene: { segment: "Enterprise", intentEligible: true,
      commitmentTransitionAt: "2026-11-01T00:00:00Z" } }, "committed-non-csu")?.result).toBe("flagged");
  });

  it("does not treat an owner absent from Team as invalid and binds MSX evidence to the exact current owner", () => {
    expect(evaluate({ ownerId: null }, "invalid-owner")?.result).toBe("flagged");
    expect(evaluate({ ownerId: "person-not-on-team" }, "invalid-owner")?.result).toBe("unknown");
    const evidence = { ownerId: "u1", status: "inactive" as const, source: "msx" as const, checkedAt: now.toISOString() };
    expect(evaluate({ hygiene: { ownerValidity: evidence } }, "invalid-owner")?.result).toBe("flagged");
    expect(evaluate({ ownerId: "different", hygiene: { ownerValidity: evidence } }, "invalid-owner")?.result).toBe("unknown");
    expect(evaluate({ hygiene: { ownerValidity: { ...evidence, status: "valid" } } }, "invalid-owner")?.result).toBe("clear");
  });

  it("maps step meaning, not its first digit, and rejects stage evidence for a different opportunity", () => {
    const row = milestone({ category: "Production", opportunityId: "o1", hygiene: {
      opportunity: { id: "o1", stageName: "4-4-Inspire & Design", checkedAt: now.toISOString() },
    } });
    expect(mappedOpportunityStage(row)).toEqual({ number: 2, label: "2 - Inspire & Design" });
    expect(evaluate(row, "low-stage")?.result).toBe("flagged");
    expect(evaluate({ ...row, opportunityId: "o2" }, "low-stage")?.result).toBe("unknown");
    expect(mappedOpportunityStage({ ...row, hygiene: { opportunity: { id: "o1", stageName: "4-Unknown", checkedAt: now.toISOString() } } })).toBeNull();
  });

  it("deduplicates Priority across rules and does not add coaching-only milestones", () => {
    const flagged = milestone({ ownerId: null, date: "2020-01-01" });
    const coach = milestone({ id: "coach", status: "Blocked", date: businessDateAfter(today, 40) });
    const rows = evaluateHygiene([flagged, flagged, coach], now);
    expect(priorityRows(rows).map(row => row.milestone.id)).toEqual(["m1"]);
    expect(rows.find(row => row.milestone.id === "coach")?.checks.find(check => check.rule === "coaching")?.result).toBe("flagged");
  });

  it("never combines mixed or unknown currencies or hides missing values", () => {
    const usd = milestone({ id: "usd", monthlyUse: 100, hygiene: { currency: "USD" } });
    const eur = milestone({ id: "eur", monthlyUse: 200, hygiene: { currency: "EUR" } });
    expect(monthlyPipeline([usd, usd, eur, milestone({ id: "unknown", monthlyUseFormatted: "$300", monthlyUse: 300 }),
      milestone({ id: "missing", monthlyUse: null })])).toEqual({
      totals: [{ currency: "EUR", value: 200 }, { currency: "USD", value: 100 }], missingCurrency: 1, missingValue: 1,
    });
  });

  it("selects exact current-user ownership independently of watched accounts, never names or reporting lines", () => {
    const snapshot: HygieneSnapshot = { currentUserId: "ME", watchedMilestoneIds: ["watched"],
      captures: [], milestones: [
        milestone({ id: "watched", ownerId: "other", ownerName: "Same Name" }),
        milestone({ id: "outside", ownerId: "me", ownerEntityType: "systemuser", portfolioAccountId: "outside" }),
        milestone({ id: "manager", ownerId: "boss", ownerName: "Same Name", ownerEntityType: "systemuser" }),
      ] };
    expect(selectHygieneScope(snapshot, "watched").map(row => row.id)).toEqual(["watched"]);
    expect(selectHygieneScope(snapshot, "mine").map(row => row.id)).toEqual(["outside"]);
    expect(selectHygieneScope({ ...snapshot, currentUserId: null }, "mine")).toEqual([]);
  });
});
