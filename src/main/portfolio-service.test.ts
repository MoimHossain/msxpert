import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountPreview, PortfolioAccount, Pod, TeamPerson } from "../shared/types";
import { defaultSettings } from "../domain/defaults";
import { AuthService } from "./auth";
import { MsxClient } from "./msx-client";
import { PortfolioService } from "./portfolio-service";
import { VaultStore } from "./storage/vault";

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
    store.put("settings", "default", { ...defaultSettings(), privacyAccepted: true, retentionSnapshots: 7 });
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
});
