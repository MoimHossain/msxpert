import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LogLevel,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { safeStorage, shell } from "electron";
import type { AuthState } from "../shared/types";

const CLIENT_ID = "2ad88395-b77d-4561-9441-d0e40824f9bc";
const AUTHORITY = "https://login.microsoftonline.com/organizations";
const SCOPES = ["https://microsoftsales.crm.dynamics.com/.default"];

function atomicWrite(path: string, data: Buffer): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, data);
  renameSync(temporary, path);
}

class ProtectedCachePlugin implements ICachePlugin {
  private readonly path: string;

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
    } catch (error) {
      rmSync(this.path, { force: true });
      context.tokenCache.deserialize("{}");
    }
  }

  async afterCacheAccess(context: TokenCacheContext): Promise<void> {
    if (!context.cacheHasChanged) return;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Windows data protection is unavailable.");
    }
    atomicWrite(this.path, safeStorage.encryptString(context.tokenCache.serialize()));
  }

  clear(): void {
    rmSync(this.path, { force: true });
  }
}

export class AuthService {
  private readonly client: PublicClientApplication;
  private readonly cache: ProtectedCachePlugin;

  constructor(dataDirectory: string) {
    this.cache = new ProtectedCachePlugin(dataDirectory);
    const configuration: Configuration = {
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
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
      },
    };
    this.client = new PublicClientApplication(configuration);
  }

  private async firstAccount(): Promise<AccountInfo | null> {
    const accounts = await this.client.getTokenCache().getAllAccounts();
    return accounts[0] ?? null;
  }

  async getState(userId: string | null = null): Promise<AuthState> {
    const account = await this.firstAccount();
    return {
      signedIn: Boolean(account),
      name: account?.name ?? null,
      username: account?.username ?? null,
      userId,
    };
  }

  private async interactive(): Promise<AuthenticationResult> {
    const result = await this.client.acquireTokenInteractive({
      scopes: SCOPES,
      openBrowser: async (url) => {
        await shell.openExternal(url);
      },
      successTemplate:
        "<html><body style=\"font-family:system-ui;padding:48px;background:#111827;color:#f9fafb\">" +
        "<h1>Signed in to MCAPS Console</h1><p>You can close this window and return to the app.</p>" +
        "</body></html>",
      errorTemplate:
        "<html><body style=\"font-family:system-ui;padding:48px;background:#111827;color:#f9fafb\">" +
        "<h1>Sign-in failed</h1><p>{{error}}</p></body></html>",
    });
    if (!result) throw new Error("Authentication completed without a result.");
    return result;
  }

  async signIn(): Promise<string> {
    return (await this.interactive()).accessToken;
  }

  async getAccessToken(): Promise<string> {
    const account = await this.firstAccount();
    if (!account) throw new Error("Sign in to MSX before using this feature.");
    try {
      const result = await this.client.acquireTokenSilent({
        scopes: SCOPES,
        account,
      });
      return result.accessToken;
    } catch {
      return (await this.interactive()).accessToken;
    }
  }

  async signOut(): Promise<AuthState> {
    const tokenCache = this.client.getTokenCache();
    const accounts = await tokenCache.getAllAccounts();
    for (const account of accounts) {
      await tokenCache.removeAccount(account);
    }
    this.cache.clear();
    return this.getState();
  }
}
