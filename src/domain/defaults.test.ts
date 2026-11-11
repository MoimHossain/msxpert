import { describe, expect, it } from "vitest";
import { microsoftFiscalYear } from "./defaults";

describe("microsoftFiscalYear", () => {
  it("starts in July", () => {
    expect(microsoftFiscalYear(new Date("2026-08-24T00:00:00Z"))).toEqual({
      label: "FY27",
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
    });
  });

  it("uses the prior calendar year before July", () => {
    expect(microsoftFiscalYear(new Date("2027-01-01T00:00:00Z"))).toEqual({
      label: "FY27",
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
    });
  });
});
