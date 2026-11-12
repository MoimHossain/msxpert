import { dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import type { WorkiqConfiguration } from "../shared/ai";
import type { OrgProfile } from "../shared/organization";
import { abortable, connectionEnvironment, workiqCommand, workiqTestCall } from "./ai-runtime";

export interface OrgFacts {
  person: OrgProfile;
  manager: OrgProfile | null;
  reports: OrgProfile[];
  complete: boolean;
  limitations: string[];
}

export interface OrgWorkiqSession {
  query(upn: string, includeReports: boolean, signal: AbortSignal,
    options?: { correctFormat?: boolean; profileOnly?: boolean }): Promise<OrgFacts>;
  close(): Promise<void>;
}

export class OrgResponseError extends Error {
  constructor(message: string, readonly correctableFormat = false) { super(message); }
}
export class OrgWorkiqError extends Error {}

const accessDenial = /\b(?:access denied|permission denied|not authori[sz]ed|forbidden|insufficient permissions|blocked by policy|(?:do not|don't|cannot|can't) (?:have )?access)\b/i;
const serviceErrorMessage = "Work IQ returned a service error or access denial. Discovery stopped without switching tools or requesting additional access.";

export function orgProfileQuestion(upn: string, includeReports: boolean, profileOnly = false): string {
  if (!z.email().safeParse(upn).success) throw new OrgResponseError("Invalid exact work UPN.");
  return [
    "Read-only people-profile request only. Do not read email, chats, files, calendars or other content,",
    "perform actions, change permissions, or request additional access. Use only your existing approved people-profile access.",
    `Return the exact work profile for UPN ${JSON.stringify(upn)}${profileOnly ? "" : " and that person's immediate manager"}. Do not match by display name.`,
    "This UPN is the requested profile, not a claim about your client's authenticated identity. Do not try to determine the client's signed-in account.",
    profileOnly
      ? "Only this person's identity and actual job title are needed. Do not retrieve a manager or any reports. Return manager=null, reports=[], hasReports=null; relationships are not required for this request."
      : includeReports
      ? "Also return immediate direct reports only, not indirect reports. Set complete=false if the list is sampled, truncated, uncertain or incomplete. Do not invent paging/cursors."
      : "Do not retrieve direct reports; return reports=[].",
    'Return only valid JSON with this shape: {"person":{"name":"display name","upn":"exact work UPN","jobTitle":"actual title","hasReports":true},"manager":null,"reports":[],"complete":true,"limitations":[]}.',
    "manager (when known) and every reports entry use the same profile shape as person. hasReports must be true, false, or null when unknown.",
    "UPNs must be actual exact work UPNs, never Office EntityRepresentationId, links, aliases, inferred addresses or display-name joins.",
    "Use null for an unavailable manager, disclose missing facts in limitations, and set complete=false for missing/uncertain facts or unavailable relationships.",
    "Do not include unrelated people or additional private data. Do not guess missing profile facts.",
    "If the requested profile is unavailable, return person=null, complete=false and explain the limitation. Do not echo the requested UPN as evidence of a profile you could not retrieve.",
  ].join(" ");
}

function hasServiceError(value: unknown, depth = 0): boolean {
  if (depth > 10 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(item => hasServiceError(item, depth + 1));
  const object = value as Record<string, unknown>;
  if (object.isError === true || (object.error !== undefined && object.error !== null && object.error !== false && object.error !== "") ||
      (Array.isArray(object.errors) && object.errors.length > 0) ||
      (Array.isArray(object.limitations) && object.limitations.some(item => typeof item === "string" && accessDenial.test(item))) ||
      (typeof object.statusCode === "number" && object.statusCode >= 400)) return true;
  return Object.values(object).some(item => hasServiceError(item, depth + 1));
}

function unwrap(value: unknown, depth = 0): unknown {
  if (depth > 8) throw new OrgResponseError("Work IQ returned too many response wrappers.");
  if (hasServiceError(value)) throw new OrgWorkiqError(serviceErrorMessage);
  if (typeof value === "string") {
    if (value.length > 2_000_000) throw new OrgResponseError("Work IQ response exceeded the size limit.");
    const text = value.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch {
      if (accessDenial.test(text)) throw new OrgWorkiqError(serviceErrorMessage);
      throw new OrgResponseError("Work IQ did not return valid profile JSON; no prose was accepted.", /^\{\s*"person"\s*:/.test(text));
    }
    return unwrap(parsed, depth + 1);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if ("person" in object) return object;
    if (Array.isArray(object.content)) {
      const text = object.content.filter(block => block && block.type === "text" && typeof block.text === "string")
        .map(block => block.text).join("\n");
      if (text.trim()) return unwrap(text, depth + 1);
      if (object.structuredContent) return unwrap(object.structuredContent, depth + 1);
    }
    for (const key of ["response", "answer", "result", "structuredContent"]) {
      if (object[key] !== undefined) return unwrap(object[key], depth + 1);
    }
  }
  throw new OrgResponseError("Work IQ did not return a profile object.");
}

export function readOrgWorkiqResult(result: unknown, expectedUpn: string | null = null, profileOnly = false): OrgFacts {
  const value = unwrap(result) as Record<string, unknown>;
  const limitations: string[] = [];
  const profile = (input: unknown): OrgProfile => {
    if (!input || typeof input !== "object") throw new OrgResponseError("Work IQ omitted a required profile.");
    const object = input as Record<string, unknown>;
    if (typeof object.upn !== "string" || object.upn.length > 500 || !z.email().safeParse(object.upn).success) {
      throw new OrgResponseError("Work IQ returned a missing or invalid exact work UPN.");
    }
    let name = typeof object.name === "string" ? object.name.trim() : "";
    const label = /^\[([^\]\r\n]+)\]\((https:\/\/[^)\s]+)\)$/.exec(name);
    if (label) {
      try {
        const host = new URL(label[2]!).hostname.toLowerCase();
        if (host === "office.com" || host.endsWith(".office.com")) name = label[1]!;
      } catch { /* Invalid links are rejected below. */ }
    }
    if (!name || name.length > 300 || /https?:\/\/|[\r\n]/i.test(name)) {
      name = object.upn;
      limitations.push("A profile was missing a usable display name.");
    }
    const jobTitle = typeof object.jobTitle === "string" ? object.jobTitle.trim() : "";
    if (!jobTitle || jobTitle.length > 500) limitations.push("A profile was missing a usable title.");
    const hasReports = typeof object.hasReports === "boolean" ? object.hasReports : null;
    if (hasReports === null && !profileOnly) limitations.push("A profile's direct-report status was unknown.");
    return { name, upn: object.upn.toLowerCase(), jobTitle: jobTitle.length <= 500 ? jobTitle : "", hasReports };
  };
  const person = profile(value.person);
  if (expectedUpn !== null && person.upn !== expectedUpn.toLowerCase()) {
    throw new OrgResponseError("Work IQ returned a different UPN from the exact requested profile.");
  }
  let manager: OrgProfile | null = null;
  if (!profileOnly && value.manager !== null) {
    if (value.manager === undefined) limitations.push("The immediate-manager relationship was missing.");
    else {
      try { manager = profile(value.manager); }
      catch (error) {
        if (!(error instanceof OrgResponseError)) throw error;
        limitations.push("The immediate manager had no valid exact UPN.");
      }
    }
  }
  const reports: OrgProfile[] = [];
  if (!profileOnly && !Array.isArray(value.reports)) limitations.push("The direct-report list was missing.");
  else if (!profileOnly && Array.isArray(value.reports)) {
    if (value.reports.length > 5000) limitations.push("The direct-report list exceeded the local profile limit.");
    for (const report of value.reports.slice(0, 5000)) {
      try { reports.push(profile(report)); }
      catch (error) {
        if (!(error instanceof OrgResponseError)) throw error;
        limitations.push("A report had no valid exact UPN and was skipped.");
      }
    }
  }
  if (Array.isArray(value.limitations)) {
    for (const item of value.limitations.slice(0, 20)) {
      // Service prose can contain unrelated private facts. Retain only a generic disclosure.
      if (typeof item === "string" && item.trim()) limitations.push("Work IQ disclosed incomplete or uncertain profile facts.");
    }
  }
  if (value.complete !== true) limitations.push("Work IQ did not confirm a complete response.");
  return { person, manager, reports, complete: value.complete === true && limitations.length === 0,
    limitations: [...new Set(limitations)].slice(0, 20) };
}

export async function openOrgWorkiqSession(config: WorkiqConfiguration, signal: AbortSignal): Promise<OrgWorkiqSession> {
  const launch = workiqCommand(config.executablePath, connectionEnvironment());
  const transport = new StdioClientTransport({
    ...launch, args: [...launch.args, ...(config.tenantId ? ["--tenant-id", config.tenantId] : []), "mcp"],
    cwd: dirname(process.execPath), stderr: "pipe", maxBufferSize: 2 * 1024 * 1024,
  });
  transport.stderr?.on("data", () => {});
  const client = new Client({ name: "mcaps-console-org-profiles", version: "1.0.0" }, { capabilities: {} });
  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => closing ??= (async () => {
    try { await client.close(); }
    finally { await transport.close(); }
  })();
  const abort = () => { void close().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await abortable(client.connect(transport), signal);
    const tools = await abortable(client.listTools(), signal);
    const tool = workiqTestCall(tools.tools, "unused").name;
    return {
      async query(upn, includeReports, requestSignal, options = {}) {
        const question = orgProfileQuestion(upn, includeReports, options.profileOnly) + (options.correctFormat
          ? " FORMAT CORRECTION: The previous response was not valid JSON. Return one syntactically valid JSON object only, without commentary, Markdown or citation markers. Keep unavailable facts null; do not guess."
          : "");
        const response = await abortable(client.callTool({
          name: tool, arguments: { question },
        }, undefined, { signal: requestSignal, timeout: 90_000 }), requestSignal);
        return readOrgWorkiqResult(response, upn, options.profileOnly);
      },
      async close() {
        signal.removeEventListener("abort", abort);
        await close();
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", abort);
    await close().catch(() => {});
    throw error;
  }
}
