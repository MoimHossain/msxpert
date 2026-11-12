import type {
  AccountPreview,
  AccountSearchResult,
  AccountTreeNode,
  AccountTerritory,
  GoneReason,
  NormalizedMilestone,
  ScopeSettings,
  SalesTerritory,
  SystemUserSearchResult,
  UserProfile,
} from "../shared/types";
import { z } from "zod";
import type { AuthService } from "./auth";
import { AuthRequiredError } from "./auth";
import { loadConnectionConfig } from "./connection-config";
import { microsoftFiscalYear } from "../domain/defaults";

const connection = loadConnectionConfig();
const CRM_ORIGIN = connection.resourceUrl.replace(/\/$/, "");
const API_ROOT = `${CRM_ORIGIN}/api/data/v9.2/`;
const APP_ID = connection.appId;
const GUID_CHUNK = 25;
const MAX_RETRIES = 4;
const TOP_PARENT_CODE = 861980000;
const userProfileSchema = z.object({
  systemuserid: z.guid(),
  fullname: z.string().nullish(),
  title: z.string().nullish(),
  internalemailaddress: z.string().nullish(),
  domainname: z.string().nullish(),
  entityimage: z.string().nullish(),
});

type RawRecord = Record<string, unknown>;

interface ODataResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

function formatted(record: RawRecord, field: string): string | null {
  const value = record[`${field}@OData.Community.Display.V1.FormattedValue`];
  return value == null || value === "" ? null : String(value);
}

function stringOrNull(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

function profilePhoto(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length > 6666668 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("MSX returned an invalid or oversized profile photo.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > 5000000 || bytes.toString("base64") !== value) {
    throw new Error("MSX returned an invalid or oversized profile photo.");
  }
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? "image/jpeg" :
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png" :
    ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")) ? "image/gif" :
    bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP" ? "image/webp" : null;
  if (!mime) throw new Error("MSX returned an unsupported profile photo.");
  return `data:${mime};base64,${value}`;
}

function parentingLevel(record: RawRecord): string | null {
  return record.msp_parentinglevelcode === TOP_PARENT_CODE ? "Top" : formatted(record, "msp_parentinglevelcode");
}

function uniqueTopParent(tree: AccountTreeNode[]): AccountTreeNode {
  const top = tree.filter((record) => record.parentingLevel?.toLowerCase() === "top");
  const first = top[0];
  if (top.length !== 1 || !first) throw new Error("MSX did not return exactly one accessible top parent for this TPID.");
  return first;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function escapeODataString(value: string): string {
  return value.replaceAll("'", "''");
}

function queryPath(entity: string, parameters: Record<string, string>): string {
  return `${entity}?${new URLSearchParams(parameters).toString()}`;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function recordUrl(entityName: string, id: string): string {
  const parameters = new URLSearchParams({
    forceUCI: "1",
    pagetype: "entityrecord",
    etn: entityName,
    id,
    appid: APP_ID,
  });
  return `${CRM_ORIGIN}/main.aspx?${parameters.toString()}`;
}

export function milestoneUrl(id: string): string {
  return recordUrl("msp_engagementmilestone", id);
}

export function opportunityUrl(id: string): string {
  return recordUrl("opportunity", id);
}

export function accountUrl(id: string): string {
  return recordUrl("account", id);
}

export function normalizeMilestone(record: RawRecord): NormalizedMilestone {
  const id = String(record.msp_engagementmilestoneid);
  const opportunityId = stringOrNull(record._msp_opportunityid_value);
  return {
    id,
    number: stringOrNull(record.msp_milestonenumber),
    name: stringOrNull(record.msp_name),
    date: record.msp_milestonedate
      ? String(record.msp_milestonedate).slice(0, 10)
      : null,
    status: formatted(record, "msp_milestonestatus"),
    statusValue: numberOrNull(record.msp_milestonestatus),
    statusReason: formatted(record, "msp_milestonestatusreason"),
    commitment: formatted(record, "msp_commitmentrecommendation"),
    category: formatted(record, "msp_milestonecategory"),
    workload:
      formatted(record, "msp_workload") ??
      formatted(record, "msp_milestoneworkload"),
    milestoneWorkload: formatted(record, "msp_milestoneworkload"),
    solutionArea:
      formatted(record, "msp_solutionarea") ??
      formatted(record, "msp_milestonesolutionarea"),
    helpNeeded: formatted(record, "msp_helpneeded"),
    azureRegion: formatted(record, "msp_milestonepreferredazureregion"),
    azureCapacityType: formatted(record, "msp_milestoneazurecapacitytype"),
    monthlyUse: numberOrNull(record.msp_monthlyuse),
    monthlyUseFormatted: formatted(record, "msp_monthlyuse"),
    nonRecurringMonths: numberOrNull(record.msp_nonrecurringmonths),
    forecastComments: stringOrNull(record.msp_forecastcomments),
    forecastCommentsModifiedOn:
      stringOrNull(record.msp_forecastcomments_lastmodifiedon_datetime) ??
      stringOrNull(record.msp_forecastcomments_lastmodifiedon),
    milestoneComments: stringOrNull(record.msp_milestonecomments),
    ownerId: stringOrNull(record._ownerid_value),
    ownerName: formatted(record, "_ownerid_value"),
    accountId: stringOrNull(record._msp_parentaccount_value),
    accountName: formatted(record, "_msp_parentaccount_value"),
    opportunityId,
    opportunityName: formatted(record, "_msp_opportunityid_value"),
    opportunityUrl: opportunityId ? opportunityUrl(opportunityId) : null,
    createdOn: stringOrNull(record.createdon),
    createdById: stringOrNull(record._createdby_value),
    createdByName: formatted(record, "_createdby_value"),
    modifiedOn: stringOrNull(record.modifiedon),
    modifiedByName: formatted(record, "_modifiedby_value"),
    versionNumber: stringOrNull(record.versionnumber),
    url: milestoneUrl(id),
  };
}

export function classifyGone(
  scope: ScopeSettings,
  current: NormalizedMilestone | null,
  accountIds: Set<string> | null,
): GoneReason {
  if (!current) {
    return {
      reason: "unavailable",
      summary: "No longer visible in MSX - removed or outside your access.",
      causes: ["unavailable"],
    };
  }

  const causes: Array<{ reason: GoneReason["reason"]; summary: string }> = [];
  if (
    current.statusValue != null &&
    scope.excludedStatusValues.includes(current.statusValue)
  ) {
    causes.push({
      reason: "status",
      summary: `Status is now ${current.status ?? "excluded"}, which this view filters out.`,
    });
  }
  if (!current.date) {
    causes.push({
      reason: "date",
      summary: "The milestone date was cleared, so it no longer matches the window.",
    });
  } else if (current.date < scope.dateFrom || current.date > scope.dateTo) {
    causes.push({
      reason: "date",
      summary: `Re-dated to ${current.date}, outside ${scope.label}.`,
    });
  }
  if (
    accountIds &&
    current.accountId &&
    !accountIds.has(current.accountId.toLowerCase())
  ) {
    causes.push({
      reason: "account",
      summary: `Moved to ${current.accountName ?? "another account"} outside this account tree.`,
    });
  }

  const primary = causes[0] ?? {
    reason: "unknown" as const,
    summary: "The record still matches the filter and may have been a transient fetch gap.",
  };
  return {
    reason: primary.reason,
    summary: primary.summary,
    causes: causes.map((cause) => cause.reason),
    current: {
      date: current.date,
      status: current.status,
      statusValue: current.statusValue,
      statusReason: current.statusReason,
      ownerName: current.ownerName,
      accountName: current.accountName,
      modifiedOn: current.modifiedOn,
    },
  };
}

export class MsxClient {
  constructor(private readonly auth: Pick<AuthService, "getAccessToken">) {}

  private async request<T>(pathOrUrl: string): Promise<T> {
    const url = pathOrUrl.startsWith("https://")
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl, API_ROOT);
    if (url.origin !== CRM_ORIGIN) throw new Error("MSX returned an unexpected API origin.");

    let renewed = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${await this.auth.getAccessToken()}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Prefer: 'odata.include-annotations="*"',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return (await response.json()) as T;
      if (response.status === 401) {
        if (renewed) throw new AuthRequiredError();
        await this.auth.getAccessToken(true);
        renewed = true;
        attempt--;
        continue;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const header = response.headers.get("retry-after");
        const seconds = Number(header);
        const wait = header && !Number.isNaN(seconds) ? Math.max(0, seconds * 1000) :
          header ? Math.max(0, Date.parse(header) - Date.now()) : 500 * 2 ** attempt;
        if (!Number.isFinite(wait) || wait > 60000) throw new Error("MSX is busy. Retry later.");
        await delay(wait);
        continue;
      }
      const requestId =
        response.headers.get("x-ms-service-request-id") ??
        response.headers.get("request-id");
      throw new Error(
        `MSX request failed with HTTP ${response.status}` +
          (requestId ? ` (request ${requestId})` : "") +
          ".",
      );
    }
    throw new Error("MSX request failed after retrying.");
  }

  private async collection<T extends RawRecord>(path: string, onPage?: (records: T[]) => void): Promise<T[]> {
    const records: T[] = [];
    const visited = new Set<string>();
    let next: string | null = path;
    while (next) {
      const url = new URL(next, API_ROOT).href;
      if (visited.has(url)) throw new Error("MSX returned a repeated pagination link. Retry the request.");
      visited.add(url);
      const page: ODataResponse<T> = await this.request<ODataResponse<T>>(next);
      if (!Array.isArray(page.value)) throw new Error("MSX returned an invalid collection.");
      records.push(...page.value);
      onPage?.(page.value);
      next = page["@odata.nextLink"] ?? null;
    }
    return records;
  }

  async listTerritories(now = new Date()): Promise<SalesTerritory[]> {
    const fiscalYear = microsoftFiscalYear(now).label;
    const records = await this.collection<RawRecord>(queryPath("territories", {
      "$select": "territoryid,name,msp_accountteamunitgroupname,msp_salesunitname,msp_salesgroupname",
      "$orderby": "name asc",
    }));
    const territories = new Map<string, SalesTerritory>();
    for (const record of records) {
      if (typeof record.territoryid !== "string" || typeof record.name !== "string") {
        throw new Error("MSX returned an invalid territory record.");
      }
      const year = record.name.match(/(?:^|[\s._-])FY(\d{4}|\d{2})(?=$|[\s._-])/i)?.[1];
      const label = year ? `FY${year.slice(-2)}` : null;
      if (label && label !== fiscalYear) continue;
      const territory: SalesTerritory = {
        id: record.territoryid.toLowerCase(), name: record.name,
        accountTeamUnitGroup: stringOrNull(record.msp_accountteamunitgroupname),
        salesUnit: stringOrNull(record.msp_salesunitname),
        salesGroup: stringOrNull(record.msp_salesgroupname), fiscalYear: label,
      };
      territories.set(territory.id, territory);
    }
    return [...territories.values()];
  }

  async getMyUserId(): Promise<string> {
    const result = await this.request<unknown>("WhoAmI");
    return z.object({ UserId: z.guid() }).parse(result).UserId;
  }

  async getMyProfile(): Promise<Omit<UserProfile, "updatedAt">> {
    const id = await this.getMyUserId();
    const fields = userProfileSchema.parse(await this.request<unknown>(queryPath(`systemusers(${id})`, {
      "$select": "systemuserid,fullname,title,internalemailaddress,domainname,entityimage",
    })));
    if (fields.systemuserid.toLowerCase() !== id.toLowerCase()) {
      throw new Error("MSX returned a profile for an unexpected user.");
    }
    return {
      id: fields.systemuserid,
      displayName: stringOrNull(fields.fullname),
      jobTitle: stringOrNull(fields.title),
      email: stringOrNull(fields.internalemailaddress) ?? stringOrNull(fields.domainname),
      department: null,
      officeLocation: null,
      photoDataUrl: profilePhoto(fields.entityimage),
    };
  }

  async accountsForTerritory(territoryId: string): Promise<AccountSearchResult[]> {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(territoryId)) {
      throw new Error("Invalid territory identifier.");
    }
    const records = await this.collection<RawRecord>(queryPath("accounts", {
      "$select": "accountid,name,msp_mstopparentid,msp_parentinglevelcode,address1_country",
      "$filter": `_territoryid_value eq ${territoryId}`,
      "$orderby": "name asc",
    }));
    return records.map((record) => ({
      id: String(record.accountid), name: String(record.name ?? "(unnamed account)"),
      tpid: stringOrNull(record.msp_mstopparentid), parentingLevel: parentingLevel(record),
      country: stringOrNull(record.address1_country),
    }));
  }

  async resolveTopParent(tpid: string): Promise<AccountTreeNode> {
    return uniqueTopParent(await this.resolveAccountTree(tpid));
  }

  async searchAccounts(term: string): Promise<AccountSearchResult[]> {
    const input = term.trim();
    const escaped = escapeODataString(input);
    if (escaped.length < 3) return [];
    if (/^\d+$/.test(input)) {
      const tree = await this.resolveAccountTree(input);
      if (tree.length === 0) return [];
      return [uniqueTopParent(tree)];
    }
    const query = queryPath("accounts", {
      "$select":
        "accountid,name,msp_mstopparentid,msp_parentinglevelcode,address1_country",
      "$filter":
        `statecode eq 0 and msp_mstopparentid ne null and ` +
        `contains(name,'${escaped}')`,
      "$top": "100",
      "$orderby": "name asc",
    });
    const records = await this.collection<RawRecord>(query);
    const results: AccountSearchResult[] = [];
    for (const tpid of new Set(records.map((record) => stringOrNull(record.msp_mstopparentid)).filter((id) => id !== null))) {
      results.push(await this.resolveTopParent(tpid));
    }
    return results.sort((left, right) => left.name.localeCompare(right.name));
  }

  private async accountById(id: string): Promise<AccountSearchResult> {
    const record = await this.request<RawRecord>(
      queryPath(`accounts(${id})`, {
        "$select":
          "accountid,name,msp_mstopparentid,msp_parentinglevelcode,address1_country",
      }),
    );
    return {
      id: String(record.accountid),
      name: String(record.name ?? "(unnamed account)"),
      tpid: stringOrNull(record.msp_mstopparentid),
      parentingLevel: parentingLevel(record),
      country: stringOrNull(record.address1_country),
    };
  }

  async resolveAccountTree(tpid: string): Promise<AccountTreeNode[]> {
    const escaped = escapeODataString(tpid);
    const records = await this.collection<RawRecord>(
      queryPath("accounts", {
        "$select":
          "accountid,name,msp_mstopparentid,msp_parentinglevelcode,address1_country,_territoryid_value",
        "$filter": `msp_mstopparentid eq '${escaped}'`,
        "$orderby": "name asc",
      }),
    );
    return Promise.all(records.map(async (record) => {
      const id = String(record.accountid);
      return {
        id,
        name: String(record.name ?? "(unnamed account)"),
        tpid: String(record.msp_mstopparentid ?? tpid),
        parentingLevel: parentingLevel(record),
        country: stringOrNull(record.address1_country),
        url: accountUrl(id),
        territory: await this.accountTerritory(record),
      };
    }));
  }

  private async accountTerritory(record: RawRecord): Promise<AccountTerritory | null> {
    if (record._territoryid_value == null) return null;
    const id = z.guid().parse(record._territoryid_value).toLowerCase();
    const name = formatted(record, "_territoryid_value");
    if (name) return { id, name };
    const territory = z.object({ territoryid: z.guid(), name: z.string().min(1) }).parse(
      await this.request<unknown>(queryPath(`territories(${id})`, { "$select": "territoryid,name" })),
    );
    if (territory.territoryid.toLowerCase() !== id) throw new Error("MSX returned an unexpected territory.");
    return { id, name: territory.name };
  }

  async getAccountTerritories(ids: string[]): Promise<Map<string, AccountTerritory | null>> {
    const requested = new Set(ids.map((id) => z.guid().parse(id).toLowerCase()));
    const territories = new Map<string, AccountTerritory | null>();
    for (const batch of chunks([...requested], GUID_CHUNK)) {
      const records = await this.collection<RawRecord>(queryPath("accounts", {
        "$select": "accountid,_territoryid_value",
        "$filter": batch.map((id) => `accountid eq ${id}`).join(" or "),
      }));
      for (const record of records) {
        const id = z.guid().parse(record.accountid).toLowerCase();
        if (!requested.has(id)) throw new Error("MSX returned territory details for an unexpected account.");
        territories.set(id, await this.accountTerritory(record));
      }
    }
    return territories;
  }

  async previewAccount(
    accountId: string,
    scope: ScopeSettings,
    trackedTpids: Set<string>,
  ): Promise<AccountPreview> {
    const selected = await this.accountById(accountId);
    if (!selected.tpid) {
      throw new Error(
        "This MSX account is not linked to a TPID. Select a search result that shows a TPID.",
      );
    }
    const tree = await this.resolveAccountTree(selected.tpid);
    if (!tree.length) throw new Error("MSX returned no account tree for the selected TPID.");
    const top = uniqueTopParent(tree);
    const milestones = await this.fetchMilestones(
      scope,
      tree.map((record) => record.id),
    );
    return {
      selected,
      topParent: {
        id: top.id,
        name: top.name,
        tpid: top.tpid,
        parentingLevel: top.parentingLevel,
        country: top.country,
      },
      tree,
      alreadyTracked: trackedTpids.has(selected.tpid),
      milestoneCount: milestones.length,
    };
  }

  async fetchMilestones(
    scope: ScopeSettings,
    accountIds: string[],
    onProgress?: (progress: { milestones: number; pages: number }) => void,
  ): Promise<NormalizedMilestone[]> {
    const seen = new Map<string, RawRecord>();
    let pages = 0;
    for (const group of chunks(accountIds, GUID_CHUNK)) {
      const accounts = group
        .map((id) => `_msp_parentaccount_value eq ${id}`)
        .join(" or ");
      const clauses = [
        `(${accounts})`,
        ...scope.excludedStatusValues.map(
          (value) => `msp_milestonestatus ne ${value}`,
        ),
        `msp_milestonedate ge ${scope.dateFrom}`,
        `msp_milestonedate le ${scope.dateTo}`,
      ];
      await this.collection<RawRecord>(
        queryPath("msp_engagementmilestones", {
          "$filter": clauses.join(" and "),
          "$orderby": "msp_milestonedate asc",
        }),
        records => {
          for (const record of records) seen.set(String(record.msp_engagementmilestoneid), record);
          onProgress?.({ milestones: seen.size, pages: ++pages });
        },
      );
    }
    return [...seen.values()]
      .map(normalizeMilestone)
      .sort(
        (left, right) =>
          (left.date ?? "").localeCompare(right.date ?? "") ||
          (left.name ?? "").localeCompare(right.name ?? ""),
      );
  }

  async explainDisappearances(
    scope: ScopeSettings,
    ids: string[],
    accountIds: string[],
  ): Promise<Map<string, GoneReason>> {
    const raw = new Map<string, RawRecord>();
    for (const group of chunks(ids, GUID_CHUNK)) {
      const filter = group
        .map((id) => `msp_engagementmilestoneid eq ${id}`)
        .join(" or ");
      try {
        const records = await this.collection<RawRecord>(
          queryPath("msp_engagementmilestones", { "$filter": filter }),
        );
        for (const record of records) {
          raw.set(String(record.msp_engagementmilestoneid), record);
        }
      } catch {
        // Each missing record is classified as unavailable below.
      }
    }
    const inTree = new Set(accountIds.map((id) => id.toLowerCase()));
    return new Map(
      ids.map((id) => [
        id,
        classifyGone(scope, raw.has(id) ? normalizeMilestone(raw.get(id)!) : null, inTree),
      ]),
    );
  }

  async searchUsers(term: string): Promise<SystemUserSearchResult[]> {
    const escaped = escapeODataString(term.trim());
    if (escaped.length < 2) return [];
    const records = await this.collection<RawRecord>(
      queryPath("systemusers", {
        "$select":
          "systemuserid,fullname,internalemailaddress,domainname,title,isdisabled",
        "$filter":
          `contains(fullname,'${escaped}') or ` +
          `contains(internalemailaddress,'${escaped}')`,
        "$top": "30",
        "$orderby": "fullname asc",
      }),
    );
    return records.map((record) => ({
      id: String(record.systemuserid),
      name: String(record.fullname ?? record.domainname ?? "(unnamed user)"),
      email:
        stringOrNull(record.internalemailaddress) ?? stringOrNull(record.domainname),
      title: stringOrNull(record.title),
      disabled: Boolean(record.isdisabled),
    }));
  }
}

export const MSX_ORIGIN = CRM_ORIGIN;
