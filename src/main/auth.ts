import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  LogLevel,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { safeStorage, shell } from "electron";
import type { AuthState } from "../shared/types";
import { loadConnectionConfig, type ConnectionConfig } from "./connection-config";
import { AuthLoopback } from "./auth-loopback";

export class AuthRequiredError extends Error {
  constructor() { super("Your MSX session needs attention. Sign in with MSX to continue."); }
}

class CacheUnlockError extends Error {}
const CACHE_RECOVERY_MESSAGE = "The protected sign-in cache could not be unlocked. Select Sign in with MSX to replace it.";

function atomicWrite(path: string, data: Buffer): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, data);
  renameSync(temporary, path);
}

class ProtectedCachePlugin implements ICachePlugin {
  private readonly path: string;
  needsRecovery = false;

  constructor(dataDirectory: string) {
    this.path = join(dataDirectory, "msal-cache.bin");
  }

  async beforeCacheAccess(context: TokenCacheContext): Promise<void> {
    let protectedCache: Buffer;
    try {
      protectedCache = readFileSync(this.path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        context.tokenCache.deserialize("{}");
        return;
      }
      throw new Error("The protected sign-in cache could not be read.", { cause: error });
    }

    try {
      const serialized = safeStorage.decryptString(protectedCache);
      context.tokenCache.deserialize(serialized);
    } catch {
      console.error("AUTH_CACHE_UNREADABLE");
      this.needsRecovery = true;
      throw new CacheUnlockError(CACHE_RECOVERY_MESSAGE);
    }
  }

  async afterCacheAccess(context: TokenCacheContext): Promise<void> {
    if (this.needsRecovery) throw new CacheUnlockError(CACHE_RECOVERY_MESSAGE);
    if (!context.cacheHasChanged) return;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Windows data protection is unavailable.");
    }
    atomicWrite(this.path, safeStorage.encryptString(context.tokenCache.serialize()));
  }

  clear(): void {
    rmSync(this.path, { force: true });
    this.needsRecovery = false;
  }
}

export class AuthService {
  private readonly client: PublicClientApplication;
  private readonly cache: ProtectedCachePlugin;
  private activeSignIn: AbortController | null = null;
  private readonly scopes: string[];
  private readonly graphScopes = ["https://graph.microsoft.com/User.Read"];

  constructor(dataDirectory: string, connection: ConnectionConfig = loadConnectionConfig(dataDirectory)) {
    this.cache = new ProtectedCachePlugin(dataDirectory);
    this.scopes = [`${connection.resourceUrl.replace(/\/$/, "")}/user_impersonation`];
    const configuration: Configuration = {
      auth: {
        clientId: connection.clientId,
        authority: `https://login.microsoftonline.com/${connection.tenant}`,
      },
      cache: {
        cachePlugin: this.cache,
      },
      system: {
        loggerOptions: {
          logLevel: LogLevel.Warning,
          piiLoggingEnabled: false,
          loggerCallback: () => undefined,
        },
        networkClient: {
          sendGetRequestAsync: async <T>(url: string, options?: { headers?: Record<string, string> }) =>
            this.authRequest<T>(url, { method: "GET", ...options }),
          sendPostRequestAsync: async <T>(url: string, options?: { headers?: Record<string, string>; body?: string }) =>
            this.authRequest<T>(url, { method: "POST", ...options }),
        },
      },
    };
    this.client = new PublicClientApplication(configuration);
  }

  private async authRequest<T>(url: string, options: RequestInit) {
    const signal = this.activeSignIn ? AbortSignal.any([this.activeSignIn.signal, AbortSignal.timeout(30000)]) :
      AbortSignal.timeout(30000);
    const response = await fetch(url, { ...options, signal });
    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() as T };
  }

  private async firstAccount(): Promise<AccountInfo | null> {
    try {
      const accounts = await this.client.getTokenCache().getAllAccounts();
      return accounts[0] ?? null;
    } catch (error) {
      if (error instanceof CacheUnlockError) return null;
      throw error;
    }
  }

  async getAccountKey(): Promise<string | null> {
    return (await this.firstAccount())?.homeAccountId ?? null;
  }

  async getCachedState(): Promise<AuthState> {
    const account = await this.firstAccount();
    return { signedIn: false, checking: Boolean(account), name: account?.name ?? null,
      username: account?.username ?? null, userId: null,
      message: this.cache.needsRecovery ? CACHE_RECOVERY_MESSAGE : null };
  }

  async getState(userId: string | null = null): Promise<AuthState> {
    const account = await this.firstAccount();
    let message: string | null = this.cache.needsRecovery ? CACHE_RECOVERY_MESSAGE : null;
    let signedIn = false;
    if (account) {
      try {
        await this.getAccessToken();
        signedIn = true;
      } catch {
        message = "Your saved MSX session could not be renewed. Sign in with MSX to retry.";
      }
    }
    return {
      signedIn,
      name: account?.name ?? null,
      username: account?.username ?? null,
      userId,
      message,
    };
  }

  private async interactive(controller: AbortController): Promise<AuthenticationResult> {
    const state = randomUUID();
    const result = await this.client.acquireTokenInteractive({
      scopes: this.scopes,
      extraScopesToConsent: this.graphScopes,
      state,
      loopbackClient: new AuthLoopback(state, controller.signal),
      openBrowser: async (url) => {
        controller.signal.throwIfAborted();
        await shell.openExternal(url);
      },
    });
    if (!result) throw new Error("Authentication completed without a result.");
    return result;
  }

  async signIn(): Promise<void> {
    if (this.activeSignIn) throw new Error("A sign-in is already in progress.");
    if (this.cache.needsRecovery) this.cache.clear();
    const controller = new AbortController();
    this.activeSignIn = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);
    try {
      const result = await this.interactive(controller);
      controller.signal.throwIfAborted();
      if (!result.account) throw new Error("The sign-in did not return an account.");
      const cache = this.client.getTokenCache();
      for (const account of await cache.getAllAccounts()) {
        if (account.homeAccountId !== result.account.homeAccountId) await cache.removeAccount(account);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        await this.signOut();
        throw new Error(timedOut ? "Sign-in timed out. Select Sign in with MSX to retry." : "Sign-in cancelled. You can try again.");
      }
      const code = error instanceof Error && "errorCode" in error ? String(error.errorCode) : "";
      throw new Error(code === "access_denied" ? "Sign-in was declined. Select Sign in with MSX to retry." :
        "Sign-in failed. Check your connection, tenant/client configuration, MSX access, and delegated Graph User.Read consent, then retry.");
    } finally {
      clearTimeout(timer);
      this.activeSignIn = null;
    }
  }

  cancelSignIn(): void { this.activeSignIn?.abort(); }

  async getAccessToken(forceRefresh = false): Promise<string> {
    return this.acquireSilent(this.scopes, forceRefresh);
  }

  async getGraphAccessToken(forceRefresh = false): Promise<string> {
    return this.acquireSilent(this.graphScopes, forceRefresh);
  }

  private async acquireSilent(scopes: string[], forceRefresh: boolean): Promise<string> {
    const account = await this.firstAccount();
    if (!account) throw new AuthRequiredError();
    try {
      const result = await this.client.acquireTokenSilent({
        scopes,
        account,
        forceRefresh,
      });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) throw new AuthRequiredError();
      throw new Error("The sign-in session could not be renewed. Check your connection and sign in again.");
    }
  }

  async signOut(): Promise<AuthState> {
    const tokenCache = this.client.getTokenCache();
    try {
      const accounts = await tokenCache.getAllAccounts();
      for (const account of accounts) {
        await tokenCache.removeAccount(account);
      }
    } catch (error) {
      if (!(error instanceof CacheUnlockError)) throw error;
    }
    this.cache.clear();
    return this.getState();
  }
}
