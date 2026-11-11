import { createServer, type Server } from "node:http";
import type { ILoopbackClient } from "@azure/msal-node";

type AuthorizationResponse = Awaited<ReturnType<ILoopbackClient["listenForAuthCode"]>>;

// MSAL owns PKCE and code redemption. Its loopback interface lets us cancel
// the listener as well as the UI, rather than leaving abandoned sign-ins alive.
export class AuthLoopback implements ILoopbackClient {
  private server: Server | null = null;
  private reject: ((error: Error) => void) | null = null;

  constructor(private readonly state: string, private readonly signal: AbortSignal) {}

  listenForAuthCode(): Promise<AuthorizationResponse> {
    return new Promise((resolve, reject) => {
      this.reject = reject;
      if (this.signal.aborted) {
        reject(new Error("Sign-in cancelled."));
        return;
      }
      this.server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (request.method === "GET" && url.pathname === "/complete") {
          response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
            .end("Return to MCAPS Console to see the sign-in result. You can close this window.");
          return;
        }
        if (request.method !== "GET" || url.pathname !== "/" ||
            url.searchParams.get("state") !== this.state) {
          response.writeHead(400).end("Invalid sign-in callback.");
          return;
        }
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        if (!code && !error) {
          response.writeHead(400).end("Missing sign-in response.");
          return;
        }
        response.writeHead(303, {
          Location: "/complete",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        }).end();
        resolve(code ? { code, state: this.state } : { error: error ?? "access_denied", state: this.state });
      });
      this.server.once("error", () => reject(new Error("The local sign-in callback could not start.")));
      this.signal.addEventListener("abort", this.abort, { once: true });
      this.server.listen(0, "127.0.0.1");
    });
  }

  private readonly abort = () => {
    this.reject?.(new Error("Sign-in cancelled."));
    this.closeServer();
  };

  getRedirectUri(): string {
    const address = this.server?.address();
    if (!address || typeof address === "string") throw new Error("Sign-in listener is not ready.");
    return `http://localhost:${address.port}`;
  }

  closeServer(): void {
    this.signal.removeEventListener("abort", this.abort);
    this.server?.close();
    this.server?.closeAllConnections();
    this.server = null;
    this.reject = null;
  }
}
