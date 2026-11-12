import { describe, expect, it } from "vitest";
import { classifyOrgTitle, isOrgBoundary } from "./org";

describe("deterministic organization title rules", () => {
  it.each([
    ["Cloud Solution Architect", "CSU"], ["Senior Cloud Solution Architect - Data & AI", "CSU"],
    ["CSA", "CSU"], ["Sr. CSA", "CSU"], ["Dir CSA", "CSU"], ["CSA Mgr", "CSU"],
    ["Senior CSA - Azure Infrastructure", "CSU"],
    ["CSAM Manager", "CSU"], ["Customer Success Account Manager", "CSU"],
    ["General Manager, Customer Success", "CSU"], ["Head of Customer Success", "CSU"],
    ["Cloud Solution Architecture Director", "CSU"],
    ["Solution Engineer", "STU"], ["Solution Engineering Mgr", "STU"],
    ["Technology Specialist", "STU"], ["Technical Sales Specialist", "STU"],
    ["Solution Area Specialist", "STU"], ["Specialist Sales Director", "STU"],
    ["Strategic Account Executive", "ATU"], ["Account Technology Strategist", "ATU"],
    ["Strat Acct Tech Strategist", "ATU"], ["Account Executive Manager", "ATU"],
    ["ATS Director", "ATU"],
    ["Specialist", "Unknown"], ["HR Specialist", "Unknown"], ["Account Manager", "Unknown"],
    ["General Manager", "Unknown"], ["Sales Manager", "Unknown"], ["Software Architect", "Unknown"],
    ["Customer Success", "Unknown"], ["Solution Engineer / Account Executive", "Unknown"],
    ["Cloud Solution Architect and Technical Specialist", "Unknown"],
    ["CSAM and Account Executive", "Unknown"], ["CASA", "Unknown"], ["", "Unknown"],
    ["Marketing Manager for CSA tools", "Unknown"], ["Product Manager CSAM tooling", "Unknown"],
    ["Program Manager ATS platform", "Unknown"],
  ])("%s => %s", (title, unit) => expect(classifyOrgTitle(title)).toBe(unit));

  it.each([
    "CVP, Customer Success", "Corporate Vice President - Sales", "Country Head",
    "Country Manager, Netherlands", "Country General Manager", "Country Managing Director", "Country President",
  ])("recognizes an explicit boundary: %s", title => expect(isOrgBoundary(title)).toBe(true));

  it.each(["General Manager Customer Success", "VP Sales", "Vice President", "General Manager Country Sales", "SCVP", "Country Sales Manager", "Executive Assistant to CVP"])(
    "does not substitute a generic boundary: %s", title => expect(isOrgBoundary(title)).toBe(false),
  );
});
