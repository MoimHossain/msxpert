import { z } from "zod";

export const ORG_UNITS = ["CSU", "STU", "ATU", "ISD", "Unknown"] as const;
export type OrgUnit = typeof ORG_UNITS[number];
export const orgDiscoveryModeSchema = z.enum(["milestones", "hierarchy"]);
export type OrgDiscoveryMode = z.infer<typeof orgDiscoveryModeSchema>;

export const orgPersonInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(300),
  upn: z.email().trim().max(500),
  jobTitle: z.string().trim().max(500),
  org: z.enum(ORG_UNITS),
  msxUserIds: z.array(z.guid()).max(200).refine(ids => new Set(ids.map(id => id.toLowerCase())).size === ids.length,
    "Duplicate MSX user links."),
}).strict();
export type OrgPersonInput = z.infer<typeof orgPersonInputSchema>;

export interface OrgPerson {
  id: string;
  name: string;
  upn: string;
  alias: string;
  jobTitle: string;
  org: OrgUnit;
  msxUserIds: string[];
  source: "discovered" | "manual" | "imported";
  updatedAt: string;
}

export interface OrgProfile {
  name: string;
  upn: string;
  jobTitle: string;
  hasReports: boolean | null;
}

export interface OrgProgress {
  mode: OrgDiscoveryMode;
  id: string;
  running: boolean;
  status: "running" | "complete" | "partial" | "failed" | "cancelled";
  stage: "identity" | "resolving" | "profiles" | "climbing" | "descending" | "linking" | "finished";
  startedAt: string;
  finishedAt: string | null;
  root: OrgProfile | null;
  currentPerson: string | null;
  visited: number;
  queued: number;
  matched: number;
  saved: number;
  requests: number;
  warnings: string[];
  logs: Array<{ at: string; message: string }>;
  error: string | null;
}

export interface OrgState {
  people: OrgPerson[];
  revision: string;
  progress: OrgProgress | null;
  root: OrgProfile | null;
  identity: string | null;
  canDiscover: boolean;
  linkError: string | null;
}

export interface OrgImportSummary {
  added: number;
  updated: number;
  preservedManual: number;
  preservedNewer: number;
  total: number;
}

export interface OrgImportResult {
  state: OrgState;
  summary: OrgImportSummary;
}
