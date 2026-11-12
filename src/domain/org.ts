import type { OrgUnit } from "../shared/organization";

function words(title: string): string {
  return title.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function isOrgBoundary(title: string): boolean {
  const text = words(title);
  if (/\b(?:assistant|advisor|adviser|support) to\b/.test(text)) return false;
  return /\b(cvp|corporate vice president)\b/.test(text) ||
    /\bcountry (head|manager|general manager|managing director|president)\b/.test(text);
}

export function classifyOrgTitle(title: string): OrgUnit {
  const text = words(title);
  const leadership = /\b(manager|mgr|director|dir|head|lead|leader|leadership|president|cvp|gm|general manager)\b/;
  const role = text.replace(/^(?:(?:senior|sr|principal|strategic|strat|partner|chief|regional|area|global)\s+)*/, "");
  const successAcronym = /^(?:csa|csam)(?:$| \d+$| (?:manager|mgr|director|dir|lead|leader|leadership|head|azure|data|ai|security|infrastructure|apps|applications|and|or)\b)/.test(role) ||
    /^(?:manager|mgr|director|dir|head|lead|leader)(?: of| for)? (?:csa|csam)\b/.test(role);
  const units: OrgUnit[] = [];
  if (/\bcloud solution (architects?|architecture)\b|\bcustomer success account manager\b/.test(text) ||
      successAcronym || (/\bcustomer success\b/.test(text) && leadership.test(text))) units.push("CSU");
  if (/\bsolution (engineers?|engineering)\b|\b(?:technology|technical|solution area)(?: sales)? specialists?\b/.test(text) ||
      (/\bspecialist sales\b/.test(text) && leadership.test(text))) units.push("STU");
  if (/\baccount executives?\b|\b(?:account|acct) (?:technology|tech) strategists?\b/.test(text) ||
      (/^(?:ats (?:manager|mgr|director|dir|lead|head)|(?:manager|mgr|director|dir|head)(?: of| for)? ats)\b/.test(role))) units.push("ATU");
  return units.length === 1 ? units[0]! : "Unknown";
}
