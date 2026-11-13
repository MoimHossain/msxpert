import { randomUUID } from "node:crypto";
import type { AcrAccount, AcrAccountSnapshot, AcrProgress, AcrSnapshot, AcrState } from "../shared/acr";
import { acrWindow, shapeAcrAccount, type AcrRow } from "../domain/acr";
import { powerBiScopeId, type PowerBiAuth, type PowerBiEmployee } from "./powerbi-auth";
import { ACCESS_COLUMNS, ACCESS_MODEL_ID, ACR_COLUMNS, ACR_MODEL_ID, acrRows,
  buildAccessQuery, buildServiceQuery, PowerBiQueryClient } from "./powerbi-query";
import type { VaultStore } from "./storage/vault";

const SNAPSHOTS = "acr-snapshot";
type Auth = Pick<PowerBiAuth, "connect" | "disconnect" | "getToken" | "status">;
function accountScope(accounts: AcrAccount[]): string {
  return JSON.stringify(accounts.map(account => [account.id, account.tpid]).sort());
}

export class AcrService {
  private active: { controller: AbortController; done: Promise<unknown> } | null = null;
  private progress: AcrProgress | null = null;

  constructor(
    private readonly store: Pick<VaultStore, "get" | "put">,
    private readonly auth: Auth,
    private readonly employee: () => Promise<PowerBiEmployee | null>,
    private readonly configuredAccounts: () => AcrAccount[],
    private readonly queries = new PowerBiQueryClient(),
    private readonly now = () => new Date(),
  ) {}

  get busy(): boolean { return this.active !== null; }
  private async context() {
    const employee = await this.employee();
    if (!employee?.key || !employee.upn) throw new Error("Sign in to MSX before using your employee's ACR.");
    const unique = new Map<string, AcrAccount>();
    for (const account of this.configuredAccounts()) {
      if (!/^\d+$/.test(account.tpid)) throw new Error("A configured top-parent account has an invalid TPID.");
      if (!unique.has(account.tpid)) unique.set(account.tpid, { ...account });
    }
    const accounts = [...unique.values()];
    return { employee, scopeId: powerBiScopeId(employee), accounts, accountScope: accountScope(accounts) };
  }
  private async unchanged(context: Awaited<ReturnType<AcrService["context"]>>, signal: AbortSignal) {
    signal.throwIfAborted();
    const current = await this.context();
    signal.throwIfAborted();
    if (current.scopeId !== context.scopeId || current.accountScope !== context.accountScope) {
      throw new Error("The selected employee or configured accounts changed. The previous ACR snapshot was kept; fetch again.");
    }
  }
  private snapshot(context: Awaited<ReturnType<AcrService["context"]>>) {
    const stored = this.store.get<AcrSnapshot>(SNAPSHOTS, context.scopeId);
    if (!stored) return null;
    if (stored.version !== 1 || stored.currency !== "USD" || !Array.isArray(stored.accounts)) {
      throw new Error("The cached ACR snapshot has an unsupported format. Fetch a new snapshot.");
    }
    const current = new Map(context.accounts.map(account => [account.tpid, account]));
    return { ...stored,
      accounts: stored.accounts.filter(entry => current.has(entry.account.tpid))
        .map(entry => ({ ...entry, account: current.get(entry.account.tpid)! })),
      skipped: stored.skipped.filter(account => current.has(account.tpid)) };
  }
  async getState(): Promise<AcrState> {
    const context = await this.context();
    const signal = AbortSignal.timeout(35000);
    const connection = await this.auth.status(context.employee, signal);
    await this.unchanged(context, signal);
    let snapshot: AcrSnapshot | null = null;
    let cacheError: string | null = null;
    try { snapshot = this.snapshot(context); } catch {
      console.error("ACR_CACHE_UNREADABLE");
      cacheError = "Saved ACR data could not be read or uses an unsupported format. Fetch a new snapshot.";
    }
    return {
      scopeId: context.scopeId, connection, snapshot, configuredAccounts: context.accounts.length,
      progress: this.progress?.scopeId === context.scopeId ? structuredClone(this.progress) : null,
      cacheError,
      coverageChanged: snapshot !== null && JSON.stringify([...snapshot.configuredTpids].sort()) !==
        JSON.stringify(context.accounts.map(account => account.tpid).sort()),
    };
  }
  private async operation<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.active) throw new Error("An ACR operation is already running. Follow its progress or cancel it first.");
    const controller = new AbortController();
    const done = work(controller.signal);
    const active = { controller, done };
    this.active = active;
    try { return await done; } finally {
      if (this.active === active) this.active = null;
    }
  }
  async cancel(): Promise<void> {
    const active = this.active;
    if (!active) return;
    active.controller.abort(new DOMException("ACR operation cancelled. The previous snapshot was kept.", "AbortError"));
    await active.done.then(() => undefined, error => {
      if (!active.controller.signal.aborted) throw error;
    });
  }
  async resetConnection(): Promise<void> {
    if (this.busy) throw new Error("Finish the ACR operation before resetting setup.");
    const employee = await this.employee();
    if (!employee) throw new Error("The selected employee is unavailable for resetting the Power BI connection.");
    await this.auth.disconnect(employee);
    this.progress = null;
  }
  connect(): Promise<AcrState> {
    return this.operation(async signal => {
      const context = await this.context();
      await this.auth.connect(context.employee, signal);
      await this.unchanged(context, signal);
      return this.getState();
    });
  }
  disconnect(): Promise<AcrState> {
    return this.operation(async signal => {
      const context = await this.context();
      await this.auth.disconnect(context.employee);
      await this.unchanged(context, signal);
      return this.getState();
    });
  }
  fetch(onProgress: (progress: AcrProgress) => void): Promise<AcrState> {
    return this.operation(async cancellation => {
      const signal = AbortSignal.any([cancellation, AbortSignal.timeout(60 * 60 * 1000)]);
      const context = await this.context();
      const progress: AcrProgress = {
        scopeId: context.scopeId, runId: randomUUID(), running: true, phase: "access",
        startedAt: this.now().toISOString(), finishedAt: null, total: 0, completed: 0,
        active: [], failures: [], skipped: [], error: null,
      };
      this.progress = progress;
      const emit = () => onProgress(structuredClone(progress));
      emit();
      try {
        const auth = await this.auth.getToken(context.employee, signal);
        const alias = auth.user.username.split("@")[0] ?? "";
        const access = await this.queries.execute(auth.token, ACCESS_MODEL_ID, buildAccessQuery(alias), ACCESS_COLUMNS, signal);
        const allowed = new Set<string>();
        for (const row of access) {
          const tpid = String(row.tpid ?? "").trim();
          if (!tpid) continue;
          if (!/^\d+$/.test(tpid)) throw new Error("Power BI returned an invalid account entitlement.");
          allowed.add(tpid);
        }
        const authorized = context.accounts.filter(account => allowed.has(account.tpid));
        progress.skipped = context.accounts.filter(account => !allowed.has(account.tpid));
        progress.total = authorized.length;
        progress.phase = "fetching";
        const window = acrWindow(this.now());
        const results: AcrAccountSnapshot[] = [];
        let next = 0;
        emit();
        const workers = Array.from({ length: Math.min(2, authorized.length) }, async () => {
          while (next < authorized.length) {
            signal.throwIfAborted();
            const account = authorized[next++]!;
            const active = { ...account, fiscalYear: "", pages: 0, rows: 0 };
            progress.active.push(active);
            emit();
            try {
              const rows: AcrRow[] = [];
              for (const fiscalYear of window.fiscalYears) {
                active.fiscalYear = fiscalYear;
                const priorPages = active.pages;
                const priorRows = active.rows;
                emit();
                const data = await this.queries.execute(auth.token, ACR_MODEL_ID,
                  buildServiceQuery(account.tpid, fiscalYear, window.months.filter(month => month.key.startsWith(`${fiscalYear}-`))),
                  ACR_COLUMNS, signal, page => {
                    active.pages = priorPages + page.pages;
                    active.rows = priorRows + page.rows;
                    emit();
                  });
                for (const row of acrRows(data)) rows.push(row);
              }
              results.push(shapeAcrAccount(account, rows, window, this.now().toISOString()));
            } catch (error) {
              signal.throwIfAborted();
              progress.failures.push({ account, error: error instanceof Error ? error.message : "Power BI account query failed." });
            } finally {
              progress.completed++;
              progress.active = progress.active.filter(item => item.tpid !== account.tpid);
              emit();
            }
          }
        });
        // All workers must finish before cancellation/failure releases the operation gate.
        const settled = await Promise.allSettled(workers);
        const rejected = settled.find(result => result.status === "rejected");
        if (rejected?.status === "rejected") throw rejected.reason;
        signal.throwIfAborted();
        if (progress.failures.length) {
          throw new Error(`ACR fetch failed for ${progress.failures.length} of ${authorized.length} permitted accounts. The previous snapshot was kept.`);
        }
        progress.phase = "saving";
        emit();
        await this.unchanged(context, signal);
        const snapshot: AcrSnapshot = {
          ...window, version: 1, currency: "USD", fetchedAt: this.now().toISOString(), fetchedBy: auth.user,
          configuredTpids: context.accounts.map(account => account.tpid),
          accounts: results.sort((left, right) => left.account.name.localeCompare(right.account.name)),
          skipped: progress.skipped,
        };
        this.store.put(SNAPSHOTS, context.scopeId, snapshot);
        progress.phase = "complete";
      } catch (error) {
        progress.phase = cancellation.aborted ? "cancelled" : "failed";
        progress.error = signal.aborted && !cancellation.aborted
          ? "ACR fetch exceeded the 60-minute safety limit. The previous snapshot was kept."
          : error instanceof Error ? error.message : "ACR fetch failed. The previous snapshot was kept.";
        throw new Error(progress.error);
      } finally {
        progress.running = false;
        progress.finishedAt = this.now().toISOString();
        emit();
      }
      return this.getState();
    });
  }
}
