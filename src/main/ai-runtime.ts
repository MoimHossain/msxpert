import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve, delimiter } from "node:path";
import { homedir, tmpdir } from "node:os";
import { coerce, gte } from "semver";
import { CopilotClient, RuntimeConnection } from "@github/copilot-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { ConnectionError, type ConnectionEvidence, type ConnectionRunners } from "./ai-service";
import type { AiConfiguration, WorkiqConfiguration } from "../shared/ai";

// Keep OS/proxy settings and official credential stores, not developer tokens,
// alternate providers, Node injection, telemetry exporters, or personal COPILOT_HOME.
export function connectionEnvironment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|HOMEDRIVE|HOMEPATH|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR)$/i;
  const env = Object.fromEntries(Object.entries(source).filter(
    (entry): entry is [string, string] => allowed.test(entry[0]) && entry[1] !== undefined,
  ));
  env.COPILOT_TELEMETRY_DISABLED = "true";
  env.DO_NOT_TRACK = "1";
  return env;
}

export async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

function executable(path: string): string {
  if (!isAbsolute(path) || extname(path).toLowerCase() !== ".exe" || !existsSync(path) || !statSync(path).isFile()) {
    throw new ConnectionError("Choose an existing, absolute path to the trusted client's .exe file, or leave it blank for automatic setup.");
  }
  return path;
}

export function unpackedRuntimePath(path: string): string {
  return path.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
}

function bundledCopilotPath(): string {
  try {
    const root = dirname(require.resolve(`@github/copilot-sdk-${process.platform}-${process.arch}/package.json`));
    return unpackedRuntimePath(join(root, "prebuilds", `${process.platform}-${process.arch}`,
      process.platform === "win32" ? "copilot-runtime.exe" : "copilot-runtime"));
  } catch {
    throw new ConnectionError("The bundled Copilot runtime is missing. Repair the MCAPS installation or select an existing compatible official Copilot .exe.");
  }
}

function explainFailure(error: unknown, service: "Copilot" | "Work IQ"): never {
  if (error instanceof ConnectionError) throw error;
  const text = error instanceof Error ? error.message : "";
  if (/eula|license agreement|terms.*accept/i.test(text)) {
    throw new ConnectionError("Open the official Work IQ client and review its license agreement yourself, then retry.");
  }
  if (/429|throttl|rate.limit|quota|credit|allowance/i.test(text)) {
    throw new ConnectionError(`${service} reported throttling or a usage limit. Check your allowance and retry later. The test was not automatically replayed.`);
  }
  if (/401|unauth|not.*logged|not.*signed|sign.in|authentication|AADSTS/i.test(text)) {
    throw new ConnectionError(`${service} needs sign-in. Sign in through the official ${service === "Copilot" ? "Copilot CLI (copilot login)" : "Work IQ client"} and retry. MSX sign-in is separate.`);
  }
  if (/403|consent|forbidden|policy|permission|access.denied/i.test(text)) {
    throw new ConnectionError(`${service} access was denied by permissions or policy. Use the existing approved client or contact your administrator; MCAPS will not add scopes or switch identities.`);
  }
  if (/ENOENT|not found|spawn|missing.*runtime/i.test(text)) {
    throw new ConnectionError(`${service} could not start. Check the configured official installation path and retry.`);
  }
  throw new ConnectionError(`${service} could not complete its test. Check its official client for sign-in, installation or network errors and retry.`);
}

export async function testCopilot(config: AiConfiguration, signal: AbortSignal): Promise<ConnectionEvidence> {
  const runtimePath = config.runtimePath ? executable(config.runtimePath) : bundledCopilotPath();
  const directory = mkdtempSync(join(tmpdir(), "mcaps-ai-test-"));
  const env = connectionEnvironment();
  const client = new CopilotClient({
    mode: "empty",
    connection: RuntimeConnection.forStdio({ path: runtimePath }),
    env,
    baseDirectory: join(homedir(), ".copilot"),
    workingDirectory: directory,
    logLevel: "none",
    useLoggedInUser: true,
  });
  let sessionId: string | null = null;
  let failure: unknown;
  try {
    await abortable(client.start(), signal);
    const status = await abortable(client.getStatus(), signal);
    const version = coerce(status.version);
    if (!version || !gte(version, "1.0.109")) {
      throw new ConnectionError("This Copilot runtime is too old for isolated tests. Clear the custom path to use the bundled compatible runtime, or update your official CLI.");
    }
    const auth = await abortable(client.getAuthStatus(), signal);
    if (!auth.isAuthenticated || !auth.login || !["user", "gh-cli"].includes(auth.authType ?? "")) {
      throw new ConnectionError("Sign in to your authorized account with the official Copilot CLI (copilot login), then retry. MCAPS does not use API keys or inherited token variables.");
    }
    const marker = `MCAPS_AI_OK_${randomUUID().replaceAll("-", "")}`;
    const session = await abortable(client.createSession({
      clientName: "MCAPS Console connection test",
      ...(config.model ? { model: config.model, allowedModels: [config.model] } : {}),
      workingDirectory: directory,
      availableTools: [],
      tools: [],
      excludedTools: ["builtin:*", "mcp:*", "custom:*"],
      mcpServers: {},
      customAgents: [],
      enableConfigDiscovery: false,
      enableSkills: false,
      enableFileHooks: false,
      enableHostGitOperations: false,
      enableSessionStore: false,
      enableSessionTelemetry: false,
      enableFileChangeTracking: false,
      enableOnDemandInstructionDiscovery: false,
      enableExperimentalMode: false,
      embeddingCacheStorage: "in-memory",
      skipEmbeddingRetrieval: true,
      infiniteSessions: { enabled: false },
      memory: { enabled: false },
      skipCustomInstructions: true,
      onPermissionRequest: () => ({ kind: "denied-by-rules", rules: [] }),
    }), signal);
    sessionId = session.sessionId;
    const response = await abortable(session.sendAndWait({
      prompt: `Connectivity test only. Reply with exactly ${marker}. Do not use any tools, read data, search, delegate, or make changes.`,
    }, 60_000), signal);
    if (response?.data.content.trim() !== marker) {
      throw new ConnectionError("The LLM did not return the expected test response. Access has not been marked successful; retry or select another permitted model.");
    }
    return {
      response: response.data.content,
      identity: auth.login,
      details: `Copilot runtime ${status.version}. ${config.model ? `Requested model: ${config.model}.` : "Runtime-selected model."} No tools or customer context were supplied.`,
    };
  } catch (error) {
    failure = error;
    signal.throwIfAborted();
    return explainFailure(error, "Copilot");
  } finally {
    let cleanupFailed = false;
    if (sessionId) {
      try { await abortable(client.deleteSession(sessionId), AbortSignal.timeout(5_000)); }
      catch { cleanupFailed = true; console.error("AI_TEST_SESSION_CLEANUP_FAILED"); }
    }
    try { await client.forceStop(); }
    catch { cleanupFailed = true; console.error("AI_RUNTIME_CLEANUP_FAILED"); }
    try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { cleanupFailed = true; console.error("AI_TEST_DIRECTORY_CLEANUP_FAILED"); }
    if (cleanupFailed && !failure && !signal.aborted) {
      throw new ConnectionError("The test ran, but its runtime or temporary data could not be cleaned up. Access has not been marked successful.");
    }
  }
}

const packageSchema = z.object({
  name: z.literal("@microsoft/workiq"),
  bin: z.union([z.string(), z.object({ workiq: z.string() })]),
});

function officialWorkiqEntry(root: string): string {
  const metadata = packageSchema.parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  const entry = resolve(root, typeof metadata.bin === "string" ? metadata.bin : metadata.bin.workiq);
  if (!entry.startsWith(`${resolve(root)}\\`) || !existsSync(entry) || !statSync(entry).isFile()) {
    throw new ConnectionError("The official Work IQ package has an invalid entry point.");
  }
  return entry;
}

export function workiqCommand(configured: string, env: Record<string, string>): { command: string; args: string[]; env: Record<string, string> } {
  let path = configured;
  if (!path) {
    const folders = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
    if (env.APPDATA) folders.push(join(env.APPDATA, "npm"));
    path = folders.flatMap((folder) => ["workiq.exe", "workiq.cmd", "workiq.ps1"].map((name) => join(folder, name)))
      .find((candidate) => existsSync(candidate)) ?? "";
    if (!path) throw new ConnectionError("No official local Work IQ installation was found. Select its existing executable or npm entry point. MCAPS does not install it or create an app registration.");
  }
  if (!isAbsolute(path)) throw new ConnectionError("Choose an absolute path to your existing official Work IQ installation.");
  if (extname(path).toLowerCase() === ".exe") return { command: executable(path), args: [], env };
  const extension = extname(path).toLowerCase();
  const root = extension === ".js" ? dirname(dirname(path)) : join(dirname(path), "node_modules", "@microsoft", "workiq");
  if (![".js", ".cmd", ".ps1"].includes(extension) || !existsSync(join(root, "package.json"))) {
    throw new ConnectionError("Select the official Work IQ .exe, npm shim, or bin\\workiq.js entry. Arbitrary scripts and shell commands are not supported.");
  }
  const entry = officialWorkiqEntry(root);
  if (extension === ".js" && resolve(path) !== entry) throw new ConnectionError("This script is not the official package's Work IQ entry point.");
  return { command: process.execPath, args: [entry], env: { ...env, ELECTRON_RUN_AS_NODE: "1" } };
}

const toolsSchema = z.array(z.object({
  name: z.string(), inputSchema: z.object({ properties: z.record(z.string(), z.unknown()).optional(), required: z.array(z.string()).optional() }).passthrough(),
}));

export function workiqTestCall(tools: unknown, marker: string): { name: string; arguments: Record<string, string> } {
  const definitions = toolsSchema.parse(tools);
  const tool = definitions.find((definition) => ["ask_work_iq", "ask"].includes(definition.name) &&
    z.object({ type: z.literal("string") }).passthrough().safeParse(definition.inputSchema.properties?.question).success &&
    (definition.inputSchema.required ?? []).every((field) => field === "question"));
  if (!tool) throw new ConnectionError("This Work IQ server does not expose a supported question-only test tool. No query was sent. Use a supported official local Work IQ installation.");
  return {
    name: tool.name,
    arguments: { question: `Connectivity test only: reply with exactly ${marker}. Do not retrieve, search, read organizational data, delegate to other agents, or perform any action.` },
  };
}

export function readWorkiqTestResult(result: unknown, marker: string): string {
  const parsed = z.object({
    isError: z.boolean().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
    structuredContent: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().parse(result);
  if (parsed.isError) explainFailure(new Error(parsed.content.map((block) => block.text ?? "").join("\n")), "Work IQ");
  const structured = parsed.structuredContent;
  if (structured && (structured.error || (Array.isArray(structured.errors) && structured.errors.length > 0) ||
      (typeof structured.statusCode === "number" && structured.statusCode >= 400))) {
    throw new ConnectionError("Work IQ returned a service error inside its response. Access has not been marked successful. Check the existing client's status and retry.");
  }
  const response = parsed.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n").trim();
  if (response !== marker) {
    throw new ConnectionError("Work IQ did not return the expected service response. A local MCP handshake alone does not count as successful access. Check sign-in, consent and billing in your existing official client.");
  }
  return response;
}

export async function testWorkiq(config: WorkiqConfiguration, signal: AbortSignal): Promise<ConnectionEvidence> {
  const launch = workiqCommand(config.executablePath, connectionEnvironment());
  const directory = mkdtempSync(join(tmpdir(), "mcaps-workiq-test-"));
  const transport = new StdioClientTransport({
    ...launch, args: [...launch.args, ...(config.tenantId ? ["--tenant-id", config.tenantId] : []), "mcp"],
    cwd: directory, stderr: "pipe", maxBufferSize: 1024 * 1024,
  });
  // Drain diagnostics without persisting or displaying possible tokens/content.
  transport.stderr?.on("data", () => {});
  const client = new Client({ name: "mcaps-console-connection-test", version: "1.0.0" }, { capabilities: {} });
  let failure: unknown;
  try {
    await abortable(client.connect(transport), signal);
    const tools = await abortable(client.listTools(), signal);
    const marker = `MCAPS_WORKIQ_OK_${randomUUID().replaceAll("-", "")}`;
    const call = workiqTestCall(tools.tools, marker);
    const result = await abortable(client.callTool(call, undefined, { signal, timeout: 90_000 }), signal);
    return {
      response: readWorkiqTestResult(result, marker),
      identity: null,
      details: `Official Work IQ MCP service round trip via ${call.name}. ${config.tenantId ? "Configured tenant." : "Official client's default tenant."} Its client owns authentication; this test does not verify the user's identity or organizational search permissions.`,
    };
  } catch (error) {
    failure = error;
    signal.throwIfAborted();
    return explainFailure(error, "Work IQ");
  } finally {
    let cleanupFailed = false;
    for (const close of [() => client.close(), () => transport.close()]) {
      try { await close(); }
      catch { cleanupFailed = true; console.error("WORKIQ_RUNTIME_CLEANUP_FAILED"); }
    }
    try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { cleanupFailed = true; console.error("WORKIQ_TEST_DIRECTORY_CLEANUP_FAILED"); }
    if (cleanupFailed && !failure && !signal.aborted) {
      throw new ConnectionError("The Work IQ test ran, but its client or temporary data could not be cleaned up. Access has not been marked successful.");
    }
  }
}

export const connectionRunners: ConnectionRunners = { ai: testCopilot, workiq: testWorkiq };
