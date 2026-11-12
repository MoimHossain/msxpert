import type {
  AiConfiguration, AiConnectionsState, ConnectionKind, ConnectionTestResult, WorkiqConfiguration,
} from "../shared/ai";
import { aiConfigurationSchema, workiqConfigurationSchema } from "../shared/ai";
import type { VaultStore } from "./storage/vault";

export interface ConnectionEvidence {
  response: string;
  identity: string | null;
  details: string;
}

export interface ConnectionRunners {
  ai(config: AiConfiguration, signal: AbortSignal): Promise<ConnectionEvidence>;
  workiq(config: WorkiqConfiguration, signal: AbortSignal): Promise<ConnectionEvidence>;
}

export class ConnectionError extends Error {
  constructor(readonly publicMessage: string) { super(publicMessage); }
}

export class AiService {
  private readonly state: AiConnectionsState;
  private active: { controller: AbortController; done: Promise<void> } | null = null;

  constructor(
    private readonly store: Pick<VaultStore, "get" | "put" | "delete">,
    private readonly runners: ConnectionRunners,
    private readonly timeoutMs = 120_000,
  ) {
    const saved = store.get<{ ai: unknown; workiq: unknown }>("ai-connections", "default");
    this.state = {
      ai: aiConfigurationSchema.parse(saved?.ai ?? { runtimePath: "", model: "" }),
      workiq: workiqConfigurationSchema.parse(saved?.workiq ?? { executablePath: "", tenantId: "" }),
      aiTest: null, workiqTest: null, testing: null,
    };
  }

  get busy(): boolean { return this.active !== null; }
  getState(): AiConnectionsState { return structuredClone(this.state); }

  async testAi(config: AiConfiguration): Promise<AiConnectionsState> {
    this.ensureIdle();
    this.state.ai = aiConfigurationSchema.parse(config);
    this.state.aiTest = null;
    this.state.workiqTest = null;
    this.persist();
    return this.test("ai", (signal) => this.runners.ai(this.state.ai, signal));
  }

  async testWorkiq(config: WorkiqConfiguration): Promise<AiConnectionsState> {
    this.ensureIdle();
    if (this.state.aiTest?.status !== "success") {
      throw new Error("Test AI access successfully before configuring Work IQ.");
    }
    this.state.workiq = workiqConfigurationSchema.parse(config);
    this.state.workiqTest = null;
    this.persist();
    return this.test("workiq", (signal) => this.runners.workiq(this.state.workiq, signal));
  }

  cancel(): void {
    this.active?.controller.abort(new ConnectionError("Connection test cancelled."));
  }

  async disconnect(): Promise<void> {
    this.cancel();
    await this.active?.done;
    this.state.aiTest = null;
    this.state.workiqTest = null;
  }

  async reset(): Promise<void> {
    await this.disconnect();
    this.state.ai = { runtimePath: "", model: "" };
    this.state.workiq = { executablePath: "", tenantId: "" };
    this.store.delete("ai-connections", "default");
  }

  private ensureIdle(): void {
    if (this.active) throw new Error("Stop the current connection test before starting another.");
  }

  private persist(): void {
    this.store.put("ai-connections", "default", { ai: this.state.ai, workiq: this.state.workiq });
  }

  private async test(
    kind: ConnectionKind,
    run: (signal: AbortSignal) => Promise<ConnectionEvidence>,
  ): Promise<AiConnectionsState> {
    const controller = new AbortController();
    let finish!: () => void;
    const done = new Promise<void>((resolve) => { finish = resolve; });
    this.active = { controller, done };
    this.state.testing = kind;
    const timer = setTimeout(() => controller.abort(
      new ConnectionError("Connection test timed out. Check the client's sign-in and network access, then retry."),
    ), this.timeoutMs);
    let result: ConnectionTestResult;
    try {
      const evidence = await run(controller.signal);
      controller.signal.throwIfAborted();
      result = {
        status: "success", checkedAt: new Date().toISOString(),
        message: kind === "ai" ? "AI access works. The LLM returned the expected test response." :
          "Work IQ access works. Its service returned the expected test response.",
        response: evidence.response, identity: evidence.identity, details: evidence.details,
      };
    } catch (error) {
      const reason: unknown = controller.signal.aborted ? controller.signal.reason : error;
      const message = reason instanceof ConnectionError ? reason.publicMessage :
        "The connection test failed. Check the official client's sign-in, permissions, installation and network, then retry.";
      if (!(reason instanceof ConnectionError)) console.error(`AI_CONNECTION_${kind.toUpperCase()}_FAILED`);
      result = {
        status: controller.signal.aborted && message === "Connection test cancelled." ? "cancelled" : "error",
        checkedAt: new Date().toISOString(), message, response: null, identity: null, details: null,
      };
    } finally {
      clearTimeout(timer);
      this.state.testing = null;
      this.active = null;
      finish();
    }
    if (kind === "ai") this.state.aiTest = result;
    else this.state.workiqTest = result;
    return this.getState();
  }
}
