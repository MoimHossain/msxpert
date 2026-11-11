import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileService } from "./profile-service";
import { VaultStore } from "./storage/vault";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));
const fields = {
  id: "demo", displayName: "Demo User", jobTitle: "Demo role",
  email: "demo@example.invalid", department: null, officeLocation: null, photoDataUrl: null,
};

describe("local profile cache", () => {
  let directory: string;
  let store: VaultStore;
  const auth = { getAccountKey: vi.fn() };
  const msx = { getMyProfile: vi.fn() };
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "mcaps-profile-"));
    store = new VaultStore(directory);
    auth.getAccountKey.mockResolvedValue("demo-account");
    msx.getMyProfile.mockResolvedValue(fields);
  });
  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });
  it("persists JSON and photo separately from tokens, and reads cache without network on later launches", async () => {
    msx.getMyProfile.mockResolvedValue({ ...fields, photoDataUrl: "data:image/jpeg;base64,AQID" });
    const service = new ProfileService(store, auth, msx);
    const profile = await service.refresh();
    expect(profile.email).toBe("demo@example.invalid");
    expect(profile.photoDataUrl).toBe("data:image/jpeg;base64,AQID");
    expect(store.get("user-profile", "current")).not.toHaveProperty("photoDataUrl");
    store.close();
    store = new VaultStore(directory);
    expect(new ProfileService(store, auth, msx).getCached("demo-account")).toEqual(profile);
    expect(msx.getMyProfile).toHaveBeenCalledOnce();
    expect(new ProfileService(store, auth, msx).getCached("different-account")).toBeNull();
  });

  it("treats a missing MSX photo as a normal initials-avatar fallback and clears an old photo", async () => {
    store.put("user-profile-photo", "current", "old-photo");
    const profile = await new ProfileService(store, auth, msx).refresh();
    expect(profile.photoDataUrl).toBeNull();
    expect(store.get("user-profile-photo", "current")).toBeNull();
  });

  it("keeps the previous complete cache if profile refresh fails", async () => {
    const service = new ProfileService(store, auth, msx);
    const cached = await service.refresh();
    msx.getMyProfile.mockRejectedValue(new Error("MSX request failed with HTTP 403."));
    await expect(service.refresh()).rejects.toThrow("HTTP 403");
    expect(service.getCached("demo-account")).toEqual(cached);
  });

  it("clears profile and photo together on reset", async () => {
    msx.getMyProfile.mockResolvedValue({ ...fields, photoDataUrl: "data:image/png;base64,AQ==" });
    const service = new ProfileService(store, auth, msx);
    await service.refresh();
    service.clear();
    expect(service.getCached("demo-account")).toBeNull();
    expect(store.get("user-profile-photo", "current")).toBeNull();
  });

  it("does not restore a cache after reset while a refresh was in flight", async () => {
    const service = new ProfileService(store, auth, msx);
    let finish!: (value: typeof fields) => void;
    msx.getMyProfile.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const refreshing = service.refresh();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    service.clear();
    finish(fields);
    await expect(refreshing).rejects.toThrow("session changed");
    expect(service.getCached("demo-account")).toBeNull();
  });

  it("does not cache an MSX response after the signed-in account changes", async () => {
    auth.getAccountKey.mockResolvedValueOnce("demo-account").mockResolvedValueOnce("different-account");
    const service = new ProfileService(store, auth, msx);
    await expect(service.refresh()).rejects.toThrow("session changed");
    expect(service.getCached("demo-account")).toBeNull();
    expect(service.getCached("different-account")).toBeNull();
  });
});
