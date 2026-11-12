import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  clients: [] as Record<string, unknown>[],
  sessions: [] as Record<string, unknown>[],
  status: { version: "1.0.109", protocolVersion: 1 },
  auth: { isAuthenticated: true, authType: "user", login: "test-login" },
  answer: true,
  deleted: vi.fn(), stopped: vi.fn(),
}));
vi.mock("@github/copilot-sdk", () => ({
  RuntimeConnection: { forStdio: (options: unknown) => options },
  CopilotClient: class {
    constructor(options: Record<string, unknown>) { sdk.clients.push(options); }
    start = async () => {};
    getStatus = async () => sdk.status;
    getAuthStatus = async () => sdk.auth;
    createSession = async (options: Record<string, unknown>) => {
      sdk.sessions.push(options);
      return {
        sessionId: "test-session",
        sendAndWait: async ({ prompt }: { prompt: string }) => ({
          data: { content: sdk.answer ? prompt.match(/MCAPS_AI_OK_[a-z0-9]+/)?.[0] : "An unexpected answer" },
        }),
      };
    };
    deleteSession = sdk.deleted;
    forceStop = sdk.stopped;
  },
}));
import { connectionEnvironment, readWorkiqTestResult, testCopilot, unpackedRuntimePath, workiqCommand, workiqTestCall } from "./ai-runtime";

const directories: string[] = [];
afterEach(() => {
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  sdk.clients.length = 0; sdk.sessions.length = 0;
  sdk.auth = { isAuthenticated: true, authType: "user", login: "test-login" };
  sdk.answer = true;
  sdk.status.version = "1.0.109";
  vi.clearAllMocks();
});

describe("isolated Copilot test", () => {
  it("makes a nonce-verified LLM call with no tools or ambient discovery and deletes only its owned session", async () => {
    const evidence = await testCopilot({ runtimePath: "", model: "test-model" }, new AbortController().signal);
    expect(evidence.response).toMatch(/^MCAPS_AI_OK_/);
    expect(sdk.clients[0]).toMatchObject({ mode: "empty", useLoggedInUser: true, logLevel: "none" });
    const options = sdk.sessions[0];
    expect(options).toMatchObject({
      model: "test-model", allowedModels: ["test-model"], availableTools: [],
      mcpServers: {}, enableConfigDiscovery: false, enableSkills: false, enableFileHooks: false,
      enableHostGitOperations: false, enableSessionStore: false,
    });
    const handler = options?.onPermissionRequest as () => unknown;
    expect(handler()).toEqual({ kind: "denied-by-rules", rules: [] });
    expect(sdk.deleted).toHaveBeenCalledWith("test-session");
    expect(sdk.stopped).toHaveBeenCalledOnce();
  });

  it("does not infer success from auth/handshake or accept an unexpected reply", async () => {
    sdk.answer = false;
    await expect(testCopilot({ runtimePath: "", model: "" }, new AbortController().signal)).rejects.toThrow("expected test response");
    expect(sdk.deleted).toHaveBeenCalledOnce();
    expect(sdk.stopped).toHaveBeenCalledOnce();
  });

  it("rejects ambient API-key auth and old runtimes before sending a prompt", async () => {
    sdk.auth.authType = "env";
    await expect(testCopilot({ runtimePath: "", model: "" }, new AbortController().signal)).rejects.toThrow("official Copilot CLI");
    sdk.auth.authType = "user";
    sdk.status.version = "1.0.106";
    await expect(testCopilot({ runtimePath: "", model: "" }, new AbortController().signal)).rejects.toThrow("too old");
    expect(sdk.sessions).toHaveLength(0);
  });

  it("does not forward developer tokens, provider overrides, runtime overrides, Node hooks or telemetry exporters", () => {
    expect(connectionEnvironment({
      PATH: "safe-path", APPDATA: "profile", HTTPS_PROXY: "proxy", GITHUB_TOKEN: "secret", GH_TOKEN: "secret",
      COPILOT_GITHUB_TOKEN: "secret", NODE_OPTIONS: "--require unsafe", ELECTRON_RUN_AS_NODE: "1",
      COPILOT_CLI_PATH: "unsafe", COPILOT_HOME: "unsafe", OPENAI_API_KEY: "secret", OTEL_EXPORTER_OTLP_ENDPOINT: "unsafe",
    })).toEqual({
      PATH: "safe-path", APPDATA: "profile", HTTPS_PROXY: "proxy",
      COPILOT_TELEMETRY_DISABLED: "true", DO_NOT_TRACK: "1",
    });
  });

  it("uses the unpacked executable location when distributed inside Electron ASAR", () => {
    expect(unpackedRuntimePath("C:\\MCAPS\\resources\\app.asar\\node_modules\\runtime.exe"))
      .toBe("C:\\MCAPS\\resources\\app.asar.unpacked\\node_modules\\runtime.exe");
    expect(unpackedRuntimePath("C:\\dev\\node_modules\\runtime.exe")).toBe("C:\\dev\\node_modules\\runtime.exe");
  });

  it("still stops its child after session deletion fails and refuses to report success", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    sdk.deleted.mockRejectedValueOnce(new Error("Cannot delete session"));
    try {
      await expect(testCopilot({ runtimePath: "", model: "" }, new AbortController().signal)).rejects.toThrow("could not be cleaned up");
      expect(sdk.stopped).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });
});

describe("existing official Work IQ client", () => {
  it("resolves official npm shims without executing a shell or downloading anything", () => {
    const root = mkdtempSync(join(tmpdir(), "mcaps-workiq-package-"));
    directories.push(root);
    const packageRoot = join(root, "node_modules", "@microsoft", "workiq");
    mkdirSync(join(packageRoot, "bin"), { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@microsoft/workiq", bin: { workiq: "bin/workiq.js" } }));
    writeFileSync(join(packageRoot, "bin", "workiq.js"), "");
    writeFileSync(join(root, "workiq.cmd"), "THIS MUST NEVER EXECUTE");
    const result = workiqCommand(join(root, "workiq.cmd"), {});
    expect(result.command).toBe(process.execPath);
    expect(result.args).toEqual([join(packageRoot, "bin", "workiq.js")]);
    expect(result.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(() => workiqCommand("workiq --evil", {})).toThrow("absolute path");
  });

  it("builds a fixed synthetic call only from an actually discovered supported question schema", () => {
    const tool = { name: "ask_work_iq", inputSchema: { properties: { question: { type: "string" } }, required: ["question"] } };
    expect(workiqTestCall([tool], "MCAPS_TEST")).toEqual({
      name: tool.name, arguments: { question: expect.stringContaining("MCAPS_TEST") },
    });
    expect(() => workiqTestCall([{ ...tool, name: "delete_entity" }], "MCAPS_TEST")).toThrow("No query was sent");
    expect(() => workiqTestCall([{ ...tool, inputSchema: { required: ["question", "agentId"] } }], "MCAPS_TEST")).toThrow("No query was sent");
  });

  it("rejects nested MCP errors, empty results and handshake-only success", () => {
    expect(() => readWorkiqTestResult({ isError: true, content: [{ type: "text", text: "403 policy denied; token=secret" }] }, "OK")).toThrow("denied");
    expect(() => readWorkiqTestResult({ content: [] }, "OK")).toThrow("expected service response");
    expect(() => readWorkiqTestResult({ content: [{ type: "text", text: '{"error":{"status":429}}' }] }, "OK")).toThrow("expected service response");
    expect(() => readWorkiqTestResult({
      content: [{ type: "text", text: "OK" }], structuredContent: { error: { status: 429 } },
    }, "OK")).toThrow("service error");
    expect(readWorkiqTestResult({ content: [{ type: "text", text: "MCAPS_OK" }] }, "MCAPS_OK")).toBe("MCAPS_OK");
  });
});
