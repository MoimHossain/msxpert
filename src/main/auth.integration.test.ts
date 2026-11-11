import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { shell } from "electron";
import { AuthService } from "./auth";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("completes MSX-only PKCE with the real MSAL client, loopback callback, and isolated token cache", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mcaps-real-msal-"));
  const localFetch = globalThis.fetch;
  const tenant = "00000000-0000-4000-8000-000000000001";
  const uid = "00000000-0000-4000-8000-000000000002";
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const clientInfo = encode({ uid, utid: tenant });
  let browserRequest: URL | null = null;
  let tokenRequests = 0;
  vi.mocked(shell.openExternal).mockImplementation(async (url) => {
    browserRequest = new URL(url);
    expect(browserRequest.searchParams.get("scope")?.split(" ").filter((scope) => scope.startsWith("https://")))
      .toEqual(["https://microsoftsales.crm.dynamics.com/.default"]);
    expect(browserRequest.searchParams.get("code_challenge_method")).toBe("S256");
    const redirect = new URL(browserRequest.searchParams.get("redirect_uri")!);
    redirect.hostname = "127.0.0.1";
    redirect.search = new URLSearchParams({
      code: "synthetic-authorization-code", state: browserRequest.searchParams.get("state")!, client_info: clientInfo,
    }).toString();
    const response = await localFetch(redirect, { redirect: "manual" });
    expect(response.status).toBe(303);
  });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.hostname).toBe("login.microsoftonline.com");
    if (url.pathname.endsWith("/token")) {
      tokenRequests++;
      const body = new URLSearchParams(String(options?.body));
      expect(body.get("code_verifier")).toBeTruthy();
      expect(body.get("code")).toBe("synthetic-authorization-code");
      const idToken = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
        aud: body.get("client_id"), iss: `https://login.microsoftonline.com/${tenant}/v2.0`,
        tid: tenant, oid: uid, sub: uid, name: "Synthetic user", preferred_username: "demo@example.invalid",
        nonce: browserRequest?.searchParams.get("nonce"), iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })}.synthetic-signature`;
      return Response.json({
        token_type: "Bearer", scope: body.get("scope"), expires_in: 3600,
        access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token",
        id_token: idToken, client_info: clientInfo,
      });
    }
    if (url.pathname.includes("/discovery/instance")) return Response.json({
      tenant_discovery_endpoint: "https://login.microsoftonline.com/organizations/v2.0/.well-known/openid-configuration",
      metadata: [{
        preferred_network: "login.microsoftonline.com", preferred_cache: "login.windows.net",
        aliases: ["login.microsoftonline.com", "login.windows.net", "sts.windows.net"],
      }],
    });
    return Response.json({
      authorization_endpoint: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
      token_endpoint: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
      end_session_endpoint: "https://login.microsoftonline.com/organizations/oauth2/v2.0/logout",
      issuer: "https://login.microsoftonline.com/{tenantid}/v2.0",
      jwks_uri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
    });
  }));
  try {
    const auth = new AuthService(directory);
    await auth.signIn();
    expect(tokenRequests).toBe(1);
    expect(await auth.getAccountKey()).toBe(`${uid}.${tenant}`);
    expect((await auth.getState()).signedIn).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
