import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import type { AcrRow } from "../domain/acr";

export const POWER_BI_QUERY_URL =
  "https://df-msit-scus-redirect.analysis.windows.net/explore/querydata?synchronous=true";
export const ACCESS_MODEL_ID = 6349452;
export const ACR_MODEL_ID = 6692492;
const WINDOW_SIZE = 30000;
const MAX_PAGES = 50;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export interface DsrColumn {
  output: string;
  source: string;
  property: string;
  name: string;
  measure?: boolean;
}

export const ACCESS_COLUMNS: readonly DsrColumn[] = [
  { output: "tpid", source: "a", property: "TPID", name: "DimAccountRLSActuals.TPID" },
  { output: "name", source: "c", property: "TPAccountName", name: "DimCustomer.TPAccountName" },
];
export const ACR_COLUMNS: readonly DsrColumn[] = [
  { output: "account", source: "d1", property: "TPAccountName", name: "DimCustomer.TPAccountName" },
  { output: "month", source: "d", property: "FiscalMonth", name: "DimDate.FiscalMonth" },
  { output: "acr", source: "m", property: "$ ACR", name: "M_ACR.$ ACR", measure: true },
  ...Array.from({ length: 5 }, (_, index) => ({
    output: `l${index + 1}`, source: "f", property: `ServiceLevel${index + 1}`, name: `F_ACR.ServiceLevel${index + 1}`,
  })),
];

function column(source: string, property: string) {
  return { Column: { Expression: { SourceRef: { Source: source } }, Property: property } };
}
function selections(columns: readonly DsrColumn[]) {
  return columns.map(definition => ({
    ...(definition.measure
      ? { Measure: { Expression: { SourceRef: { Source: definition.source } }, Property: definition.property } }
      : column(definition.source, definition.property)),
    Name: definition.name, NativeReferenceName: definition.output,
  }));
}
function filter(source: string, property: string, values: string[], raw = false, not = false) {
  const expression = { In: { Expressions: [column(source, property)],
    Values: values.map(value => [{ Literal: { Value: raw ? value : `'${value.replace(/'/g, "''")}'` } }]) } };
  return { Condition: not ? { Not: { Expression: expression } } : expression };
}
function sources(entries: [string, string][]) {
  return entries.map(([Name, Entity]) => ({ Name, Entity, Type: 0 }));
}
export interface SemanticQuery {
  Version: number;
  From: { Name: string; Entity: string; Type: number }[];
  Select: unknown[];
  Where: unknown[];
}
export function buildAccessQuery(alias: string): SemanticQuery {
  const normalized = alias.trim().toUpperCase();
  if (!normalized || normalized.length > 200) throw new Error("Power BI requires a valid employee alias.");
  return { Version: 2, From: sources([["a", "DimAccountRLSActuals"], ["c", "DimCustomer"], ["p", "DimPersonnelNumber"]]),
    Select: selections(ACCESS_COLUMNS), Where: [filter("p", "UserAlias", [normalized])] };
}
export function buildServiceQuery(tpid: string, fiscalYear: string, months: { key: string }[]): SemanticQuery {
  if (!/^\d+$/.test(tpid)) throw new Error("Power BI requires a numeric TPID.");
  if (!/^FY\d{2}$/.test(fiscalYear)) throw new Error("Power BI requires a valid fiscal year.");
  if (!months.length || months.length > 12 || months.some(month =>
    !new RegExp(`^${fiscalYear}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$`).test(month.key))) {
    throw new Error("Power BI requires explicit months within the requested fiscal year.");
  }
  return {
    Version: 2,
    From: sources([["d1", "DimCustomer"], ["d", "DimDate"], ["m", "M_ACR"], ["f", "F_ACR"],
      ["a", "ACR_Measures"], ["a1", "AccountSubscriptionParameter"], ["d2", "DimViewType"], ["a2", "ACRFields"]]),
    Select: selections(ACR_COLUMNS),
    Where: [
      filter("d", "IsAzureClosedandCurrentOpen", ["Y", "N"]),
      filter("d1", "TPIDTxt", [tpid]),
      filter("d", "FiscalYear", [fiscalYear]),
      filter("a", "ACR_Measures Fields", ["'''M_ACR''[$ ACR]'"], true),
      filter("a1", "AccountSubscriptionParameter Fields", ["'''F_ACR''[SubscriptionName]'"], true),
      filter("a2", "ACRFields Fields",
        Array.from({ length: 5 }, (_, index) => `'''F_ACR''[ServiceLevel${index + 1}]'`), true),
      filter("d2", "ViewType", ["Curated"]),
      filter("f", "DIM_SubSegmentHierarchy_SubSegmentId",
        ["0L", "200L", "222L", "250L", "295L", "346L", "352L", "365L", "400L", "404L", "405L"], true, true),
      filter("f", "ServiceCompGrouping", ["XCR - W365"], false, true),
      filter("d", "FiscalMonth", months.map(month => month.key)),
    ],
  };
}
export function buildPowerBiRequest(modelId: number, query: SemanticQuery, columns: number, restartTokens?: unknown) {
  return {
    version: "1.0.0",
    queries: [{ Query: { Commands: [{ SemanticQueryDataShapeCommand: {
      Query: query,
      Binding: { Primary: { Groupings: [{ Projections: Array.from({ length: columns }, (_, index) => index), Subtotal: 0 }] },
        DataReduction: { Primary: { Window: { Count: WINDOW_SIZE,
          ...(restartTokens === undefined ? {} : { RestartTokens: restartTokens }) } } }, Version: 1 },
    } }] }, QueryId: "" }],
    cancelQueries: [], modelId, userPreferredLocale: "en-US",
  };
}

const scalar = z.union([z.string(), z.number().finite(), z.null()]);
const mask = z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d+$/)]);
const dataSetSchema = z.object({
  IC: z.boolean().optional(),
  RT: z.unknown().optional(),
  ValueDicts: z.record(z.string(), z.array(scalar)).optional(),
  PH: z.array(z.object({ DM0: z.array(z.object({
    S: z.array(z.object({ N: z.string(), DN: z.string().optional() })).optional(),
    C: z.array(scalar).optional(), R: mask.optional(), "Ø": mask.optional(),
  }).catchall(z.unknown())).optional() })).optional(),
});
type DataSet = z.infer<typeof dataSetSchema>;
export type DsrRow = Record<string, string | number | null>;

export function decodeDsrPage(input: unknown, columns: readonly DsrColumn[]): DsrRow[] {
  const parsed = dataSetSchema.safeParse(input);
  if (!parsed.success) throw new Error("Power BI returned an invalid DSR dataset.");
  return decodeRows(parsed.data, columns);
}
function decodeRows(dataSet: DataSet, columns: readonly DsrColumn[]): DsrRow[] {
  if ((dataSet.PH?.length ?? 0) > 1) throw new Error("Power BI returned unsupported DSR partitions.");
  const encoded = dataSet.PH?.[0]?.DM0 ?? [];
  if (!encoded.length) return [];
  const schema = encoded[0]?.S;
  if (!schema || schema.length !== columns.length) throw new Error("Power BI returned an unexpected DSR column count.");
  const dimensions = columns.filter(definition => !definition.measure);
  const measures = columns.filter(definition => definition.measure);
  const names = new Set<string>();
  const definitions = schema.map(entry => {
    const match = /^([GM])(\d+)$/.exec(entry.N);
    const definition = match && (match[1] === "G" ? dimensions : measures)[Number(match[2])];
    if (!definition || names.has(entry.N)) throw new Error("Power BI returned an unknown or duplicate DSR column.");
    names.add(entry.N);
    return definition;
  });
  let previous: (string | number | null)[] = [];
  const allowedMask = (1n << BigInt(schema.length)) - 1n;
  return encoded.map((row, rowIndex) => {
    if (rowIndex && row.S && JSON.stringify(row.S) !== JSON.stringify(schema)) {
      throw new Error("Power BI changed the DSR schema inside a page.");
    }
    const repeated = BigInt(row.R ?? 0);
    const empty = BigInt(row["Ø"] ?? 0);
    if ((repeated | empty) > allowedMask || (repeated & empty) !== 0n || (!rowIndex && repeated !== 0n)) {
      throw new Error("Power BI returned invalid DSR repeat/null masks.");
    }
    const values = row.C ?? [];
    let position = 0;
    const current = schema.map((entry, index): string | number | null => {
      const bit = 1n << BigInt(index);
      if ((empty & bit) !== 0n) return null;
      if ((repeated & bit) !== 0n) {
        const prior = previous[index];
        if (prior === undefined) throw new Error("Power BI repeated a missing DSR value.");
        return prior;
      }
      let value: unknown;
      if (position < values.length) value = values[position++];
      else if (Object.hasOwn(row, entry.N)) value = row[entry.N];
      else throw new Error("Power BI returned a truncated DSR row.");
      if (entry.DN && typeof value === "number") {
        const dictionary = dataSet.ValueDicts?.[entry.DN];
        if (!dictionary || !Number.isInteger(value) || value < 0 || value >= dictionary.length) {
          throw new Error("Power BI returned an invalid DSR dictionary index.");
        }
        value = dictionary[value];
      }
      const cell = scalar.safeParse(value);
      if (!cell.success) throw new Error("Power BI returned an invalid DSR value.");
      if (cell.data === null) return null;
      if (definitions[index]!.measure) {
        const number = typeof cell.data === "number" ? cell.data : Number(cell.data.trim().replace(/[LlDdMm]$/, ""));
        if (!Number.isFinite(number) || (typeof cell.data === "string" && !cell.data.trim())) {
          throw new Error("Power BI returned a non-numeric ACR measure.");
        }
        return number;
      }
      return typeof cell.data === "string" ? cell.data.trim() : cell.data;
    });
    if (position !== values.length) throw new Error("Power BI returned extra DSR row values.");
    previous = current;
    return Object.fromEntries(current.map((value, index) => [definitions[index]!.output, value]));
  });
}

const payloadSchema = z.object({
  results: z.array(z.object({ result: z.object({
    error: z.unknown().optional(),
    data: z.object({
      descriptor: z.object({ Select: z.array(z.unknown()) }),
      dsr: z.object({
        DS: z.array(dataSetSchema),
        DataShapes: z.array(z.object({ "odata.error": z.unknown().optional() }).passthrough()).optional(),
      }),
    }).optional(),
  }) })),
});
function parsePage(payload: unknown, columns: readonly DsrColumn[]) {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.results.length !== 1) throw new Error("Power BI returned an incomplete query response.");
  const result = parsed.data.results[0]!.result;
  if (result.error || result.data?.dsr.DataShapes?.some(shape => shape["odata.error"])) {
    throw new Error("Power BI rejected the semantic query. Check model permissions and interface compatibility.");
  }
  const data = result.data;
  if (!data || data.descriptor.Select.length !== columns.length || data.dsr.DS.length !== 1) {
    throw new Error("Power BI returned an unexpected semantic query shape.");
  }
  const dataSet = data.dsr.DS[0]!;
  return { dataSet, rows: decodeRows(dataSet, columns) };
}

export class PowerBiHttpError extends Error {
  constructor(readonly status: number, readonly retryAfter: number) {
    super(`Power BI query returned HTTP ${status}.${status === 401 || status === 403
      ? " Reconnect Power BI and verify your own model permissions." : ""}`);
  }
}
async function responseJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Power BI returned an empty HTTP response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new Error("Power BI exceeded the response safety limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new Error("Power BI returned invalid JSON.");
  }
}

export class PowerBiQueryClient {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 180000,
    private readonly wait = (ms: number, signal: AbortSignal) => delay(ms, undefined, { signal }),
  ) {}

  async post(token: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
      let retryAfter = Math.min(1000 * 2 ** attempt, 15000);
      try {
        const response = await this.request(POWER_BI_QUERY_URL, {
          method: "POST", redirect: "error", signal: bounded,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json;charset=UTF-8",
            Accept: "application/json, text/plain, */*", Origin: "https://msit.powerbi.com",
            Referer: "https://msit.powerbi.com/", "X-Powerbi-Hostenv": "Embed for Organization" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const header = response.headers.get("retry-after");
          const seconds = header ? Number(header) : NaN;
          const retry = header && !Number.isFinite(seconds) ? Date.parse(header) - Date.now() : seconds * 1000;
          await response.body?.cancel();
          throw new PowerBiHttpError(response.status, Number.isFinite(retry) ? Math.min(15000, Math.max(0, retry)) : retryAfter);
        }
        return await responseJson(response);
      } catch (error) {
        signal.throwIfAborted();
        const retryable = error instanceof PowerBiHttpError
          ? error.status === 429 || error.status >= 500 : bounded.aborted || error instanceof TypeError;
        if (error instanceof PowerBiHttpError) retryAfter = error.retryAfter;
        if (!retryable) throw error;
        if (attempt === 2) {
          if (error instanceof PowerBiHttpError) throw error;
          throw new Error(bounded.aborted ? "Power BI query timed out after three bounded attempts."
            : "Power BI could not be reached after three attempts.");
        }
      }
      await this.wait(retryAfter, signal);
    }
    throw new Error("Power BI query exhausted its retry budget.");
  }

  async execute(
    token: string, modelId: number, query: SemanticQuery, columns: readonly DsrColumn[], signal: AbortSignal,
    onPage: (progress: { pages: number; rows: number }) => void = () => undefined,
  ): Promise<DsrRow[]> {
    const all: DsrRow[] = [];
    const tokens = new Set<string>();
    const pages = new Set<string>();
    let restart: unknown = undefined;
    for (let index = 0; index < MAX_PAGES; index++) {
      signal.throwIfAborted();
      const payload = await this.post(token, buildPowerBiRequest(modelId, query, columns.length, restart), signal);
      const { dataSet, rows } = parsePage(payload, columns);
      if (rows.length > WINDOW_SIZE) throw new Error("Power BI exceeded the requested row window.");
      const pageKey = JSON.stringify(rows);
      if (pages.has(pageKey)) throw new Error("Power BI pagination repeated a previous page.");
      pages.add(pageKey);
      if (restart !== undefined && all.length && rows.length &&
          JSON.stringify(all.at(-1)) === JSON.stringify(rows[0])) rows.shift();
      if (restart !== undefined && !rows.length) throw new Error("Power BI continuation returned no new rows.");
      all.push(...rows);
      onPage({ pages: index + 1, rows: all.length });
      if (dataSet.IC === true) return all;
      if (dataSet.RT === null || dataSet.RT === undefined) {
        throw new Error("Power BI result was incomplete without a restart token.");
      }
      const serialized = JSON.stringify(dataSet.RT);
      if (!serialized || serialized === "[]" || serialized === '""' || tokens.has(serialized)) {
        throw new Error("Power BI pagination did not advance.");
      }
      tokens.add(serialized);
      restart = dataSet.RT;
    }
    throw new Error("Power BI exceeded the pagination safety limit.");
  }
}

export function acrRows(rows: DsrRow[]): AcrRow[] {
  return rows.map(row => {
    if (typeof row.month !== "string" || (row.acr !== null && typeof row.acr !== "number")) {
      throw new Error("Power BI returned invalid ACR month/measure values.");
    }
    return { month: row.month, acr: row.acr ?? 0, services: Array.from({ length: 5 }, (_, index) =>
      String(row[`l${index + 1}`] ?? "")) };
  });
}
