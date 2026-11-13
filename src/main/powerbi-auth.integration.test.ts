import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { safeStorage, shell } from "electron";
import { PowerBiAuth, POWER_BI_CLIENT_ID, POWER_BI_SCOPE, powerBiScopeId } from "./powerbi-auth";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: vi.fn((value: string) => Buffer.from(Buffer.from(value).toString("base64"))),
    decryptString: (value: Buffer) => Buffer.from(value.toString(), "base64").toString(),
  },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.skipIf(process.platform !== "win32")(
  "uses real MSAL PKCE, a separate protected cache and only silent acquisition after recreating the client", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mcaps-powerbi-msal-"));
    const nativeFetch = globalThis.fetch;
    const tenant = "00000000-0000-4000-8000-000000000001";
    const uid = "00000000-0000-4000-8000-000000000002";
    const employee = { key: `${uid}.${tenant}`, upn: "demo@example.invalid", name: "Synthetic employee" };
    const other = { key: `00000000-0000-4000-8000-000000000003.${tenant}`,
      upn: "other@example.invalid", name: "Other employee" };
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const clientInfo = encode({ uid, utid: tenant });
    let browser: URL | null = null;
    vi.mocked(shell.openExternal).mockImplementation(async url => {
      browser = new URL(url);
      expect(browser.searchParams.get("client_id")).toBe(POWER_BI_CLIENT_ID);
      expect(browser.searchParams.get("scope")?.split(" ").filter(scope => scope.startsWith("https://")))
        .toEqual([POWER_BI_SCOPE]);
      expect(browser.searchParams.get("code_challenge_method")).toBe("S256");
      expect(browser.searchParams.get("prompt")).toBe("select_account");
      const callback = new URL(browser.searchParams.get("redirect_uri")!);
      callback.hostname = "127.0.0.1";
      callback.search = new URLSearchParams({ code: "synthetic-code", state: browser.searchParams.get("state")!,
        client_info: clientInfo }).toString();
      expect((await nativeFetch(callback, { redirect: "manual" })).status).toBe(303);
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("login.microsoftonline.com");
      if (url.pathname.endsWith("/token")) {
        const body = new URLSearchParams(String(options?.body));
        expect(body.get("client_id")).toBe(POWER_BI_CLIENT_ID);
        expect(body.get("code_verifier")).toBeTruthy();
        return Response.json({
          token_type: "Bearer", scope: body.get("scope"), expires_in: 3600,
          access_token: "synthetic-powerbi-token", refresh_token: "synthetic-powerbi-refresh",
          client_info: clientInfo,
          id_token: `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
            aud: POWER_BI_CLIENT_ID, iss: `https://login.microsoftonline.com/${tenant}/v2.0`,
            tid: tenant, oid: uid, sub: uid, name: employee.name, preferred_username: employee.upn,
            nonce: browser?.searchParams.get("nonce"), iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
          })}.synthetic-signature`,
        });
      }
      if (url.pathname.includes("/discovery/instance")) return Response.json({
        tenant_discovery_endpoint: "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
        metadata: [{ preferred_network: "login.microsoftonline.com", preferred_cache: "login.windows.net",
          aliases: ["login.microsoftonline.com", "login.windows.net", "sts.windows.net"] }],
      });
      return Response.json({
        authorization_endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        end_session_endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/logout",
        issuer: "https://login.microsoftonline.com/{tenantid}/v2.0",
        jwks_uri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
      });
    }));
    try {
      const first = new PowerBiAuth(directory);
      await first.connect(employee, new AbortController().signal);
      expect(safeStorage.encryptString).toHaveBeenCalled();
      expect(readdirSync(directory)).toEqual([`powerbi-${powerBiScopeId(employee)}.bin`]);
      expect(readFileSync(join(directory, readdirSync(directory)[0]!)).includes("synthetic-powerbi-token")).toBe(false);
      const restarted = new PowerBiAuth(directory);
      expect((await restarted.getToken(employee, new AbortController().signal)).token).toBe("synthetic-powerbi-token");
      expect(shell.openExternal).toHaveBeenCalledTimes(1);
      await expect(restarted.getToken(other, new AbortController().signal)).rejects.toThrow(/Connect Power BI/);
      expect(shell.openExternal).toHaveBeenCalledTimes(1);
      await expect(restarted.connect(other, new AbortController().signal)).rejects.toThrow(/same employee/);
      expect((await restarted.getToken(employee, new AbortController().signal)).user.username).toBe(employee.upn);
      await restarted.disconnect(other);
      expect((await restarted.getToken(employee, new AbortController().signal)).token).toBe("synthetic-powerbi-token");
      writeFileSync(join(directory, `powerbi-${powerBiScopeId(employee)}.bin`), "invalid-protected-cache");
      expect((await restarted.status(employee, new AbortController().signal)).error).toContain("could not be unlocked");
      await restarted.connect(employee, new AbortController().signal);
      expect((await restarted.getToken(employee, new AbortController().signal)).token).toBe("synthetic-powerbi-token");
      await restarted.disconnect(employee);
      await expect(new PowerBiAuth(directory).getToken(employee, new AbortController().signal)).rejects.toThrow(/Connect Power BI/);
      const cancelled = new AbortController();
      vi.mocked(shell.openExternal).mockImplementationOnce(async () => cancelled.abort(new Error("Synthetic sign-in cancellation")));
      await expect(restarted.connect(employee, cancelled.signal)).rejects.toThrow("Synthetic sign-in cancellation");
      await expect(restarted.getToken(employee, new AbortController().signal)).rejects.toThrow(/Connect Power BI/);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });
