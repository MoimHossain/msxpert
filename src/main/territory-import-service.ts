import { randomUUID } from "node:crypto";
import type {
  TerritoryImportPreview, TerritoryImportProgress, TerritoryImportResult,
} from "../shared/types";
import { AuthRequiredError, type AuthService } from "./auth";
import type { MsxClient } from "./msx-client";
import type { PortfolioService } from "./portfolio-service";

export class TerritoryImportService {
  private plan: { preview: TerritoryImportPreview; accountKey: string; expiresAt: number } | null = null;

  constructor(
    private readonly msx: Pick<MsxClient, "listTerritories" | "accountsForTerritory" | "resolveTopParent">,
    private readonly portfolio: Pick<PortfolioService, "listAccounts" | "addAccount">,
    private readonly auth: Pick<AuthService, "getAccountKey">,
  ) {}

  clear(): void { this.plan = null; }

  async preview(ids: string[]): Promise<TerritoryImportPreview> {
    this.clear();
    const accountKey = await this.auth.getAccountKey();
    if (!accountKey) throw new AuthRequiredError();
    const selected = new Set(ids.map((id) => id.toLowerCase()));
    if (!selected.size) throw new Error("Select at least one territory.");
    const territories = (await this.msx.listTerritories()).filter((territory) => selected.has(territory.id));
    if (territories.length !== selected.size) throw new Error("A territory is no longer available for the current fiscal year. Select territories again.");
    const candidates = new Map<string, TerritoryImportPreview["accounts"][number]>();
    const unresolved: TerritoryImportPreview["unresolved"] = [];
    const tracked = new Set(this.portfolio.listAccounts().map((account) => account.tpid));
    const resolved = new Set<string>();
    for (const territory of territories) {
      for (const account of await this.msx.accountsForTerritory(territory.id)) {
        if (!account.tpid) {
          if (!unresolved.some((issue) => issue.id === account.id)) {
            unresolved.push({ id: account.id, name: account.name, message: "No top-parent TPID is supplied by MSX." });
          }
          continue;
        }
        if (resolved.has(account.tpid)) continue;
        resolved.add(account.tpid);
        try {
          const top = await this.msx.resolveTopParent(account.tpid);
          if (top.tpid !== account.tpid) throw new Error("The resolved top parent has a different TPID.");
          candidates.set(top.tpid, { id: top.id, name: top.name, tpid: top.tpid, alreadyPresent: tracked.has(top.tpid) });
        } catch (error) {
          if (error instanceof AuthRequiredError) throw error;
          unresolved.push({ id: account.id, name: account.name,
            message: error instanceof Error ? error.message : "The top parent could not be resolved." });
        }
      }
    }
    const accounts = [...candidates.values()].sort((left, right) => left.name.localeCompare(right.name));
    const preview: TerritoryImportPreview = {
      id: randomUUID(), territories, accounts, alreadyPresent: accounts.filter((account) => account.alreadyPresent).length, unresolved,
    };
    this.plan = { preview, accountKey, expiresAt: Date.now() + 15 * 60 * 1000 };
    return preview;
  }

  async import(previewId: string, publish: (progress: TerritoryImportProgress) => void): Promise<TerritoryImportResult> {
    const plan = this.plan;
    if (!plan || plan.preview.id !== previewId || plan.expiresAt < Date.now()) {
      throw new Error("This import preview expired. Preview the territories again.");
    }
    if (plan.accountKey !== await this.auth.getAccountKey()) throw new AuthRequiredError();
    this.clear();
    const result: TerritoryImportResult = { added: 0, skipped: 0, failures: [] };
    let completed = 0;
    const progress = () => publish({ completed, total: plan.preview.accounts.length,
      added: result.added, skipped: result.skipped, failed: result.failures.length });
    progress();
    for (const account of plan.preview.accounts) {
      try {
        if (this.portfolio.listAccounts().some((tracked) => tracked.tpid === account.tpid)) result.skipped++;
        else {
          await this.portfolio.addAccount(account.id);
          result.added++;
        }
      } catch (error) {
        if (error instanceof AuthRequiredError) throw error;
        result.failures.push({ id: account.id, name: account.name,
          message: error instanceof Error ? error.message : "Account import failed." });
      }
      completed++;
      progress();
    }
    return result;
  }
}
