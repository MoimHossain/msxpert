import { createHash, randomUUID } from "node:crypto";
import { LogLevel, PublicClientApplication, type AccountInfo } from "@azure/msal-node";
import { safeStorage, shell } from "electron";
import type { AcrConnection, AcrUser } from "../shared/acr";
import { AuthLoopback } from "./auth-loopback";
import { CacheUnlockError, ProtectedCachePlugin, signInFailure } from "./auth";

export const POWER_BI_CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
export const POWER_BI_AUTHORITY = "https://login.microsoftonline.com/common";
export const POWER_BI_SCOPE = "https://analysis.windows.net/powerbi/api/.default";

export interface PowerBiEmployee { key: string; upn: string; name: string }
export interface PowerBiToken { token: string; user: AcrUser }
export function powerBiScopeId(employee: PowerBiEmployee): string {
  return createHash("sha256").update(`powerbi:v1:${employee.key.toLowerCase()}`).digest("hex");
}
export class PowerBiSignInRequired extends Error {
  constructor(message = "Connect Power BI for the selected MSX employee before fetching ACR.") { super(message); }
}
function publicUser(account: AccountInfo): AcrUser {
  return { username: account.username, name: account.name ?? account.username };
}

export class PowerBiAuth {
  private readonly clients = new Map<string, { client: PublicClientApplication; cache: ProtectedCachePlugin }>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataDirectory: string) {}

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private entry(employee: PowerBiEmployee) {
    if (process.platform !== "win32" || !safeStorage.isEncryptionAvailable()) {
      throw new Error("Power BI token persistence requires Windows current-user data protection.");
    }
    const key = powerBiScopeId(employee);
    let entry = this.clients.get(key);
    if (!entry) {
      const cache = new ProtectedCachePlugin(this.dataDirectory, `powerbi-${key}.bin`,
        "The protected Power BI cache could not be unlocked. Select Connect Power BI to replace it.");
      const client = new PublicClientApplication({
        auth: { clientId: POWER_BI_CLIENT_ID, authority: POWER_BI_AUTHORITY },
        cache: { cachePlugin: cache },
        system: {
          loggerOptions: { logLevel: LogLevel.Warning, piiLoggingEnabled: false, loggerCallback: () => undefined },
          networkClient: {
            sendGetRequestAsync: <T>(url: string, options?: { headers?: Record<string, string> }) =>
              this.authRequest<T>(url, { method: "GET", ...options }),
            sendPostRequestAsync: <T>(url: string, options?: { headers?: Record<string, string>; body?: string }) =>
              this.authRequest<T>(url, { method: "POST", ...options }),
          },
        },
      });
      entry = { cache, client };
      this.clients.set(key, entry);
    }
    return entry;
  }

  private activeSignal: AbortSignal | null = null;
  private async authRequest<T>(url: string, options: RequestInit) {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.hostname !== "login.microsoftonline.com") {
      throw new Error("Power BI authentication returned an unexpected authority.");
    }
    const signal = this.activeSignal
      ? AbortSignal.any([this.activeSignal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
    const response = await fetch(url, { ...options, signal, redirect: "error" });
    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() as T };
  }

  getToken(employee: PowerBiEmployee, signal: AbortSignal, forceRefresh = false): Promise<PowerBiToken> {
    return this.exclusive(async () => {
      signal.throwIfAborted();
      this.activeSignal = signal;
      try {
        const { client } = this.entry(employee);
        const accounts = await client.getTokenCache().getAllAccounts();
        const matches = accounts.filter(account => account.homeAccountId.toLowerCase() === employee.key.toLowerCase());
        if (accounts.length !== 1 || matches.length !== 1) throw new PowerBiSignInRequired();
        const result = await client.acquireTokenSilent({ account: matches[0]!, scopes: [POWER_BI_SCOPE], forceRefresh });
        signal.throwIfAborted();
        if (!result?.accessToken || result.account?.homeAccountId.toLowerCase() !== employee.key.toLowerCase()) {
          throw new PowerBiSignInRequired("Power BI returned a different employee. Reconnect using the selected MSX employee.");
        }
        return { token: result.accessToken, user: publicUser(result.account) };
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof PowerBiSignInRequired || error instanceof CacheUnlockError) throw error;
        throw new PowerBiSignInRequired(`Power BI silent sign-in needs attention. ${signInFailure(error).message}`);
      } finally { this.activeSignal = null; }
    });
  }

  async status(employee: PowerBiEmployee, signal: AbortSignal): Promise<AcrConnection> {
    try {
      const { user } = await this.getToken(employee, signal);
      return { connected: true, user, error: null };
    } catch (error) {
      signal.throwIfAborted();
      return { connected: false, user: null, error: error instanceof Error ? error.message : "Power BI sign-in failed." };
    }
  }

  connect(employee: PowerBiEmployee, signal: AbortSignal): Promise<AcrUser> {
    return this.exclusive(async () => {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
      bounded.throwIfAborted();
      this.activeSignal = bounded;
      const state = randomUUID();
      const loopback = new AuthLoopback(state, bounded);
      try {
        const { client, cache } = this.entry(employee);
        try { await client.getTokenCache().getAllAccounts(); } catch (error) {
          if (!(error instanceof CacheUnlockError)) throw error;
          cache.clear();
        }
        const result = await client.acquireTokenInteractive({
          scopes: [POWER_BI_SCOPE], loginHint: employee.upn, prompt: "select_account", state,
          loopbackClient: loopback,
          openBrowser: async url => { bounded.throwIfAborted(); await shell.openExternal(url); },
        });
        bounded.throwIfAborted();
        if (!result?.account || !result.accessToken) throw new PowerBiSignInRequired("Power BI returned no employee or access token.");
        const tokenCache = client.getTokenCache();
        if (result.account.homeAccountId.toLowerCase() !== employee.key.toLowerCase()) {
          await tokenCache.removeAccount(result.account);
          throw new PowerBiSignInRequired("Choose the same employee used to sign in to MSX, then reconnect Power BI.");
        }
        for (const account of await tokenCache.getAllAccounts()) {
          if (account.homeAccountId !== result.account.homeAccountId || account.tenantId !== result.account.tenantId) {
            await tokenCache.removeAccount(account);
          }
        }
        return publicUser(result.account);
      } catch (error) {
        if (bounded.aborted) {
          this.clients.get(powerBiScopeId(employee))?.cache.clear();
          this.clients.delete(powerBiScopeId(employee));
          if (signal.aborted) signal.throwIfAborted();
          throw new Error("Power BI sign-in timed out. Select Connect Power BI to retry.");
        }
        if (error instanceof PowerBiSignInRequired || error instanceof CacheUnlockError) throw error;
        throw signInFailure(error);
      } finally {
        loopback.closeServer();
        this.activeSignal = null;
      }
    });
  }

  disconnect(employee: PowerBiEmployee): Promise<void> {
    return this.exclusive(async () => {
      const { cache } = this.entry(employee);
      cache.clear();
      this.clients.delete(powerBiScopeId(employee));
    });
  }
}
