import { expect, it, vi } from "vitest";
import { AcrService } from "./acr-service";
import { powerBiScopeId } from "./powerbi-auth";
import { ACCESS_COLUMNS, ACR_COLUMNS, PowerBiQueryClient, type DsrColumn } from "./powerbi-query";
import type { AcrAccount, AcrProgress, AcrSnapshot } from "../shared/acr";

vi.mock("electron", () => ({ safeStorage: {}, shell: {} }));
const employeeA = { key: "employee-a", upn: "demo@example.invalid", name: "Synthetic employee A" };
const employeeB = { key: "employee-b", upn: "other@example.invalid", name: "Synthetic employee B" };
const accounts: AcrAccount[] = [
  { id: "parent-a", tpid: "111", name: "Synthetic A" },
  { id: "parent-b", tpid: "222", name: "Synthetic B" },
  { id: "parent-c", tpid: "333", name: "Synthetic inaccessible" },
];
function payload(columns: readonly DsrColumn[], rows: (string | number | null)[][]) {
  let group = 0;
  let measure = 0;
  const schema = columns.map(column => ({ N: column.measure ? `M${measure++}` : `G${group++}` }));
  return Response.json({ results: [{ result: { data: {
    descriptor: { Select: columns.map(() => ({})) },
    dsr: { DS: [{ IC: true, PH: [{ DM0: rows.map((C, index) => ({ ...(index ? {} : { S: schema }), C })) }] }] },
  } } }] });
}
function fixture() {
  const data = new Map<string, unknown>();
  const store = {
    get: <T>(kind: string, id: string) => structuredClone(data.get(`${kind}:${id}`) ?? null) as T | null,
    put: vi.fn((kind: string, id: string, value: unknown) => { data.set(`${kind}:${id}`, structuredClone(value)); }),
    delete: vi.fn((kind: string, id: string) => { data.delete(`${kind}:${id}`); }),
  };
  let employee = employeeA;
  let configured = [...accounts];
  let allowed = ["111", "222", "444"];
  let fail = "";
  let accountQueries = 0;
  let maximum = 0;
  let simultaneous = 0;
  let mutate: (() => void) | null = null;
  const queried: string[] = [];
  const request = vi.fn<typeof fetch>(async (_url, options) => {
    const body = String(options?.body);
    if (body.includes('"modelId":6349452')) return payload(ACCESS_COLUMNS, allowed.map(tpid => [tpid, "Synthetic entitlement"]));
    const account = accounts.find(entry => body.includes(`"'${entry.tpid}'"`));
    if (!account) throw new Error("Unconfigured account was queried.");
    queried.push(account.tpid);
    accountQueries++;
    maximum = Math.max(maximum, ++simultaneous);
    await new Promise(resolve => setImmediate(resolve));
    simultaneous--;
    mutate?.();
    if (account.tpid === fail) return new Response("", { status: 503 });
    return payload(ACR_COLUMNS, body.includes("'FY27'") ?
      [["Synthetic account", "FY27-Aug", 100, "Azure", "Compute", "VM", "Size", "SKU"],
        ["Synthetic account", "FY27-Sep", 125, "Azure", "Compute", "VM", "Size", "SKU"]] : []);
  });
  const auth = {
    connect: vi.fn(async (person: typeof employeeA) => ({ username: person.upn, name: person.name })),
    disconnect: vi.fn(async () => undefined),
    getToken: vi.fn(async (person: typeof employeeA) => ({ token: `synthetic-${person.key}`,
      user: { username: person.upn, name: person.name } })),
    status: vi.fn(async (person: typeof employeeA) =>
      ({ connected: true, user: { username: person.upn, name: person.name }, error: null })),
  };
  const queries = new PowerBiQueryClient(request, 180000, async () => undefined);
  const service = new AcrService(store, auth, async () => employee, () => configured, queries,
    () => new Date("2026-10-09T12:00:00Z"));
  const progress: AcrProgress[] = [];
  const fetch = () => service.fetch(next => progress.push(next));
  return { service, store, data, auth, progress, fetch, request, queried,
    accountQueries: () => accountQueries, maximum: () => maximum,
    employee: (next: typeof employeeA) => { employee = next; },
    configured: (next: AcrAccount[]) => { configured = next; },
    allowed: (next: string[]) => { allowed = next; },
    fail: (tpid: string) => { fail = tpid; }, mutate: (work: () => void) => { mutate = work; } };
}

it("intersects RLS with top parents, deduplicates TPIDs and limits active accounts to two", async () => {
  const test = fixture();
  test.configured([...accounts, { ...accounts[0]!, id: "duplicate-parent" }]);
  const result = await test.fetch();
  expect(result.snapshot?.accounts.map(entry => entry.account.tpid)).toEqual(["111", "222"]);
  expect(result.snapshot?.skipped.map(entry => entry.tpid)).toEqual(["333"]);
  expect(test.queried.sort()).toEqual(["111", "111", "222", "222"]);
  expect(test.maximum()).toBe(2);
  expect(test.progress.some(progress => progress.active.length === 2)).toBe(true);
  expect(test.progress.at(-1)).toMatchObject({ phase: "complete", completed: 2, running: false, failures: [] });
  expect(result.snapshot?.accounts[0]).toMatchObject({ total: 225, trend: .25, delta: 25 });
  expect(test.store.put).toHaveBeenCalledTimes(1);
});

it("preserves the complete last-good snapshot on partial failure, exposing failed account details", async () => {
  const test = fixture();
  const first = (await test.fetch()).snapshot;
  test.fail("222");
  await expect(test.fetch()).rejects.toThrow(/1 of 2.*previous snapshot/);
  expect((await test.service.getState()).snapshot).toEqual(first);
  expect(test.store.put).toHaveBeenCalledTimes(1);
  expect(test.progress.at(-1)?.failures[0]).toMatchObject({ account: { tpid: "222" }, error: expect.stringContaining("HTTP 503") });
});

it("replaces old entitlements with an explicitly empty snapshot after a successful zero-access query", async () => {
  const test = fixture();
  await test.fetch();
  const queries = test.accountQueries();
  test.allowed([]);
  const result = await test.fetch();
  expect(result.snapshot?.accounts).toEqual([]);
  expect(result.snapshot?.skipped).toHaveLength(3);
  expect(test.accountQueries()).toBe(queries);
  expect(test.store.put).toHaveBeenCalledTimes(2);
});

it("partitions snapshots and silent authentication by the selected employee", async () => {
  const test = fixture();
  await test.fetch();
  test.employee(employeeB);
  expect((await test.service.getState()).snapshot).toBeNull();
  await test.fetch();
  expect(test.auth.getToken.mock.calls.at(-1)?.[0]).toEqual(employeeB);
  expect(test.data.has(`acr-snapshot:${powerBiScopeId(employeeA)}`)).toBe(true);
  expect(test.data.has(`acr-snapshot:${powerBiScopeId(employeeB)}`)).toBe(true);
  await test.service.resetConnection();
  expect(test.data.has(`acr-snapshot:${powerBiScopeId(employeeA)}`)).toBe(true);
  expect(test.data.has(`acr-snapshot:${powerBiScopeId(employeeB)}`)).toBe(true);
  expect(test.auth.disconnect).toHaveBeenLastCalledWith(employeeB);
});

it.each(["employee", "accounts"])("rejects %s scope changes before snapshot commit", async kind => {
  const test = fixture();
  await test.fetch();
  const before = structuredClone([...test.data.entries()]);
  test.mutate(() => kind === "employee" ? test.employee(employeeB) : test.configured([accounts[0]!]));
  await expect(test.fetch()).rejects.toThrow(/employee or configured accounts changed/);
  expect([...test.data.entries()]).toEqual(before);
  expect(test.store.put).toHaveBeenCalledTimes(1);
});

it("hides removed accounts in cached display and discloses changed configured coverage", async () => {
  const test = fixture();
  await test.fetch();
  test.configured([accounts[0]!]);
  const state = await test.service.getState();
  expect(state.snapshot?.accounts.map(entry => entry.account.tpid)).toEqual(["111"]);
  expect(state.snapshot?.skipped).toEqual([]);
  expect(state.coverageChanged).toBe(true);
});

it("allows resetting the connection even when legacy account configuration cannot be queried", async () => {
  const test = fixture();
  await test.fetch();
  const before = structuredClone([...test.data.entries()]);
  test.configured([{ ...accounts[0]!, tpid: "invalid-legacy-tpid" }]);
  await test.service.resetConnection();
  expect(test.auth.disconnect).toHaveBeenLastCalledWith(employeeA);
  expect([...test.data.entries()]).toEqual(before);
});

it("surfaces an incompatible cache without blocking authentication or a repairing fetch", async () => {
  const test = fixture();
  test.store.put("acr-snapshot", powerBiScopeId(employeeA), { version: 99 });
  const state = await test.service.getState();
  expect(state.snapshot).toBeNull();
  expect(state.cacheError).toContain("Fetch a new snapshot");
  expect(state.connection.connected).toBe(true);
  expect((await test.fetch()).cacheError).toBeNull();
});

it("cancels active requests, waits for workers and never replaces the previous snapshot", async () => {
  const test = fixture();
  await test.fetch();
  const before = structuredClone([...test.data.entries()]);
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  test.request.mockImplementation(async (_url, options) => {
    if (String(options?.body).includes('"modelId":6349452')) return payload(ACCESS_COLUMNS, [["111", "Synthetic A"]]);
    started();
    return new Promise((_resolve, reject) => {
      const signal = options!.signal!;
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  const running = test.fetch();
  const rejected = expect(running).rejects.toThrow(/cancelled/);
  await ready;
  await expect(test.fetch()).rejects.toThrow(/already running/);
  await test.service.cancel();
  await rejected;
  expect(test.service.busy).toBe(false);
  expect([...test.data.entries()]).toEqual(before);
  expect(test.progress.at(-1)).toMatchObject({ phase: "cancelled", running: false });
});

it("does not replace a snapshot on an incomplete Power BI result or a failed vault write", async () => {
  const test = fixture();
  await test.fetch();
  const before = structuredClone([...test.data.entries()]);
  test.request.mockResolvedValue(Response.json({ results: [] }));
  await expect(test.fetch()).rejects.toThrow(/incomplete/);
  expect([...test.data.entries()]).toEqual(before);
  const old = test.store.get<AcrSnapshot>("acr-snapshot", powerBiScopeId(employeeA));
  test.request.mockResolvedValue(payload(ACCESS_COLUMNS, []));
  test.store.put.mockImplementationOnce(() => { throw new Error("Synthetic disk failure"); });
  await expect(test.fetch()).rejects.toThrow("Synthetic disk failure");
  expect(test.store.get("acr-snapshot", powerBiScopeId(employeeA))).toEqual(old);
});
