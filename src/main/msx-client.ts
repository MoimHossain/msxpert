import type {
  AccountPreview,
  AccountSearchResult,
  AccountTreeNode,
  GoneReason,
  NormalizedMilestone,
  ScopeSettings,
  SystemUserSearchResult,
} from "../shared/types";
import type { AuthService } from "./auth";
import { AuthRequiredError } from "./auth";
import { loadConnectionConfig } from "./connection-config";

const connection = loadConnectionConfig();
const CRM_ORIGIN = connection.resourceUrl.replace(/\/$/, "");
const API_ROOT = `${CRM_ORIGIN}/api/data/v9.2/`;
const APP_ID = connection.appId;
const GUID_CHUNK = 25;
const MAX_RETRIES = 4;

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
        const retryAfter = Number(response.headers.get("retry-after"));
        await delay(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 500 * 2 ** attempt,
        );
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

  private async collection<T extends RawRecord>(path: string): Promise<T[]> {
    const records: T[] = [];
    let next: string | null = path;
    while (next) {
      const page: ODataResponse<T> = await this.request<ODataResponse<T>>(next);
      records.push(...page.value);
      next = page["@odata.nextLink"] ?? null;
    }
    return records;
  }

  async getMyUserId(): Promise<string> {
    const result = await this.request<{ UserId: string }>("WhoAmI");
    return result.UserId;
  }

  async searchAccounts(term: string): Promise<AccountSearchResult[]> {
    const input = term.trim();
    const escaped = escapeODataString(input);
    if (escaped.length < 3) return [];
    if (/^\d+$/.test(input)) {
      const tree = await this.resolveAccountTree(input);
      const top = tree.find(
        (record) => record.parentingLevel?.toLowerCase() === "top",
      );
      if (!top) return [];
      return [
        {
          id: top.id,
          name: top.name,
          tpid: top.tpid,
          parentingLevel: top.parentingLevel,
          country: top.country,
        },
      ];
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
    return records.map((record) => ({
      id: String(record.accountid),
      name: String(record.name ?? "(unnamed account)"),
      tpid: stringOrNull(record.msp_mstopparentid),
      parentingLevel: formatted(record, "msp_parentinglevelcode"),
      country: stringOrNull(record.address1_country),
    }));
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
      parentingLevel: formatted(record, "msp_parentinglevelcode"),
      country: stringOrNull(record.address1_country),
    };
  }

  async resolveAccountTree(tpid: string): Promise<AccountTreeNode[]> {
    const escaped = escapeODataString(tpid);
    const records = await this.collection<RawRecord>(
      queryPath("accounts", {
        "$select":
          "accountid,name,msp_mstopparentid,msp_parentinglevelcode,address1_country",
        "$filter": `msp_mstopparentid eq '${escaped}'`,
        "$orderby": "name asc",
      }),
    );
    return records.map((record) => {
      const id = String(record.accountid);
      return {
        id,
        name: String(record.name ?? "(unnamed account)"),
        tpid: String(record.msp_mstopparentid ?? tpid),
        parentingLevel: formatted(record, "msp_parentinglevelcode"),
        country: stringOrNull(record.address1_country),
        url: accountUrl(id),
      };
    });
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
    const top =
      tree.find((record) => record.parentingLevel?.toLowerCase() === "top") ??
      tree.find((record) => record.id.toLowerCase() === selected.id.toLowerCase());
    if (!top) {
      throw new Error("The top-parent account could not be identified safely.");
    }
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
  ): Promise<NormalizedMilestone[]> {
    const seen = new Map<string, RawRecord>();
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
      const records = await this.collection<RawRecord>(
        queryPath("msp_engagementmilestones", {
          "$filter": clauses.join(" and "),
          "$orderby": "msp_milestonedate asc",
        }),
      );
      for (const record of records) {
        seen.set(String(record.msp_engagementmilestoneid), record);
      }
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
