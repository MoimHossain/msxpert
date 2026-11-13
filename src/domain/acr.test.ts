import { expect, it } from "vitest";
import { acrWindow, shapeAcrAccount } from "./acr";

it("keeps exactly twelve UTC months across fiscal/year boundaries with one provisional month", () => {
  const window = acrWindow(new Date("2026-10-01T00:01:00Z"));
  expect(window.months).toHaveLength(12);
  expect(window.months[0]).toMatchObject({ key: "FY26-Nov", year: 2025, provisional: false });
  expect(window.months.at(-1)).toMatchObject({ key: "FY27-Oct", year: 2026, provisional: true });
  expect(window.fiscalYears).toEqual(["FY26", "FY27"]);
  expect(acrWindow(new Date("2026-07-01T00:00:00Z")).months.at(-1)?.key).toBe("FY27-Jul");
});

it("aggregates all five levels, negative adjustments and fractional USD without using the open month for trend", () => {
  const window = acrWindow(new Date("2026-10-09T12:00:00Z"));
  const services = ["Azure", "Compute", "VMs", "Size", "SKU"];
  const entry = shapeAcrAccount({ id: "parent", name: "Synthetic account", tpid: "111" }, [
    { month: "FY27-Aug", acr: 100, services },
    { month: "FY27-Sep", acr: 130.25, services },
    { month: "FY27-Sep", acr: -10, services },
    { month: "FY27-Oct", acr: 9000, services },
    { month: "FY27-Sep", acr: 20, services: ["Azure", "Data", "SQL", "NA", "-"] },
  ], window, "2026-10-09T12:00:00Z");
  expect(entry.totals["FY27-Sep"]).toBe(140.25);
  expect(entry.delta).toBe(40.25);
  expect(entry.trend).toBe(.4025);
  expect(entry.total).toBe(9240.25);
  const compute = entry.hierarchy[0]?.children[0];
  expect(compute?.trend).toBe(.2025);
  expect(compute?.children[0]?.children[0]?.children[0]).toMatchObject({ name: "SKU", level: 5, total: 9220.25 });
  expect(entry.hierarchy[0]?.children[1]?.children[0]?.children).toEqual([]);
});

it("does not label an absent prior baseline as zero-percent growth or drop an unclassified account total", () => {
  const entry = shapeAcrAccount({ id: "parent", name: "Synthetic account", tpid: "111" },
    [{ month: "FY27-Sep", acr: 42, services: ["", "", "", "", ""] }],
    acrWindow(new Date("2026-10-01T00:00:00Z")), "2026-10-01T00:00:00Z");
  expect(entry.total).toBe(42);
  expect(entry.trend).toBeNull();
  expect(entry.hierarchy).toEqual([]);
});

it("rejects unexpected months, non-finite amounts and truncated service shapes", () => {
  const account = { id: "parent", name: "Synthetic account", tpid: "111" };
  const window = acrWindow(new Date("2026-10-01T00:00:00Z"));
  for (const row of [
    { month: "FY25-Sep", acr: 1, services: ["", "", "", "", ""] },
    { month: "FY27-Sep", acr: Infinity, services: ["", "", "", "", ""] },
    { month: "FY27-Sep", acr: 1, services: ["Azure"] },
  ]) expect(() => shapeAcrAccount(account, [row], window, "")).toThrow(/invalid|out-of-window/);
});
