import { expect, it, vi } from "vitest";
import { ACCESS_COLUMNS, ACR_COLUMNS, buildAccessQuery, buildServiceQuery, decodeDsrPage,
  PowerBiQueryClient, POWER_BI_QUERY_URL, type DsrColumn } from "./powerbi-query";

const signal = () => new AbortController().signal;
export function dsrPayload(columns: readonly DsrColumn[], rows: (string | number | null)[][],
  completion: { IC?: boolean; RT?: unknown } = { IC: true }) {
  let dimensions = 0;
  let measures = 0;
  const schema = columns.map(column => ({ N: column.measure ? `M${measures++}` : `G${dimensions++}` }));
  return { results: [{ result: { data: { descriptor: { Select: columns.map(() => ({})) },
    dsr: { DS: [{ ...completion, PH: [{ DM0: rows.map((C, index) => ({ ...(index ? {} : { S: schema }), C })) }] }] } } } }] };
}
const immediate = async () => undefined;

it("preserves every Curated/date/service/subsegment/field-parameter reference filter", () => {
  expect(buildAccessQuery(" demo ").Where).toEqual([{
    Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: "p" } }, Property: "UserAlias" } }],
      Values: [[{ Literal: { Value: "'DEMO'" } }]] } },
  }]);
  const query = buildServiceQuery("111", "FY27", [{ key: "FY27-Sep" }]);
  expect(query.Select).toHaveLength(8);
  expect(query.From.map(source => source.Entity)).toEqual([
    "DimCustomer", "DimDate", "M_ACR", "F_ACR", "ACR_Measures", "AccountSubscriptionParameter", "DimViewType", "ACRFields",
  ]);
  expect(query.Where).toHaveLength(10);
  const text = JSON.stringify(query);
  for (const value of ["IsAzureClosedandCurrentOpen", "'Y'", "'N'", "TPIDTxt", "'111'", "'FY27'", "'FY27-Sep'",
    "'''M_ACR''[$ ACR]'", "'''F_ACR''[SubscriptionName]'", "'Curated'", "DIM_SubSegmentHierarchy_SubSegmentId",
    "0L", "200L", "222L", "250L", "295L", "346L", "352L", "365L", "400L", "404L", "405L", "'XCR - W365'"]) {
    expect(text).toContain(value);
  }
  for (let level = 1; level <= 5; level++) expect(text).toContain(`'''F_ACR''[ServiceLevel${level}]'`);
  expect(text.match(/"Not":/g)).toHaveLength(2);
  expect(() => buildServiceQuery("1' OR 1=1", "FY27", [{ key: "FY27-Sep" }])).toThrow(/TPID/);
  expect(() => buildServiceQuery("111", "FY27", [])).toThrow(/months/);
  expect(() => buildServiceQuery("111", "FY27", [{ key: "FY26-Sep" }])).toThrow(/months/);
});

const threeColumns: DsrColumn[] = [
  { output: "service", source: "f", property: "Service", name: "Service" },
  { output: "month", source: "d", property: "Month", name: "Month" },
  { output: "acr", source: "m", property: "ACR", name: "ACR", measure: true },
];
it("decodes dictionaries, repeats, null masks, inline measures and reordered dimension/measure schemas", () => {
  const rows = decodeDsrPage({ ValueDicts: { D0: ["Azure", "Security"], D1: ["FY27-Sep", "FY27-Oct"] },
    PH: [{ DM0: [
      { S: [{ N: "G0", DN: "D0" }, { N: "G1", DN: "D1" }, { N: "M0" }], C: [0, 0, "100D"] },
      { R: 1, C: [1, 125] }, { "Ø": 4, C: [1, 0] }, { R: 1, C: [1], M0: -75.5 },
    ] }] }, threeColumns);
  expect(rows).toEqual([
    { service: "Azure", month: "FY27-Sep", acr: 100 }, { service: "Azure", month: "FY27-Oct", acr: 125 },
    { service: "Security", month: "FY27-Sep", acr: null }, { service: "Security", month: "FY27-Oct", acr: -75.5 },
  ]);
  expect(decodeDsrPage({ PH: [{ DM0: [{ S: [{ N: "M0" }, { N: "G1" }, { N: "G0" }], C: [5, "Sep", "Azure"] }] }] },
    threeColumns)).toEqual([{ acr: 5, month: "Sep", service: "Azure" }]);
});

it.each([
  { S: [{ N: "G0" }], C: ["Azure"] },
  { S: [{ N: "G0" }, { N: "G0" }, { N: "M0" }], C: ["Azure", "Sep", 1] },
  { S: [{ N: "G0", DN: "missing" }, { N: "G1" }, { N: "M0" }], C: [9, "Sep", 1] },
  { S: [{ N: "G0" }, { N: "G1" }, { N: "M0" }], C: ["Azure", "Sep"] },
  { S: [{ N: "G0" }, { N: "G1" }, { N: "M0" }], C: ["Azure", "Sep", 1, 2] },
  { S: [{ N: "G0" }, { N: "G1" }, { N: "M0" }], R: 1, C: ["Sep", 1] },
  { S: [{ N: "G0" }, { N: "G1" }, { N: "M0" }], "Ø": 8, C: ["Azure", "Sep", 1] },
  { S: [{ N: "G0" }, { N: "G1" }, { N: "M0" }], C: ["Azure", "Sep", " "] },
])("rejects malformed or incomplete DSR rows without returning a partial decoded result", row => {
  expect(() => decodeDsrPage({ PH: [{ DM0: [row] }] }, threeColumns)).toThrow(/Power BI/);
});

it("follows restart tokens, removes the repeated boundary row and reports actual page counts", async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(dsrPayload(ACCESS_COLUMNS, [["111", "A"]], { IC: false, RT: ["next"] })))
    .mockResolvedValueOnce(Response.json(dsrPayload(ACCESS_COLUMNS, [["111", "A"], ["222", "B"]])));
  const page = vi.fn();
  const rows = await new PowerBiQueryClient(request).execute("synthetic-token", 6349452,
    buildAccessQuery("demo"), ACCESS_COLUMNS, signal(), page);
  expect(rows).toEqual([{ tpid: "111", name: "A" }, { tpid: "222", name: "B" }]);
  expect(page.mock.calls).toEqual([[{ pages: 1, rows: 1 }], [{ pages: 2, rows: 2 }]]);
  const options = request.mock.calls[1]?.[1];
  expect(JSON.stringify(JSON.parse(String(options?.body)))).toContain('"RestartTokens":["next"]');
  expect(options?.headers).toMatchObject({ Authorization: "Bearer synthetic-token" });
  expect(request.mock.calls[0]?.[0]).toBe(POWER_BI_QUERY_URL);
});

it.each(["missing-completion", "repeated-page", "repeated-token", "empty-continuation", "cyclic-token"])(
  "rejects %s instead of accepting an incomplete snapshot", async kind => {
    const request = vi.fn<typeof fetch>();
    const first = dsrPayload(ACCESS_COLUMNS, [["111", "A"]], kind === "missing-completion" ? {} : { IC: false, RT: ["a"] });
    request.mockResolvedValueOnce(Response.json(first));
    if (kind === "repeated-page") request.mockResolvedValueOnce(Response.json(dsrPayload(ACCESS_COLUMNS, [["111", "A"]])));
    if (kind === "repeated-token") request.mockResolvedValueOnce(Response.json(dsrPayload(ACCESS_COLUMNS, [["222", "B"]], { IC: false, RT: ["a"] })));
    if (kind === "empty-continuation") request.mockResolvedValueOnce(Response.json(dsrPayload(ACCESS_COLUMNS, [])));
    if (kind === "cyclic-token") {
      request.mockResolvedValueOnce(Response.json(dsrPayload(ACCESS_COLUMNS, [["222", "B"]], { IC: false, RT: ["b"] })));
      request.mockResolvedValueOnce(Response.json(dsrPayload(ACCESS_COLUMNS, [["333", "C"]], { IC: false, RT: ["a"] })));
    }
    await expect(new PowerBiQueryClient(request).execute("synthetic-token", 6349452,
      buildAccessQuery("demo"), ACCESS_COLUMNS, signal())).rejects.toThrow(/incomplete|advance|previous page|no new rows/);
  });

it("retries 429/5xx only within budget, honors Retry-After, and never retries access denial", async () => {
  const wait = vi.fn(immediate);
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "99" } }))
    .mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  expect(await new PowerBiQueryClient(request, 180000, wait).post("synthetic-token", {}, signal())).toEqual({ ok: true });
  expect(wait.mock.calls[0]?.[0]).toBe(15000);
  const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("private response", { status: 403 }));
  await expect(new PowerBiQueryClient(denied, 180000, wait).post("synthetic-token", {}, signal())).rejects.toThrow(/HTTP 403/);
  expect(denied).toHaveBeenCalledTimes(1);
});

it("bounds timed-out requests and cancels backoff immediately", async () => {
  const timeoutRequest = vi.fn<typeof fetch>(async (_url, options) => new Promise((_resolve, reject) => {
    const current = options!.signal!;
    if (current.aborted) reject(current.reason);
    else current.addEventListener("abort", () => reject(current.reason), { once: true });
  }));
  await expect(new PowerBiQueryClient(timeoutRequest, 10, immediate).post("synthetic-token", {}, signal())).rejects.toThrow(/timed out/);
  expect(timeoutRequest).toHaveBeenCalledTimes(3);
  const controller = new AbortController();
  const wait = vi.fn(async (_ms: number, current: AbortSignal) => {
    controller.abort(new Error("Synthetic cancellation"));
    current.throwIfAborted();
  });
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 503 }));
  await expect(new PowerBiQueryClient(request, 180000, wait).post("synthetic-token", {}, controller.signal))
    .rejects.toThrow("Synthetic cancellation");
  expect(request).toHaveBeenCalledTimes(1);
});

it("does not expose malformed JSON or remote semantic-query error payloads", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("private-customer-text", { status: 200 }));
  await expect(new PowerBiQueryClient(request).post("synthetic-token", {}, signal())).rejects.toThrow("Power BI returned invalid JSON.");
  request.mockResolvedValue(Response.json({ results: [{ result: { error: { message: "private-customer-text" } } }] }));
  await expect(new PowerBiQueryClient(request).execute("synthetic-token", 6692492,
    buildServiceQuery("111", "FY27", [{ key: "FY27-Sep" }]), ACR_COLUMNS, signal()))
    .rejects.toThrow("Power BI rejected the semantic query.");
});
