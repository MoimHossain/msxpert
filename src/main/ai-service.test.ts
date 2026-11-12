import { afterEach, describe, expect, it, vi } from "vitest";
import { AiService, ConnectionError, type ConnectionEvidence, type ConnectionRunners } from "./ai-service";
import type { VaultStore } from "./storage/vault";

function fixture(runners: Partial<ConnectionRunners> = {}, timeout = 120_000) {
  const data = new Map<string, unknown>();
  const store: Pick<VaultStore, "get" | "put" | "delete"> = {
    get: <T>(kind: string, id: string) => (data.get(`${kind}:${id}`) as T | undefined) ?? null,
    put: (kind, id, value) => { data.set(`${kind}:${id}`, structuredClone(value)); },
    delete: (kind, id) => { data.delete(`${kind}:${id}`); },
  };
  const evidence: ConnectionEvidence = { response: "synthetic reply", identity: "test-login", details: "Synthetic only" };
  const mocks = {
    ai: vi.fn(runners.ai ?? (async () => evidence)),
    workiq: vi.fn(runners.workiq ?? (async () => ({ ...evidence, identity: null }))),
  };
  return { store, mocks, data, service: new AiService(store, mocks, timeout) };
}
const ai = { runtimePath: "", model: "" };
const workiq = { executablePath: "", tenantId: "" };
afterEach(() => vi.useRealTimers());

describe("AI connection configuration and real-test gate", () => {
  it("rejects Work IQ before LLM success and does not execute or save its configuration", async () => {
    const { service, mocks, data } = fixture();
    await expect(service.testWorkiq(workiq)).rejects.toThrow("Test AI access");
    expect(mocks.workiq).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
  });

  it("saves configuration through the vault, unlocks Work IQ only after response, and never restores stale success on restart", async () => {
    const { service, mocks, store, data } = fixture();
    await service.testAi({ ...ai, model: "test-model" });
    const result = await service.testWorkiq(workiq);
    expect(result.aiTest?.status).toBe("success");
    expect(result.workiqTest?.response).toBe("synthetic reply");
    expect(mocks.ai).toHaveBeenCalledWith({ ...ai, model: "test-model" }, expect.any(AbortSignal));
    expect(data.get("ai-connections:default")).toEqual({ ai: { ...ai, model: "test-model" }, workiq });
    expect(new AiService(store, mocks).getState().aiTest).toBeNull();
    expect(JSON.stringify([...data.values()])).not.toContain("synthetic reply");
    const copy = service.getState();
    copy.ai.model = "not-saved";
    expect(service.getState().ai.model).toBe("test-model");
  });

  it("invalidates both tests during an AI retest and keeps Work IQ locked after failure", async () => {
    const { service, mocks } = fixture();
    await service.testAi(ai);
    await service.testWorkiq(workiq);
    mocks.ai.mockRejectedValueOnce(new ConnectionError("Copilot access denied."));
    const result = await service.testAi({ ...ai, model: "different-model" });
    expect(result.aiTest).toMatchObject({ status: "error", message: "Copilot access denied." });
    expect(result.workiqTest).toBeNull();
    await expect(service.testWorkiq(workiq)).rejects.toThrow("Test AI access");
  });

  it("cancels the owned test, rejects concurrent tests, waits for cleanup and prevents late success", async () => {
    let cleanup = false;
    const { service, mocks } = fixture({
      ai: async (_config, signal) => {
        try {
          await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
          throw new Error("Unreachable");
        } finally { cleanup = true; }
      },
    });
    const pending = service.testAi(ai);
    expect(service.getState().testing).toBe("ai");
    await expect(service.testAi(ai)).rejects.toThrow("Stop the current");
    await service.disconnect();
    expect(cleanup).toBe(true);
    expect((await pending).aiTest?.status).toBe("cancelled");
    expect(service.getState().aiTest).toBeNull();
    expect(service.busy).toBe(false);
    expect(mocks.ai).toHaveBeenCalledOnce();
  });

  it("times out without retry and clears only app-owned settings on reset", async () => {
    vi.useFakeTimers();
    const { service, mocks, store } = fixture({
      ai: async (_config, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }, 100);
    store.put("unrelated", "history", { retained: true });
    const pending = service.testAi(ai);
    await vi.advanceTimersByTimeAsync(100);
    expect((await pending).aiTest).toMatchObject({ status: "error", message: expect.stringContaining("timed out") });
    expect(mocks.ai).toHaveBeenCalledOnce();
    await service.reset();
    expect(store.get("ai-connections", "default")).toBeNull();
    expect(store.get("unrelated", "history")).toEqual({ retained: true });
    expect(service.getState().ai).toEqual(ai);
  });

  it("rejects injected fields/model commands and hides unsanitized provider errors", async () => {
    const { service, mocks } = fixture();
    await expect(service.testAi({ ...ai, model: "--shell $(whoami)" })).rejects.toThrow();
    expect(mocks.ai).not.toHaveBeenCalled();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.ai.mockRejectedValueOnce(new Error("token=secret and private content"));
      const state = await service.testAi(ai);
      expect(JSON.stringify(state)).not.toContain("secret");
      expect(log).toHaveBeenCalledWith("AI_CONNECTION_AI_FAILED");
    } finally { log.mockRestore(); }
  });
});
