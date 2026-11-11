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
  id: "demo", displayName: "Demo User", jobTitle: "Demo role", mail: null,
  userPrincipalName: "demo@example.invalid", department: "Demo department", officeLocation: null,
};

describe("local profile cache", () => {
  let directory: string;
  let store: VaultStore;
  const auth = { getAccountKey: vi.fn(), getGraphAccessToken: vi.fn() };
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "mcaps-profile-"));
    store = new VaultStore(directory);
    auth.getAccountKey.mockResolvedValue("demo-account");
    auth.getGraphAccessToken.mockResolvedValue("test-only");
  });
  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });
  function responses(photo: Response) {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(fields)).mockResolvedValueOnce(photo);
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("persists JSON and photo separately from tokens, and reads cache without network on later launches", async () => {
    const fetch = responses(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    const service = new ProfileService(store, auth);
    const profile = await service.refresh();
    expect(profile.email).toBe("demo@example.invalid");
    expect(profile.photoDataUrl).toBe("data:image/jpeg;base64,AQID");
    expect(store.get("user-profile", "current")).not.toHaveProperty("photoDataUrl");
    store.close();
    store = new VaultStore(directory);
    expect(new ProfileService(store, auth).getCached("demo-account")).toEqual(profile);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new ProfileService(store, auth).getCached("different-account")).toBeNull();
  });

  it("treats a missing Graph photo as a normal initials-avatar fallback and clears an old photo", async () => {
    store.put("user-profile-photo", "current", "old-photo");
    responses(new Response(null, { status: 404 }));
    const profile = await new ProfileService(store, auth).refresh();
    expect(profile.photoDataUrl).toBeNull();
    expect(store.get("user-profile-photo", "current")).toBeNull();
  });

  it("keeps the previous complete cache if profile refresh fails", async () => {
    responses(new Response(null, { status: 404 }));
    const service = new ProfileService(store, auth);
    const cached = await service.refresh();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(service.refresh()).rejects.toThrow("HTTP 403");
    expect(service.getCached("demo-account")).toEqual(cached);
  });

  it("clears profile and photo together on reset", async () => {
    responses(new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }));
    const service = new ProfileService(store, auth);
    await service.refresh();
    service.clear();
    expect(service.getCached("demo-account")).toBeNull();
    expect(store.get("user-profile-photo", "current")).toBeNull();
  });

  it("does not restore a cache after reset while a refresh was in flight", async () => {
    const service = new ProfileService(store, auth);
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(new Response(null, { status: 404 })));
    const refreshing = service.refresh();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    service.clear();
    finish(Response.json(fields));
    await expect(refreshing).rejects.toThrow("session changed");
    expect(service.getCached("demo-account")).toBeNull();
  });
});
