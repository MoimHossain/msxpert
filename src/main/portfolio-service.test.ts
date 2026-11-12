import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountPreview, AppSettings, PortfolioAccount, Pod, TeamPerson } from "../shared/types";
import { defaultSettings } from "../domain/defaults";
import { AuthService } from "./auth";
import { MsxClient } from "./msx-client";
import { PortfolioService } from "./portfolio-service";
import { VaultStore } from "./storage/vault";
import { milestone } from "../../tests/milestone-fixture";
import type { FetchProgress } from "../shared/fetch";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
  shell: { openExternal: vi.fn() },
}));

const signedOut = { signedIn: false, name: null, username: null, userId: null };
const account: PortfolioAccount = {
  id: "local-customer", msxAccountId: "msx-customer", tpid: "100",
  name: "Example customer", country: null, createdAt: "2026-01-01T00:00:00.000Z",
};
const person: TeamPerson = {
  id: "person", msxUserId: null, name: "Example member", email: null, title: null,
  role: null, manager: null, level: null, notes: null, aliases: [], createdAt: account.createdAt,
};
const pod: Pod = {
  id: "pod", name: "Example POD", notes: null, accountIds: [account.id], people: [],
  createdAt: account.createdAt, updatedAt: account.createdAt,
};
const tree = [{ id: account.msxAccountId, tpid: account.tpid, name: account.name, country: null, parentingLevel: null, url: "https://example.invalid/customer" }];
const searchRecord = { ...tree[0] };
const preview: AccountPreview = {
  selected: searchRecord, topParent: searchRecord, tree, alreadyTracked: false, milestoneCount: 0,
};

describe("data-preserving setup reset", () => {
  let directory: string;
  let store: VaultStore;
  let auth: AuthService;
  let msx: MsxClient;
  let service: PortfolioService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "mcaps-reset-"));
    store = new VaultStore(directory);
    auth = new AuthService(directory);
    msx = new MsxClient(auth);
    vi.spyOn(auth, "signOut").mockResolvedValue(signedOut);
    vi.spyOn(auth, "getState").mockResolvedValue(signedOut);
    vi.spyOn(auth, "getCachedState").mockResolvedValue(signedOut);
    vi.spyOn(auth, "getAccountKey").mockResolvedValue(null);
    service = new PortfolioService(store, auth, msx, "0.5.0-alpha.1");
    store.put("settings", "default", { ...defaultSettings(), privacyAccepted: true, retentionSnapshots: 7,
      teamEnabled: true, podsEnabled: false,
      territoryIds: ["00000000-0000-0000-0000-000000000001"], onboardingComplete: true });
    store.put("portfolio-account", account.id, account);
    store.put(`current:${account.id}`, "milestones", []);
    store.put(`snapshots:${account.id}`, account.createdAt, { retained: "snapshot" });
    store.put(`changes:${account.id}`, account.createdAt, { retained: "change history" });
    store.put(`watermark:${account.id}`, "current", { reviewedThrough: account.createdAt });
    store.put("team-person", person.id, person);
    store.put("pod", pod.id, pod);
    store.put("user-profile", "current", { accountKey: "demo", displayName: "Demo profile" });
    store.put("user-profile-photo", "current", "test-photo");
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    vi.restoreAllMocks();
  });

  it.each(["fresh", "legacy"])("uses Team off and PODs on for %s settings", async (kind) => {
    if (kind === "fresh") {
      store.delete("settings", "default");
    } else {
      const legacy: Partial<AppSettings> = service.getSettings();
      delete legacy.teamEnabled;
      delete legacy.podsEnabled;
      store.put("settings", "default", legacy);
    }
    const state = await service.bootstrap(directory);
    expect(state.settings).toMatchObject({ teamEnabled: false, podsEnabled: true });
    if (kind === "legacy") {
      expect(state.settings).toMatchObject({ privacyAccepted: true, retentionSnapshots: 0, onboardingComplete: true });
    }
  });

  it("persists feature switches across reopening the vault without changing team or POD records", () => {
    const settings = { ...service.getSettings(), teamEnabled: false, podsEnabled: false };
    service.updateSettings(settings);
    store.close();
    store = new VaultStore(directory);
    service = new PortfolioService(store, auth, msx, "0.5.0-alpha.2");
    expect(service.getSettings()).toEqual(settings);
    expect(store.get("team-person", person.id)).toEqual(person);
    expect(store.get("pod", pod.id)).toEqual(pod);
    service.updateSettings({ ...settings, teamEnabled: true, podsEnabled: true });
    expect(service.listTeam()).toEqual([person]);
    expect(store.get("pod", pod.id)).toEqual(pod);
  });

  it("reads only active cached milestones, retains child/portfolio identity, reports gaps and deduplicates overlaps", () => {
    store.put("current:local-customer", "milestones", [milestone({ id: "shared", accountName: "Actual subsidiary" })]);
    store.put("portfolio-account", "overlap", { ...account, id: "overlap", name: "Z overlap" });
    store.put("current:overlap", "milestones", [milestone({ id: "shared" }), milestone({ id: "second" })]);
    store.put("portfolio-account", "missing", { ...account, id: "missing", name: "Not captured" });
    store.put("archived-portfolio-account", "archived", { ...account, id: "archived" });
    store.put("current:archived", "milestones", [milestone({ id: "archived-only" })]);
    const source = service.getMilestones();
    expect(source.milestones.map(row => row.id)).toEqual(["shared", "second"]);
    expect(source.milestones[0]).toMatchObject({
      portfolioAccountId: "local-customer", portfolioAccountName: "Example customer", portfolioTpid: "100", accountName: "Actual subsidiary",
    });

    expect(source.missingAccountIds).toEqual(["missing"]);
    expect(service.getMilestones(["overlap"]).milestones[0]?.portfolioAccountId).toBe("overlap");
    expect(() => service.getMilestones(["archived"])).toThrow("unavailable");
    expect(() => service.getMilestones(["overlap", "overlap"])).toThrow("unavailable");
  });

  it("reads legacy captures without creators as unknown without rewriting history or fetching MSX", () => {
    const legacy: Partial<ReturnType<typeof milestone>> = milestone({ id: "legacy" });
    delete legacy.createdById;
    delete legacy.createdByName;
    store.put(`current:${account.id}`, "milestones", [legacy]);
    const fetch = vi.spyOn(msx, "fetchMilestones");
    expect(service.getMilestones().milestones[0]).toMatchObject({ createdById: null, createdByName: null });
    expect(store.get(`current:${account.id}`, "milestones")).toEqual([legacy]);
    expect(store.get(`snapshots:${account.id}`, account.createdAt)).toEqual({ retained: "snapshot" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("archives active customers, resets first-run preferences, and keeps history, team, and POD records", async () => {
    const state = await service.resetSetup(directory);
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(state.auth.signedIn).toBe(false);
    expect(state.profile).toBeNull();
    expect(store.get("user-profile", "current")).toBeNull();
    expect(store.get("user-profile-photo", "current")).toBeNull();
    expect(state.settings).toEqual(defaultSettings());
    expect(state.settings.territoryIds).toEqual([]);
    expect(state.settings.onboardingComplete).toBe(false);
    expect(state.overview.accounts).toEqual([]);
    expect(store.get("archived-portfolio-account", account.id)).toEqual(account);
    expect(store.get(`snapshots:${account.id}`, account.createdAt)).toEqual({ retained: "snapshot" });
    expect(store.get(`changes:${account.id}`, account.createdAt)).toEqual({ retained: "change history" });
    expect(store.get(`watermark:${account.id}`, "current")).toEqual({ reviewedThrough: account.createdAt });
    expect(store.get("team-person", person.id)).toEqual(person);
    expect(store.get("pod", pod.id)).toEqual(pod);
    await service.resetSetup(directory);
    expect(store.get("archived-portfolio-account", account.id)).toEqual(account);
  });

  it("leaves configuration unchanged when sign-out fails", async () => {
    vi.mocked(auth.signOut).mockRejectedValueOnce(new Error("Cannot clear sign-in cache"));
    await expect(service.resetSetup(directory)).rejects.toThrow("Cannot clear sign-in cache");
    expect(service.listAccounts()).toEqual([account]);
    expect(service.getSettings().privacyAccepted).toBe(true);
    expect(store.get("archived-portfolio-account", account.id)).toBeNull();
  });

  it("rolls back account archiving if saving reset preferences fails", async () => {
    const put = store.put.bind(store);
    vi.spyOn(store, "put").mockImplementation((kind, id, value) => {
      if (kind === "settings") throw new Error("Cannot save preferences");
      put(kind, id, value);
    });
    await expect(service.resetSetup(directory)).rejects.toThrow("Cannot save preferences");
    expect(service.listAccounts()).toEqual([account]);
    expect(service.getSettings().privacyAccepted).toBe(true);
    expect(store.get("archived-portfolio-account", account.id)).toBeNull();
  });

  it("retains archived history after failed re-add, then restores the same customer identity on retry", async () => {
    await service.resetSetup(directory);
    vi.spyOn(msx, "previewAccount").mockResolvedValue(preview);
    vi.spyOn(msx, "resolveAccountTree").mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(tree);
    vi.spyOn(msx, "fetchMilestones").mockResolvedValue([]);
    await expect(service.addAccount(account.msxAccountId)).rejects.toThrow("Offline");
    expect(service.listAccounts()).toEqual([]);
    expect(store.get("archived-portfolio-account", account.id)).toEqual(account);
    expect(store.get(`snapshots:${account.id}`, account.createdAt)).toEqual({ retained: "snapshot" });
    expect(store.get(`changes:${account.id}`, account.createdAt)).toEqual({ retained: "change history" });
    const restored = await service.addAccount(account.msxAccountId);
    expect(restored.id).toBe(account.id);
    expect(restored.createdAt).toBe(account.createdAt);
    expect(store.get("archived-portfolio-account", account.id)).toBeNull();
    expect(store.get(`snapshots:${account.id}`, account.createdAt)).toEqual({ retained: "snapshot" });
    expect(store.get("pod", pod.id)).toEqual(pod);
  });

  it("does not reset or sign out during an active customer refresh", async () => {
    let finish!: (value: typeof tree) => void;
    vi.spyOn(msx, "resolveAccountTree").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(msx, "fetchMilestones").mockResolvedValue([]);
    const fetching = service.fetchAccounts();
    await expect(service.resetSetup(directory)).rejects.toThrow("Finish the current refresh");
    expect(auth.signOut).not.toHaveBeenCalled();
    finish(tree);
    await fetching;
    expect(service.listAccounts()).toEqual([account]);
  });

  it("backfills existing account territories once without fetching or changing milestone history", async () => {
    const territory = { id: "demo-territory", name: "Demo.FinancialServices.001" };
    const metadata = vi.spyOn(msx, "getAccountTerritories").mockResolvedValue(new Map([[account.msxAccountId, territory]]));
    const milestones = vi.spyOn(msx, "fetchMilestones");
    const tree = vi.spyOn(msx, "resolveAccountTree");
    await service.refreshAccountTerritories();
    expect(service.getOverview().accounts[0]?.territory).toEqual(territory);
    expect(store.get(`snapshots:${account.id}`, account.createdAt)).toEqual({ retained: "snapshot" });
    expect(store.get(`changes:${account.id}`, account.createdAt)).toEqual({ retained: "change history" });
    expect(store.get(`watermark:${account.id}`, "current")).toEqual({ reviewedThrough: account.createdAt });
    expect(milestones).not.toHaveBeenCalled();
    expect(tree).not.toHaveBeenCalled();
    await service.refreshAccountTerritories();
    expect(metadata).toHaveBeenCalledExactlyOnceWith([account.msxAccountId]);
  });

  it("keeps unavailable territory metadata unresolved and retryable instead of marking it unassigned", async () => {
    const metadata = vi.spyOn(msx, "getAccountTerritories").mockResolvedValueOnce(new Map())
      .mockRejectedValueOnce(new Error("MSX request failed with HTTP 403."));
    await expect(service.refreshAccountTerritories()).rejects.toThrow("every account");
    expect(service.listAccounts()).toEqual([account]);
    await expect(service.refreshAccountTerritories()).rejects.toThrow("HTTP 403");
    expect(service.listAccounts()).toEqual([account]);
    expect(metadata).toHaveBeenCalledTimes(2);
  });

  it("persists reassigned and explicitly cleared territories during the normal account refresh", async () => {
    const territory = { id: "demo-territory", name: "Demo.FinancialServices.001" };
    vi.spyOn(msx, "resolveAccountTree").mockResolvedValueOnce([{ ...tree[0]!, territory }])
      .mockResolvedValueOnce([{ ...tree[0]!, territory: null }]);
    vi.spyOn(msx, "fetchMilestones").mockResolvedValue([]);
    await service.fetchAccounts();
    expect(service.getOverview().accounts[0]?.territory).toEqual(territory);
    await service.fetchAccounts();
    expect(service.getOverview().accounts[0]?.territory).toBeNull();
  });

  it("streams only the active account and real counts, continuing after a failed account", async () => {
    store.put("portfolio-account", "second", { ...account, id: "second", name: "Z second customer" });
    vi.spyOn(msx, "resolveAccountTree").mockRejectedValueOnce(new Error("Synthetic offline")).mockResolvedValue(tree);
    vi.spyOn(msx, "fetchMilestones").mockImplementation(async (_scope, _ids, progress) => {
      progress?.({ milestones: 1, pages: 1 });
      return [milestone()];
    });
    const events: FetchProgress[] = [];
    const result = await service.fetchAccounts(undefined, progress => events.push(progress));
    expect(result.ok).toBe(false);
    expect(result.accounts.map(row => row.ok)).toEqual([false, true]);
    expect(events.every(progress => progress.accounts.filter(row =>
      ["tree", "milestones", "explaining", "saving"].includes(row.stage)).length <= 1)).toBe(true);
    expect(events.some(progress => progress.accounts.some(row => row.accountId === "second" && row.milestones === 1 && row.pages === 1))).toBe(true);
    expect(service.getFetchProgress()).toMatchObject({ running: false, completed: 2, total: 2,
      accounts: [{ stage: "failed", error: "Synthetic offline" }, { stage: "complete", milestones: 1 }] });
  });

  it("retains every snapshot and immutable run ID even with legacy retention and a frozen clock", async () => {
    store.delete(`changes:${account.id}`, account.createdAt);
    vi.spyOn(Date, "now").mockReturnValue(Date.now());
    vi.spyOn(msx, "resolveAccountTree").mockResolvedValue(tree);
    const fetch = vi.spyOn(msx, "fetchMilestones");
    for (let index = 0; index < 9; index++) {
      fetch.mockResolvedValueOnce([milestone({ name: `Capture ${index}`, versionNumber: String(index + 1) })]);
      await service.fetchAccounts(account.id);
    }
    const runs = service.getAccountState(account.id).runs;
    expect(new Set(runs.map(run => run.runId)).size).toBe(9);
    expect(store.listEntries(`snapshots:${account.id}`)).toHaveLength(10);
    expect(service.history.getRun({ accountId: account.id, runId: runs.at(-1)!.runId }).milestones?.[0]?.name).toBe("Capture 0");
    service.markReviewed(account.id);
    expect(service.history.getRun({ accountId: account.id, runId: runs[0]!.runId }).changes.modified).toHaveLength(1);
    expect(service.getSettings().retentionSnapshots).toBe(0);
  });
});
