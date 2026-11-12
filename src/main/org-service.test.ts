import { describe, expect, it, vi } from "vitest";
import type { AiConnectionsState, WorkiqConfiguration } from "../shared/ai";
import type { OrgPersonInput, OrgProfile, OrgProgress } from "../shared/organization";
import type { VaultStore } from "./storage/vault";
import { OrgService, type OrgDiscoveryLimits } from "./org-service";
import { OrgResponseError, OrgWorkiqError, type OrgFacts } from "./org-workiq";
import { parseOrgCatalog, type OrgCatalog } from "./org-catalog";

const profile = (upn: string, jobTitle = "Operations Manager", hasReports: boolean | null = false): OrgProfile =>
  ({ name: upn.split("@")[0]!, upn, jobTitle, hasReports });
const me = profile("signedin@example.test");
const root = profile("root@example.test", "CVP Customer Success", true);
const connector = profile("connector@example.test", "Operations Manager", true);
const csa = profile("csa@example.test", "Cloud Solution Architect");
const atu = profile("atu@example.test", "Strat Acct Tech Strategist");
const facts = (person: OrgProfile, manager: OrgProfile | null = null, reports: OrgProfile[] = [], complete = true): OrgFacts =>
  ({ person, manager, reports, complete, limitations: [] });
const id1 = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
const manual = (overrides: Partial<OrgPersonInput> = {}): OrgPersonInput => ({
  name: "Synthetic CSA", upn: csa.upn, jobTitle: csa.jobTitle, org: "CSU", msxUserIds: [], ...overrides,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

function fixture(limits: Partial<OrgDiscoveryLimits> = {}) {
  const data = new Map<string, unknown>();
  const store: Pick<VaultStore, "get" | "put" | "delete"> = {
    get: <T>(kind: string, id: string) => structuredClone(data.get(`${kind}:${id}`) as T | undefined) ?? null,
    put: vi.fn((kind, id, value) => { data.set(`${kind}:${id}`, structuredClone(value)); }),
    delete: vi.fn((kind, id) => { data.delete(`${kind}:${id}`); }),
  };
  let identity: { key: string; upn: string; name: string } | null = { key: "synthetic-account-scope", upn: me.upn, name: "Synthetic" };
  const connection: AiConnectionsState = {
    ai: { runtimePath: "", model: "" }, workiq: { executablePath: "", tenantId: "" },
    aiTest: null, testing: null,
    workiqTest: { status: "success", checkedAt: "", message: "", response: null, identity: null, details: null },
  };
  const query = vi.fn(async (upn: string, _reports: boolean, _signal: AbortSignal): Promise<OrgFacts> => {
    if (upn === me.upn) return facts(me, root);
    if (upn === root.upn) return facts(root, null, [connector, csa, me]);
    if (upn === connector.upn) return facts(connector, root, [atu]);
    throw new Error("Unexpected synthetic UPN");
  });
  const close = vi.fn(async () => {});
  const openSession = vi.fn(async (_config: WorkiqConfiguration, _signal: AbortSignal) => ({ query, close }));
  const resolveActors = vi.fn(async (_signal: AbortSignal): Promise<Array<{ msxUserId: string; upn: string }>> =>
    [{ msxUserId: id1, upn: csa.upn.toUpperCase() }]);
  const options = { getIdentity: async () => identity, getConnection: () => connection, resolveActors, openSession };
  return {
    service: new OrgService(store, options, limits), options, store, data, connection, query, close, openSession, resolveActors,
    setIdentity: (value: typeof identity) => { identity = value; },
  };
}

describe("organization discovery lifecycle", () => {
  it("requests the exact MSX user's profile, follows the nearest boundary, and persists only accepted roles", async () => {
    const f = fixture();
    const snapshots: OrgProgress[] = [];
    const result = await f.service.discover(progress => snapshots.push(progress));
    expect(result.progress).toMatchObject({ status: "complete", running: false, matched: 3, saved: 3, requests: 3, visited: 5 });
    // The CVP has an explicit CSU leadership title; generic connectors are transient.
    expect(result.people.map(person => person.upn).sort()).toEqual([root.upn, csa.upn, atu.upn].sort());
    expect(result.people.find(person => person.upn === csa.upn)?.msxUserIds).toEqual([id1]);
    expect(result.root?.upn).toBe(root.upn);
    expect(f.query.mock.calls.map(call => [call[0], call[1]])).toEqual([[me.upn, false], [root.upn, true], [connector.upn, true]]);
    expect([...f.data.keys()]).toEqual([expect.stringMatching(/^organization:[a-f0-9]{64}$/)]);
    expect(JSON.stringify([...f.data.values()])).not.toContain(connector.upn);
    expect(result.progress?.warnings.join(" ")).toContain("Best-effort");
    const starting = snapshots[0]!;
    expect(starting.running).toBe(true);
    expect(starting.visited).toBe(0);
    starting.warnings.push("mutated renderer copy");
    expect((await f.service.getState()).progress?.warnings).not.toContain("mutated renderer copy");
    const restarted = new OrgService(f.store, f.options);
    expect((await restarted.getState()).people).toEqual(result.people);
    expect((await restarted.getState()).progress).toBeNull();
  });

  it("stops at country head rather than continuing to a more senior CVP", async () => {
    const f = fixture();
    const country = profile("country@example.test", "Country General Manager", true);
    f.query.mockImplementation(async upn => upn === me.upn ? facts(me, country) : facts(country, root, []));
    const state = await f.service.discover(() => {});
    expect(state.root?.upn).toBe(country.upn);
    expect(f.query.mock.calls.map(call => call[0])).toEqual([me.upn, country.upn]);
    expect(state.progress?.status).toBe("partial"); // Report list unavailable despite hasReports=true.
  });

  it("climbs ordinary managers and never treats a functional GM as a country boundary", async () => {
    const f = fixture();
    const gm = profile("gm@example.test", "General Manager Customer Success", true);
    f.query.mockImplementation(async upn => {
      if (upn === me.upn) return facts(me, gm);
      if (upn === gm.upn) return facts(gm, root, [me]);
      return facts(root, null, [csa, gm]);
    });
    const state = await f.service.discover(() => {});
    expect(state.root?.upn).toBe(root.upn);
    expect(f.query.mock.calls.map(call => [call[0], call[1]])).toEqual([[me.upn, false], [gm.upn, false], [root.upn, true], [gm.upn, true]]);
    expect(state.root?.upn).not.toBe(gm.upn);
  });

  it("permits local management without AI tests but still requires a tested connection for discovery", async () => {
    const f = fixture();
    await f.service.savePerson(manual());
    f.connection.workiqTest = null;
    expect((await f.service.getState()).people).toHaveLength(1);
    expect((await f.service.refreshLinks()).people[0]?.msxUserIds).toEqual([id1]);
    await f.service.savePerson(manual());
    await f.service.removePerson((await f.service.getState()).people[0]!.id);
    expect((await f.service.getState()).people).toEqual([]);
    await expect(f.service.discover(() => {})).rejects.toThrow("Successfully test");
    expect(f.openSession).not.toHaveBeenCalled();
  });

  it("fails before traversal or writes if the returned profile does not exactly match the MSX user", async () => {
    const f = fixture();
    f.query.mockResolvedValue(facts(profile("other@example.test"), root));
    const state = await f.service.discover(() => {});
    expect(state.progress?.status).toBe("failed");
    expect(f.query).toHaveBeenCalledOnce();
    expect(f.data.size).toBe(0);
  });

  it("reports the specific missing-UPN failure without blaming sign-in or overwriting saved people", async () => {
    const f = fixture();
    await f.service.savePerson(manual());
    const writes = vi.mocked(f.store.put).mock.calls.length;
    f.query.mockRejectedValue(new OrgResponseError("Work IQ returned a missing or invalid exact work UPN."));
    const state = await f.service.discover(() => {});
    expect(f.query.mock.calls[0]?.[0]).toBe(me.upn);
    expect(state.progress).toMatchObject({ status: "failed", requests: 1 });
    expect(state.progress?.error).toContain("missing or invalid exact work UPN");
    expect(state.progress?.error).not.toContain("Check the existing client's account");
    expect(state.people).toHaveLength(1);
    expect(vi.mocked(f.store.put).mock.calls).toHaveLength(writes);
  });

  it("does not prune connectors with unknown report status and marks incomplete responses partial", async () => {
    const f = fixture();
    f.query.mockImplementation(async upn => {
      if (upn === me.upn) return facts(me, root);
      if (upn === root.upn) return facts(root, null, [{ ...connector, hasReports: null }], false);
      return facts({ ...connector, hasReports: null }, root, [csa], false);
    });
    const state = await f.service.discover(() => {});
    expect(state.progress?.status).toBe("partial");
    expect(state.people.some(person => person.upn === csa.upn)).toBe(true);
    expect(f.query.mock.calls.some(call => call[0] === connector.upn && call[1])).toBe(true);
  });

  it("detects upward cycles without selecting an arbitrary root", async () => {
    const f = fixture();
    f.query.mockImplementation(async upn => upn === me.upn ? facts(me, connector) : facts(connector, me));
    const state = await f.service.discover(() => {});
    expect(state.progress?.status).toBe("partial");
    expect(state.root).toBeNull();
    expect(state.people).toEqual([]);
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it("detects repeated downward edges without repeating requests", async () => {
    const f = fixture();
    f.query.mockImplementation(async upn => {
      if (upn === me.upn) return facts(me, root);
      if (upn === root.upn) return facts(root, null, [connector, csa, csa]);
      return facts(connector, root, [root, csa, atu]);
    });
    const state = await f.service.discover(() => {});
    expect(state.progress?.status).toBe("partial");
    expect(state.people.filter(person => person.upn === csa.upn)).toHaveLength(1);
    expect(f.query).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ maxRequests: 2 }, "request budget"],
    [{ maxPeople: 2 }, "person budget"],
    [{ maxDepth: 1 }, "depth budget"],
  ] as const)("bounds discovery %j while preserving validated role matches", async (limits, warning) => {
    const f = fixture(limits);
    const state = await f.service.discover(() => {});
    expect(state.progress?.status).toBe("partial");
    expect(state.progress?.warnings.join(" ")).toContain(warning);
    expect(state.people.length).toBeGreaterThan(0);
    expect(state.progress!.requests).toBeLessThanOrEqual((limits as Partial<OrgDiscoveryLimits>).maxRequests ?? 200);
  });

  it("bounds upward hops and does not descend without an explicit boundary", async () => {
    const f = fixture({ maxUpwardHops: 1 });
    f.query.mockImplementation(async upn => upn === me.upn ? facts(me, connector) : facts(connector, root));
    const state = await f.service.discover(() => {});
    expect(state.progress?.status).toBe("partial");
    expect(state.progress?.warnings.join(" ")).toContain("hop budget");
    expect(state.root).toBeNull();
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it.each(["request", "duration"] as const)("bounds an unresponsive %s without waiting for a late answer", async kind => {
    const f = fixture(kind === "request" ? { requestTimeoutMs: 15 } : { maxDurationMs: 15 });
    f.query.mockImplementation(async () => new Promise<OrgFacts>(() => {}));
    const state = await f.service.discover(() => {});
    expect(state.progress?.status).toBe("partial");
    expect(f.close).toHaveBeenCalled();
    expect(f.data.size).toBe(0);
  });

  it("skips malformed downward responses as partial but treats service denial as failed", async () => {
    const f = fixture();
    f.query.mockImplementation(async upn => {
      if (upn === me.upn) return facts(me, root);
      if (upn === root.upn) return facts(root, null, [csa, connector]);
      throw new OrgResponseError("Invalid exact requested UPN.");
    });
    expect((await f.service.discover(() => {})).progress?.status).toBe("partial");
    expect((await f.service.getState()).people.some(person => person.upn === csa.upn)).toBe(true);
    f.query.mockRejectedValueOnce(new Error("Access denied"));
    expect((await f.service.discover(() => {})).progress?.status).toBe("failed");
  });

  it("explores the verified path and saves matching roles when the boundary report response is rejected", async () => {
    const f = fixture();
    const subject = { ...me, jobTitle: "Cloud Solution Architect" };
    const manager = { ...connector, jobTitle: "Cloud Solution Architecture Manager" };
    const boundary = { ...root, jobTitle: "CVP EMEA" };
    f.query.mockImplementation(async (upn, reports) => {
      if (upn === me.upn) return facts(subject, manager);
      if (upn === manager.upn) return facts(manager, boundary, reports ? [subject, csa] : []);
      throw new OrgResponseError("Work IQ returned a different UPN from the exact requested profile.");
    });
    const state = await f.service.discover(() => {});
    expect(state.progress).toMatchObject({ status: "partial", saved: 3, matched: 3, requests: 4, visited: 4 });
    expect(state.people.map(person => person.upn).sort()).toEqual([me.upn, manager.upn, csa.upn].sort());
    expect(state.progress?.warnings.join(" ")).toContain("different UPN");
    expect(state.progress?.logs.some(log => log.message.includes("already verified reporting path"))).toBe(true);
    expect(f.query.mock.calls.filter(call => call[0] === boundary.upn)).toHaveLength(1);
    expect((await new OrgService(f.store, f.options).getState()).people).toEqual(state.people);
  });

  it.each([false, true])("bounds a format correction to one counted request (persistent rejection: %s)", async persistent => {
    const f = fixture();
    let attempts = 0;
    f.query.mockImplementation(async upn => {
      if (upn === me.upn) return facts(me, root);
      if (upn === root.upn && (++attempts === 1 || persistent)) throw new OrgResponseError("Malformed profile JSON.", true);
      if (upn === root.upn) return facts(root, null, [me, csa]);
      throw new Error("Unexpected synthetic UPN");
    });
    const state = await f.service.discover(() => {});
    expect(f.query.mock.calls.filter(call => call[0] === root.upn)).toHaveLength(2);
    expect(f.query).toHaveBeenNthCalledWith(3, root.upn, true, expect.any(AbortSignal), { correctFormat: true, profileOnly: false });
    expect(state.progress?.requests).toBe(3);
    expect(state.progress?.status).toBe(persistent ? "partial" : "complete");
    expect(state.progress?.logs.some(log => log.message.includes("one format correction"))).toBe(true);
  });

  it("does not bypass request limits for format corrections", async () => {
    const f = fixture({ maxRequests: 2 });
    f.query.mockImplementation(async upn => {
      if (upn === me.upn) return facts(me, root);
      throw new OrgResponseError("Malformed profile JSON.", true);
    });
    const state = await f.service.discover(() => {});
    expect(state.progress).toMatchObject({ status: "partial", requests: 2 });
    expect(f.query).toHaveBeenCalledTimes(2);
    expect(state.progress?.warnings.join(" ")).toContain("request budget");
  });

  it("stops without retrying or exploring the known path after a boundary access denial", async () => {
    const f = fixture();
    f.query.mockImplementation(async upn => {
      if (upn === me.upn) return facts(me, root);
      throw new OrgWorkiqError("Work IQ access denied.");
    });
    const state = await f.service.discover(() => {});
    expect(state.progress).toMatchObject({ status: "failed", requests: 2, saved: 0 });
    expect(f.query).toHaveBeenCalledTimes(2);
    expect(state.people).toEqual([]);
  });

  it("recovers a running job on reload, rejects overlap and cancels without losing validated matches or allowing late writes", async () => {
    const f = fixture();
    const pending = deferred<OrgFacts>();
    f.query.mockImplementation(async upn => {
      if (upn === me.upn) return facts(me, root);
      if (upn === root.upn) return facts(root, null, [csa, connector]);
      return pending.promise;
    });
    const discovery = f.service.discover(() => { throw new Error("Renderer closed"); });
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(3));
    expect((await f.service.getState()).progress?.running).toBe(true);
    await expect(f.service.discover(() => {})).rejects.toThrow("already running");
    const cancelled = await f.service.cancel();
    await discovery;
    expect(cancelled.progress?.status).toBe("cancelled");
    expect(cancelled.people.some(person => person.upn === csa.upn)).toBe(true);
    const writes = vi.mocked(f.store.put).mock.calls.length;
    pending.resolve(facts(connector, root, [atu]));
    await Promise.resolve();
    expect(vi.mocked(f.store.put).mock.calls).toHaveLength(writes);
    expect(f.service.busy).toBe(false);
    expect(f.close).toHaveBeenCalled();
  });

  it("never exposes another account's progress or commits results after an account switch", async () => {
    const f = fixture();
    const pending = deferred<OrgFacts>();
    f.query.mockImplementation(async upn => upn === me.upn ? facts(me, root) : pending.promise);
    const discovery = f.service.discover(() => {});
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2));
    f.setIdentity({ key: "different-account", upn: "different@example.test", name: "Different" });
    expect(await f.service.getState()).toMatchObject({ people: [], progress: null, root: null });
    pending.resolve(facts(root, null, [csa]));
    const result = await discovery;
    expect(result.progress).toBeNull();
    expect(result.people).toEqual([]);
    expect(f.data.size).toBe(0);
  });

  it("clears the current partition, awaits cancellation and prevents results arriving after reset", async () => {
    const f = fixture();
    await f.service.savePerson(manual());
    const pending = deferred<OrgFacts>();
    f.query.mockImplementation(async () => pending.promise);
    const discovery = f.service.discover(() => {});
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledOnce());
    await f.service.clear();
    await discovery;
    expect((await f.service.getState()).people).toEqual([]);
    expect((await f.service.getState()).progress).toBeNull();
    pending.resolve(facts(me, root));
    await Promise.resolve();
    expect(f.data.size).toBe(0);
  });

  it("does not restore cached people or finished progress when the subject changes under the same opaque scope", async () => {
    const f = fixture();
    await f.service.discover(() => {});
    f.setIdentity({ key: "synthetic-account-scope", upn: "other@example.test", name: "Other" });
    const state = await f.service.getState();
    expect(state.people).toEqual([]);
    expect(state.progress).toBeNull();
    expect(state.root).toBeNull();
  });

  it("makes concurrent MSX refresh nonfatal while discovery owns the partition", async () => {
    const f = fixture();
    const pending = deferred<OrgFacts>();
    f.query.mockImplementation(async () => pending.promise);
    const discovery = f.service.discover(() => {});
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledOnce());
    const state = await f.service.refreshLinks();
    expect(state.linkError).toContain("current organization operation");
    expect(state.progress?.running).toBe(true);
    await f.service.cancel();
    await discovery;
  });

  it("invalidates a pending import during reset so a late file selection cannot recreate deleted data", async () => {
    const f = fixture();
    const pending = deferred<OrgCatalog | null>();
    const select = vi.fn(async () => pending.promise);
    const saving = f.service.importCatalog(select);
    const rejection = expect(saving).rejects.toThrow();
    await vi.waitFor(() => expect(select).toHaveBeenCalledOnce());
    await f.service.clear();
    pending.resolve({ generatedAt: "2020-01-01T00:00:00.000Z", people: [
      { upn: csa.upn, name: csa.name, jobTitle: csa.jobTitle, org: "CSU" },
    ] });
    await rejection;
    expect(f.data.size).toBe(0);
    expect(f.service.busy).toBe(false);
  });

  it("closes a session factory result that arrives after cancellation", async () => {
    const f = fixture();
    const pending = deferred<{ query: typeof f.query; close: typeof f.close }>();
    f.openSession.mockImplementation(async () => pending.promise);
    const discovery = f.service.discover(() => {});
    await vi.waitFor(() => expect(f.openSession).toHaveBeenCalledOnce());
    await f.service.cancel();
    await discovery;
    pending.resolve({ query: f.query, close: f.close });
    await vi.waitFor(() => expect(f.close).toHaveBeenCalled());
    expect(f.query).not.toHaveBeenCalled();
    expect(f.data.size).toBe(0);
  });
});

describe("local catalog import", () => {
  const catalog = (): OrgCatalog => ({ generatedAt: "2020-01-01T00:00:00.000Z",
    people: [{ name: csa.name, upn: csa.upn, jobTitle: csa.jobTitle, org: "ISD" }] });

  it("imports without AI tests or network, preserves evidence age and adds exact MSX links only on explicit refresh", async () => {
    const f = fixture();
    f.connection.workiqTest = null;
    const result = await f.service.importCatalog(async () => catalog());
    expect(result?.summary).toMatchObject({ added: 1, updated: 0, total: 1 });
    expect(result?.state.people[0]).toMatchObject({ org: "ISD", source: "imported", msxUserIds: [], updatedAt: catalog().generatedAt });
    expect(result?.state.canDiscover).toBe(false);
    expect(f.resolveActors).not.toHaveBeenCalled();
    expect(f.openSession).not.toHaveBeenCalled();
    const linked = await f.service.refreshLinks();
    expect(linked.people[0]?.msxUserIds).toEqual([id1]);
    expect(linked.people[0]?.updatedAt).toBe(catalog().generatedAt);
    expect((await new OrgService(f.store, f.options).getState()).people).toEqual(linked.people);
  });

  it("updates matching catalog entries without losing links or manual/newer/unrelated records, and resists AI reclassification", async () => {
    const f = fixture();
    const first = await f.service.importCatalog(async () => catalog());
    await f.service.discover(() => {});
    await f.service.savePerson(manual({ upn: atu.upn, org: "STU" }));
    await f.service.savePerson(manual({ upn: "unrelated@example.test" }));
    const result = await f.service.importCatalog(async () => ({
      generatedAt: "2021-01-01T00:00:00.000Z", people: [
        { ...catalog().people[0]!, name: "Updated catalog name" },
        { ...catalog().people[0]!, upn: atu.upn, org: "ATU" },
        { ...catalog().people[0]!, upn: root.upn, org: "STU" },
      ],
    }));
    expect(result?.summary).toEqual({ added: 0, updated: 1, preservedManual: 1, preservedNewer: 1, total: 3 });
    expect(result?.state.people.find(person => person.upn === csa.upn)).toMatchObject({
      id: first?.state.people[0]?.id, name: "Updated catalog name", org: "ISD", msxUserIds: [id1],
    });
    expect(result?.state.people.find(person => person.upn === atu.upn)?.org).toBe("STU");
    expect(result?.state.people.some(person => person.upn === "unrelated@example.test")).toBe(true);
    const discovered = await f.service.discover(() => {});
    expect(discovered.people.find(person => person.upn === csa.upn)).toMatchObject({ org: "ISD", source: "imported" });
  });

  it("leaves the directory unchanged on cancellation or invalid file content", async () => {
    const f = fixture();
    expect(await f.service.importCatalog(async () => null)).toBeNull();
    await expect(f.service.importCatalog(async () => parseOrgCatalog('{"people":[{"private":"not a valid catalog"}]}'))).rejects.toThrow();
    expect(f.data.size).toBe(0);
    expect(f.store.put).not.toHaveBeenCalled();
  });
});

describe("milestone people discovery", () => {
  const id3 = "33333333-3333-4333-8333-333333333333";
  const id4 = "44444444-4444-4444-8444-444444444444";
  const review = profile("review@example.test", "Operations Analyst", null);

  it("checks unique actors independently, skips an unavailable profile and stores Unknown roles for review without hierarchy lookups", async () => {
    const f = fixture();
    f.resolveActors.mockResolvedValue([
      { msxUserId: id1, upn: csa.upn }, { msxUserId: id2, upn: csa.upn.toUpperCase() },
      { msxUserId: id3, upn: "unavailable@example.test" }, { msxUserId: id4, upn: review.upn },
    ]);
    f.query.mockImplementation(async upn => {
      if (upn === csa.upn) return facts(csa);
      if (upn === review.upn) return facts(review);
      throw new OrgResponseError("Work IQ omitted a required profile.");
    });
    const state = await f.service.discoverMilestonePeople(() => {});
    expect(state.progress).toMatchObject({ mode: "milestones", status: "partial", visited: 3, requests: 3, saved: 2, matched: 1 });
    expect(state.root).toBeNull();
    expect(f.query.mock.calls.map(call => call[0])).toEqual([csa.upn, "unavailable@example.test", review.upn]);
    for (const upn of [csa.upn, "unavailable@example.test", review.upn]) {
      expect(f.query).toHaveBeenCalledWith(upn, false, expect.any(AbortSignal), { profileOnly: true, correctFormat: false });
    }
    expect(f.resolveActors).toHaveBeenCalledOnce();
    expect(state.people.find(person => person.upn === csa.upn)?.msxUserIds).toEqual([id1, id2]);
    expect(state.people.find(person => person.upn === review.upn)?.org).toBe("Unknown");
    expect(state.progress?.warnings.join(" ")).toContain("omitted a required profile");
    expect((await new OrgService(f.store, f.options).getState()).people).toEqual(state.people);
  });

  it("stops on access denial while preserving already saved and linked milestone actors", async () => {
    const f = fixture();
    f.resolveActors.mockResolvedValue([{ msxUserId: id1, upn: csa.upn }, { msxUserId: id2, upn: atu.upn },
      { msxUserId: id3, upn: review.upn }]);
    f.query.mockImplementation(async upn => {
      if (upn === csa.upn) return facts(csa);
      throw new OrgWorkiqError("Work IQ access denied.");
    });
    const state = await f.service.discoverMilestonePeople(() => {});
    expect(state.progress).toMatchObject({ status: "failed", requests: 2, saved: 1 });
    expect(state.people[0]?.msxUserIds).toEqual([id1]);
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it("bounds actor requests without refetching MSX identities or losing earlier accepted profiles", async () => {
    const f = fixture({ maxRequests: 1 });
    f.resolveActors.mockResolvedValue([{ msxUserId: id1, upn: csa.upn }, { msxUserId: id2, upn: atu.upn }]);
    f.query.mockResolvedValue(facts(csa));
    const state = await f.service.discoverMilestonePeople(() => {});
    expect(state.progress).toMatchObject({ status: "partial", requests: 1, saved: 1, queued: 1, visited: 1 });
    expect(state.people[0]?.msxUserIds).toEqual([id1]);
    expect(f.resolveActors).toHaveBeenCalledOnce();
  });

  it("does not start Work IQ when resolving milestone identities fails", async () => {
    const f = fixture();
    f.resolveActors.mockRejectedValue(new Error("Private upstream detail"));
    const state = await f.service.discoverMilestonePeople(() => {});
    expect(state.progress).toMatchObject({ status: "failed", requests: 0 });
    expect(state.progress?.error).toContain("MSX milestone people could not be resolved");
    expect(state.progress?.error).not.toContain("Private");
    expect(f.openSession).not.toHaveBeenCalled();
  });

  it("skips conflicting user-ID mappings instead of guessing which UPN to query", async () => {
    const f = fixture();
    f.resolveActors.mockResolvedValue([{ msxUserId: id1, upn: csa.upn }, { msxUserId: id1, upn: atu.upn }]);
    const state = await f.service.discoverMilestonePeople(() => {});
    expect(f.query).not.toHaveBeenCalled();
    expect(state.progress?.warnings.join(" ")).toContain("conflicting UPNs");
    expect(state.people).toEqual([]);
  });

  it("preserves manual overrides and records newly unclassified actors as Unknown rather than retaining an obsolete inferred unit", async () => {
    const f = fixture();
    f.query.mockResolvedValue(facts(csa));
    await f.service.discoverMilestonePeople(() => {});
    f.query.mockResolvedValue(facts({ ...csa, jobTitle: "Operations Analyst" }));
    expect((await f.service.discoverMilestonePeople(() => {})).people[0]?.org).toBe("Unknown");
    await f.service.savePerson(manual({ org: "STU" }));
    f.query.mockResolvedValue(facts(csa));
    expect((await f.service.discoverMilestonePeople(() => {})).people[0]).toMatchObject({ org: "STU", source: "manual" });
  });
});

describe("manual organization corrections and exact MSX linking", () => {
  it("merges duplicate UPN additions, preserves manual corrections on rediscovery and updates revisions", async () => {
    const f = fixture();
    await f.service.savePerson(manual({ org: "Unknown", name: "Manual correction" }));
    const first = await f.service.refreshLinks();
    const revision = first.revision;
    const duplicate = await f.service.savePerson(manual({ upn: csa.upn.toUpperCase(), org: "STU", msxUserIds: [id2] }));
    expect(duplicate.people).toHaveLength(1);
    expect(duplicate.people[0]?.id).toBe(first.people[0]?.id);
    expect(duplicate.people[0]?.msxUserIds.sort()).toEqual([id1, id2].sort());
    const discovered = await f.service.discover(() => {});
    expect(discovered.people.find(person => person.upn === csa.upn)).toMatchObject({ source: "manual", org: "STU" });
    expect(discovered.revision).not.toBe(revision);
    const removed = await f.service.removePerson(first.people[0]!.id);
    expect(removed.people.some(person => person.upn === csa.upn)).toBe(false);
  });

  it("rejects links or edited UPNs that would identify two different people", async () => {
    const f = fixture();
    const first = await f.service.savePerson(manual({ msxUserIds: [id1] }));
    await expect(f.service.savePerson(manual({ upn: atu.upn, msxUserIds: [id1] }))).rejects.toThrow("already linked");
    const second = await f.service.savePerson(manual({ upn: atu.upn, msxUserIds: [] }));
    const person = second.people.find(item => item.upn === atu.upn)!;
    await expect(f.service.savePerson(manual({ id: person.id, upn: csa.upn }))).rejects.toThrow("already belongs");
    expect((await f.service.getState()).people.find(item => item.upn === csa.upn)?.id).toBe(first.people[0]?.id);
  });

  it("keeps previous mappings and surfaces resolver errors rather than rejecting a successful fetch", async () => {
    const f = fixture();
    await f.service.savePerson(manual());
    await f.service.refreshLinks();
    f.resolveActors.mockRejectedValue(new Error("MSX unavailable"));
    const state = await f.service.refreshLinks();
    expect(state.people[0]?.msxUserIds).toEqual([id1]);
    expect(state.linkError).toContain("Previous valid links");
    f.connection.workiqTest = null;
    expect((await f.service.refreshLinks()).linkError).not.toBeNull();
    f.resolveActors.mockResolvedValue([{ msxUserId: id2, upn: csa.upn.toUpperCase() }]);
    const retried = await f.service.refreshLinks();
    expect(retried.linkError).toBeNull();
    expect(retried.people[0]?.msxUserIds.sort()).toEqual([id1, id2].sort());
  });

  it("does not guess names or attach an MSX id to two distinct UPNs", async () => {
    const f = fixture();
    f.resolveActors.mockResolvedValue([]);
    await f.service.savePerson(manual());
    await f.service.savePerson(manual({ name: "Synthetic CSA", upn: atu.upn }));
    f.resolveActors.mockResolvedValue([{ msxUserId: id1, upn: csa.upn }, { msxUserId: id1, upn: atu.upn }]);
    const state = await f.service.refreshLinks();
    expect(state.people.every(person => person.msxUserIds.length === 0)).toBe(true);
    expect(state.linkError).toContain("conflicting");
  });

  it("does not delete stale entries or require fresh discovery to read cached corrections", async () => {
    const f = fixture();
    const old = await f.service.savePerson(manual());
    const key = [...f.data.keys()][0]!;
    const partition = f.data.get(key) as { people: Array<{ updatedAt: string }> };
    partition.people[0]!.updatedAt = "2020-01-01T00:00:00.000Z";
    f.connection.workiqTest = null;
    const state = await f.service.getState();
    expect(state.people[0]?.updatedAt).toBe("2020-01-01T00:00:00.000Z");
    expect(state.people[0]?.id).toBe(old.people[0]?.id);
    f.setIdentity(null);
    expect(await f.service.getState()).toMatchObject({ people: [], identity: null, canDiscover: false });
  });
});
