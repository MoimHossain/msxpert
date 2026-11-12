import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthRequiredError, AuthService } from "./auth";
import { AuthLoopback } from "./auth-loopback";
import type { Configuration, TokenCacheContext } from "@azure/msal-node";

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  silent: vi.fn(),
  interactive: vi.fn(),
  remove: vi.fn(),
  config: null as Configuration | null,
}));
vi.mock("electron", () => ({
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value) },
  shell: { openExternal: vi.fn() },
}));
vi.mock("@azure/msal-node", () => ({
  LogLevel: { Warning: 2 },
  InteractionRequiredAuthError: class extends Error {},
  PublicClientApplication: class {
    constructor(config: Configuration) { mocks.config = config; }
    getTokenCache() { return { getAllAccounts: mocks.accounts, removeAccount: mocks.remove }; }
    acquireTokenSilent = mocks.silent;
    acquireTokenInteractive = mocks.interactive;
  },
}));

const directories: string[] = [];
function auth() {
  const directory = mkdtempSync(join(tmpdir(), "mcaps-auth-"));
  directories.push(directory);
  return new AuthService(directory);
}
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("MSX session lifecycle", () => {
  it("uses only the original MSX default scope for browser sign-in and silent renewal", async () => {
    const account = { homeAccountId: "demo-account" };
    mocks.accounts.mockResolvedValue([account]);
    mocks.interactive.mockResolvedValue({ account, accessToken: "test-only" });
    mocks.silent.mockResolvedValue({ accessToken: "test-only" });
    const service = auth();
    await service.signIn();
    const request = mocks.interactive.mock.calls[0]?.[0];
    expect(request.scopes).toEqual(["https://microsoftsales.crm.dynamics.com/.default"]);
    expect(request.extraScopesToConsent).toBeUndefined();
    await service.getAccessToken();
    expect(mocks.silent).toHaveBeenCalledWith(expect.objectContaining({ scopes: request.scopes }));
  });

  it("reports safe Entra diagnostics without returning or logging personal/token details", async () => {
    mocks.interactive.mockRejectedValue(Object.assign(new Error("AADSTS65002 demo@example.invalid test-only-secret"), {
      errorCode: "invalid_client",
    }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(auth().signIn()).rejects.toThrow(new Error(
        "This client is not authorized for the requested resource. Use an approved client registration. (AADSTS65002)",
      ));
      expect(log).toHaveBeenCalledExactlyOnceWith("AUTH_SIGN_IN_FAILED", "AADSTS65002");
    } finally { log.mockRestore(); }
  });

  it("verifies saved sign-in silently without opening a browser", async () => {
    mocks.accounts.mockResolvedValue([{ name: "Test", username: "test@example.invalid" }]);
    mocks.silent.mockResolvedValue({ accessToken: "test-only" });
    expect((await auth().getState()).signedIn).toBe(true);
    expect(mocks.interactive).not.toHaveBeenCalled();
  });

  it("shows sign-in when silent renewal fails instead of trusting an old account record", async () => {
    mocks.accounts.mockResolvedValue([{}]);
    mocks.silent.mockRejectedValue(new Error("network"));
    expect(await auth().getState()).toMatchObject({ signedIn: false, message: expect.stringContaining("renewed") });
    expect(mocks.interactive).not.toHaveBeenCalled();
  });

  it("requires sign-in without a cached account", async () => {
    mocks.accounts.mockResolvedValue([]);
    await expect(auth().getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("binds the org seed and scope to one MSAL account read, using username rather than a mail alias", async () => {
    mocks.accounts.mockResolvedValue([{ homeAccountId: "current-account", username: "canonical@example.invalid",
      name: "Synthetic User", idTokenClaims: { email: "mail-alias@example.invalid" } }]);
    expect(await auth().getAccountIdentity()).toEqual({
      key: "current-account", upn: "canonical@example.invalid", name: "Synthetic User",
    });
    expect(mocks.accounts).toHaveBeenCalledOnce();
    expect(mocks.silent).not.toHaveBeenCalled();
    expect(mocks.interactive).not.toHaveBeenCalled();
  });

  it("does not invent an organization seed when the cached account has no authenticated username", async () => {
    mocks.accounts.mockResolvedValue([{ homeAccountId: "current-account", name: "Not an identity" }]);
    expect(await auth().getAccountIdentity()).toBeNull();
  });

  it("cancels the pending flow and permits retry", async () => {
    mocks.accounts.mockResolvedValue([]);
    mocks.interactive.mockImplementation(({ loopbackClient }) => loopbackClient.listenForAuthCode());
    const service = auth();
    const signingIn = service.signIn();
    const rejection = expect(signingIn).rejects.toThrow("cancelled");
    service.cancelSignIn();
    await rejection;
    mocks.interactive.mockResolvedValue({ accessToken: "test-only", account: { homeAccountId: "demo-account" } });
    await expect(service.signIn()).resolves.toBeUndefined();
  });

  it("bounds an abandoned browser sign-in with a retryable timeout", async () => {
    mocks.accounts.mockResolvedValue([]);
    vi.useFakeTimers();
    mocks.interactive.mockImplementation(({ loopbackClient }) => loopbackClient.listenForAuthCode());
    const signingIn = auth().signIn();
    const rejection = expect(signingIn).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(120000);
    await rejection;
  });

  it("uses the interactively selected identity instead of an older cached account", async () => {
    const previous = { homeAccountId: "previous-account" };
    const selected = { homeAccountId: "selected-account" };
    mocks.accounts.mockResolvedValue([previous, selected]);
    mocks.interactive.mockResolvedValue({ account: selected, accessToken: "test-only" });
    await auth().signIn();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(previous);
  });

  it("preserves an unreadable protected cache until explicit sign-in replaces it", async () => {
    const service = auth();
    const directory = directories.at(-1)!;
    const file = join(directory, "msal-cache.bin");
    const protectedBytes = Buffer.from("synthetic-unreadable-protected-cache");
    writeFileSync(file, protectedBytes);
    const context = { tokenCache: { deserialize: vi.fn() }, cacheHasChanged: false } as TokenCacheContext;
    mocks.accounts.mockImplementation(async () => {
      await mocks.config?.cache?.cachePlugin?.beforeCacheAccess(context);
      return [];
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await service.getCachedState()).toMatchObject({ signedIn: false, checking: false,
      message: expect.stringContaining("could not be unlocked") });
    expect(readFileSync(file)).toEqual(protectedBytes);
    mocks.interactive.mockResolvedValue({ account: { homeAccountId: "demo-account" }, accessToken: "test-only" });
    await service.signIn();
    expect(existsSync(file)).toBe(false);
    log.mockRestore();
  });
});

describe("MSAL loopback lifecycle", () => {
  it("preserves client_info for MSAL token redemption and redirects away from the authorization code", async () => {
    const controller = new AbortController();
    const loopback = new AuthLoopback("expected-state", controller.signal);
    try {
      const listening = loopback.listenForAuthCode();
      await vi.waitFor(() => expect(loopback.getRedirectUri()).toContain("localhost:"));
      const uri = loopback.getRedirectUri().replace("localhost", "127.0.0.1");
      const response = await fetch(`${uri}/?code=test-only&state=expected-state&client_info=test-only-client-info`, { redirect: "manual" });
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/complete");
      expect(await listening).toEqual({ code: "test-only", state: "expected-state", client_info: "test-only-client-info" });
    } finally { loopback.closeServer(); }
  });

  it("rejects unrelated callbacks and releases the loopback server on cancellation", async () => {
    const controller = new AbortController();
    const loopback = new AuthLoopback("expected-state", controller.signal);
    const listening = loopback.listenForAuthCode();
    const rejection = expect(listening).rejects.toThrow("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const uri = loopback.getRedirectUri().replace("localhost", "127.0.0.1");
    const response = await fetch(`${uri}/?code=test-only&state=wrong`);
    expect(response.status).toBe(400);
    controller.abort();
    await rejection;
    expect(() => loopback.getRedirectUri()).toThrow("not ready");
  });
});
