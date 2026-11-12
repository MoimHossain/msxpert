import { randomUUID } from "node:crypto";
import type {
  AccountOverview,
  AccountPreview,
  AccountState,
  AppSettings,
  BootstrapState,
  ChangeDocument,
  ChangeSet,
  FetchResult,
  NormalizedMilestone,
  MilestoneRow,
  Pod,
  PodSummary,
  PortfolioAccount,
  PortfolioOverview,
  RunEntry,
  SystemUserSearchResult,
  TeamPerson,
} from "../shared/types";
import { defaultSettings, WATCHED_FIELDS } from "../domain/defaults";
import { diffSnapshots, foldChanges } from "../domain/diff";
import type { AuthService } from "./auth";
import type { MsxClient } from "./msx-client";
import type { VaultStore } from "./storage/vault";
import { ProfileService } from "./profile-service";
import { TerritoryImportService } from "./territory-import-service";
import type { MilestoneDataset } from "../shared/milestones";
import type { AccountFetchProgress, FetchProgress } from "../shared/fetch";
import { enrichMilestones } from "../domain/milestone-view";
import { HistoryService } from "./history-service";

interface CurrentManifest {
  runId: string;
  generatedAt: string;
  account: { id: string; name: string; tpid: string };
  filter: ChangeDocument["filter"];
  counts: { accounts: number; milestones: number };
}

const SETTINGS_KIND = "settings";
const ACCOUNT_KIND = "portfolio-account";
const ARCHIVED_ACCOUNT_KIND = "archived-portfolio-account";
const TEAM_KIND = "team-person";
const POD_KIND = "pod";

function currentKind(accountId: string): string {
  return `current:${accountId}`;
}

function snapshotsKind(accountId: string): string {
  return `snapshots:${accountId}`;
}

function changesKind(accountId: string): string {
  return `changes:${accountId}`;
}

function runsKind(accountId: string): string {
  return `runs:${accountId}`;
}

function watermarkKind(accountId: string): string {
  return `watermark:${accountId}`;
}

function runId(now = new Date()): string {
  return now.toISOString();
}

function summarizeMilestones(milestones: NormalizedMilestone[]) {
  const count = (status: string) =>
    milestones.filter((milestone) => milestone.status === status).length;
  return {
    milestones: milestones.length,
    onTrack: count("On Track"),
    atRisk: count("At Risk"),
    blocked: count("Blocked"),
    committed: milestones.filter(
      (milestone) => milestone.commitment === "Committed",
    ).length,
    uncommitted: milestones.filter(
      (milestone) => milestone.commitment === "Uncommitted",
    ).length,
    monthlyUse: milestones.reduce(
      (total, milestone) => total + (milestone.monthlyUse ?? 0),
      0,
    ),
    owners: new Set(
      milestones.map((milestone) => milestone.ownerId).filter(Boolean),
    ).size,
  };
}

export class PortfolioService {
  private fetchInFlight: Promise<FetchResult> | null = null;
  private fetchProgress: FetchProgress | null = null;
  readonly profiles: ProfileService;
  readonly territoryImport: TerritoryImportService;
  readonly history: HistoryService;

  constructor(
    private readonly store: VaultStore,
    private readonly auth: AuthService,
    private readonly msx: MsxClient,
    private readonly version: string,
  ) {
    this.profiles = new ProfileService(store, auth, msx);
    this.territoryImport = new TerritoryImportService(msx, this, auth);
    this.history = new HistoryService(store, () => this.listAccounts());
  }

  getSettings(): AppSettings {
    const stored = this.store.get<AppSettings>(SETTINGS_KIND, "default");
    if (stored) return { ...stored, retentionSnapshots: 0, territoryIds: stored.territoryIds ?? [],
      teamEnabled: stored.teamEnabled ?? false, podsEnabled: stored.podsEnabled ?? true,
      onboardingComplete: stored.onboardingComplete ?? this.listAccounts().length > 0 };
    const defaults = defaultSettings();
    this.store.put(SETTINGS_KIND, "default", defaults);
    return defaults;
  }

  updateSettings(settings: AppSettings): AppSettings {
    this.store.put(SETTINGS_KIND, "default", settings);
    return settings;
  }

  async resetSetup(dataPath: string): Promise<BootstrapState> {
    if (this.fetchInFlight) throw new Error("Finish the current refresh before resetting setup.");
    await this.auth.signOut();
    this.profiles.clear();
    this.territoryImport.clear();
    this.store.transaction(() => {
      for (const account of this.listAccounts()) {
        this.store.put(ARCHIVED_ACCOUNT_KIND, account.id, account);
        this.store.delete(ACCOUNT_KIND, account.id);
      }
      this.store.put(SETTINGS_KIND, "default", defaultSettings());
    });
    return this.bootstrap(dataPath);
  }

  listAccounts(): PortfolioAccount[] {
    return this.store
      .list<PortfolioAccount>(ACCOUNT_KIND)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getMilestones(accountIds?: string[]): MilestoneDataset {
    const active = this.listAccounts().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (accountIds && (new Set(accountIds).size !== accountIds.length || accountIds.some(id => !active.some(account => account.id === id)))) {
      throw new Error("The milestone scope contains an unavailable portfolio account. Reload saved data.");
    }
    const accounts = accountIds ? active.filter(account => accountIds.includes(account.id)) : active;
    const milestones = new Map<string, MilestoneRow>();
    const missingAccountIds: string[] = [];
    for (const account of accounts) {
      const current = this.store.get<NormalizedMilestone[]>(currentKind(account.id), "milestones");
      if (current === null) missingAccountIds.push(account.id);
      for (const milestone of enrichMilestones(current ?? [], account)) {
        if (!milestones.has(milestone.id)) milestones.set(milestone.id, milestone);
      }
    }
    return { milestones: [...milestones.values()], accountIds: accounts.map(account => account.id),
      missingAccountIds, scope: this.getSettings().scope };
  }

  async searchAccounts(term: string) {
    return this.msx.searchAccounts(term);
  }

  async previewAccount(accountId: string): Promise<AccountPreview> {
    const tpids = new Set(this.listAccounts().map((account) => account.tpid));
    return this.msx.previewAccount(accountId, this.getSettings().scope, tpids);
  }

  async addAccount(accountId: string): Promise<PortfolioAccount> {
    const preview = await this.previewAccount(accountId);
    if (preview.alreadyTracked) {
      throw new Error(`TPID ${preview.topParent.tpid ?? ""} is already tracked.`);
    }
    if (!preview.topParent.tpid) throw new Error("The top parent has no TPID.");

    const archived = this.store
      .list<PortfolioAccount>(ARCHIVED_ACCOUNT_KIND)
      .find((account) => account.tpid === preview.topParent.tpid);
    const account: PortfolioAccount = {
      id: archived?.id ?? randomUUID(),
      tpid: preview.topParent.tpid,
      name: preview.topParent.name,
      msxAccountId: preview.topParent.id,
      country: preview.topParent.country,
      createdAt: archived?.createdAt ?? new Date().toISOString(),
      ...(preview.topParent.territory !== undefined ? { territory: preview.topParent.territory } : {}),
    };
    try {
      await this.ingestAccount(account);
      this.store.transaction(() => {
        this.store.put(ACCOUNT_KIND, account.id, account);
        this.store.delete(ARCHIVED_ACCOUNT_KIND, account.id);
      });
    } catch (error) {
      // Reconfiguring an archived customer must never erase its retained history.
      if (!archived) this.store.transaction(() => this.deleteAccountData(account.id));
      throw error;
    }
    return account;
  }

  removeAccount(accountId: string, deleteHistory: boolean): void {
    const account = this.store.get<PortfolioAccount>(ACCOUNT_KIND, accountId);
    this.store.transaction(() => {
      this.store.delete(ACCOUNT_KIND, accountId);
      if (deleteHistory) {
        this.store.delete(ARCHIVED_ACCOUNT_KIND, accountId);
        this.deleteAccountData(accountId);
      } else if (account) {
        this.store.put(ARCHIVED_ACCOUNT_KIND, accountId, account);
      }
    });
  }

  private deleteAccountData(accountId: string): void {
    for (const kind of [
      currentKind(accountId),
      snapshotsKind(accountId),
      changesKind(accountId),
      runsKind(accountId),
      watermarkKind(accountId),
    ]) {
      this.store.deleteKind(kind);
    }
  }

  private currentMilestones(accountId: string): NormalizedMilestone[] {
    return (
      this.store.get<NormalizedMilestone[]>(currentKind(accountId), "milestones") ?? []
    );
  }

  private runs(accountId: string): RunEntry[] {
    return this.store
      .list<RunEntry>(runsKind(accountId))
      .sort((left, right) => right.runId.localeCompare(left.runId));
  }

  private unreviewed(accountId: string): {
    changes: ChangeSet;
    documents: ChangeDocument[];
    fromRunId: string | null;
    toRunId: string | null;
  } {
    const watermark = this.store.get<{ reviewedThrough: string }>(
      watermarkKind(accountId),
      "current",
    );
    const documents = this.store
      .list<ChangeDocument>(changesKind(accountId))
      .filter(
        (document) =>
          !document.baseline &&
          (!watermark || document.runId > watermark.reviewedThrough),
      )
      .sort((left, right) => left.runId.localeCompare(right.runId));
    return {
      changes: foldChanges(documents),
      documents,
      fromRunId: documents[0]?.runId ?? null,
      toRunId: documents.at(-1)?.runId ?? null,
    };
  }

  getOverview(): PortfolioOverview {
    const accounts: AccountOverview[] = this.listAccounts().map((account) => {
      const milestones = this.currentMilestones(account.id);
      const tree =
        this.store.get<unknown[]>(currentKind(account.id), "tree") ?? [];
      const summary = summarizeMilestones(milestones);
      const changes = this.unreviewed(account.id).changes;
      return {
        ...account,
        hasData: this.store.get(currentKind(account.id), "manifest") != null,
        ...summary,
        accountRecords: tree.length,
        pendingChanges:
          changes.added.length +
          changes.modified.length +
          changes.disappeared.length,
        lastRun: this.runs(account.id)[0] ?? null,
      };
    });

    return {
      accounts,
      totals: accounts.reduce(
        (total, account) => ({
          milestones: total.milestones + account.milestones,
          atRisk: total.atRisk + account.atRisk,
          blocked: total.blocked + account.blocked,
          monthlyUse: total.monthlyUse + account.monthlyUse,
          pendingChanges: total.pendingChanges + account.pendingChanges,
        }),
        { milestones: 0, atRisk: 0, blocked: 0, monthlyUse: 0, pendingChanges: 0 },
      ),
      scope: this.getSettings().scope,
    };
  }

  async refreshAccountTerritories(): Promise<void> {
    const accounts = this.listAccounts().filter((account) => account.territory === undefined);
    if (!accounts.length) return;
    const territories = await this.msx.getAccountTerritories(accounts.map((account) => account.msxAccountId));
    if (accounts.some((account) => !territories.has(account.msxAccountId.toLowerCase()))) {
      throw new Error("MSX could not return territory details for every account. Check your access and retry.");
    }
    this.store.transaction(() => {
      for (const account of accounts) {
        const current = this.store.get<PortfolioAccount>(ACCOUNT_KIND, account.id);
        if (current?.territory === undefined && current?.msxAccountId === account.msxAccountId) {
          this.store.put(ACCOUNT_KIND, account.id, { ...current, territory: territories.get(account.msxAccountId.toLowerCase()) ?? null });
        }
      }
    });
  }

  getAccountState(accountId: string): AccountState {
    const account = this.store.get<PortfolioAccount>(ACCOUNT_KIND, accountId);
    if (!account) throw new Error("The selected portfolio account does not exist.");
    const unreviewed = this.unreviewed(accountId);
    const watermark = this.store.get<{ reviewedThrough: string }>(
      watermarkKind(accountId),
      "current",
    );
    return {
      account,
      accountTree:
        this.store.get(currentKind(accountId), "tree") ?? [],
      scope: this.getSettings().scope,
      milestones: this.getMilestones([accountId]).milestones,
      runs: this.runs(accountId),
      since: {
        ...unreviewed.changes,
        runCount: unreviewed.documents.length,
        fromRunId: unreviewed.fromRunId,
        toRunId: unreviewed.toRunId,
      },
      reviewedThrough: watermark?.reviewedThrough ?? null,
      hasData: this.store.get(currentKind(accountId), "manifest") != null,
    };
  }

  getFetchProgress(): FetchProgress | null { return this.fetchProgress; }

  async fetchAccounts(accountId?: string, onProgress?: (progress: FetchProgress) => void): Promise<FetchResult> {
    if (this.fetchInFlight) {
      throw new Error("A portfolio refresh is already running.");
    }
    this.fetchInFlight = this.runFetch(accountId, onProgress);
    try {
      return await this.fetchInFlight;
    } finally {
      this.fetchInFlight = null;
    }
  }

  private async runFetch(accountId?: string, onProgress?: (progress: FetchProgress) => void): Promise<FetchResult> {
    const targets = accountId
      ? this.listAccounts().filter((account) => account.id === accountId)
      : this.listAccounts();
    if (accountId && targets.length === 0) throw new Error("Account not found.");

    const results: FetchResult["accounts"] = [];
    this.fetchProgress = {
      id: randomUUID(), startedAt: new Date().toISOString(), finishedAt: null, running: true,
      completed: 0, total: targets.length,
      accounts: targets.map(account => ({ accountId: account.id, name: account.name, stage: "queued",
        accountRecords: 0, milestones: 0, pages: 0, changes: null, error: null })),
    };
    const publish = () => { if (this.fetchProgress) onProgress?.(this.fetchProgress); };
    const update = (accountId: string, patch: Partial<AccountFetchProgress>) => {
      if (!this.fetchProgress) return;
      this.fetchProgress = { ...this.fetchProgress, completed: results.length,
        accounts: this.fetchProgress.accounts.map(row => row.accountId === accountId ? { ...row, ...patch } : row) };
      publish();
    };
    publish();
    for (const account of targets) {
      try {
        const document = await this.ingestAccount(account, patch => update(account.id, patch));
        results.push({
          accountId: account.id,
          name: account.name,
          ok: true,
          runId: document.runId,
          baseline: document.baseline,
          counts: document.counts,
        });
        update(account.id, { stage: "complete", milestones: document.counts.total,
          changes: document.counts.added + document.counts.modified + document.counts.unwatchedOnly + document.counts.disappeared });
      } catch (error) {
        results.push({
          accountId: account.id,
          name: account.name,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        update(account.id, { stage: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
    this.fetchProgress = { ...this.fetchProgress, running: false, finishedAt: new Date().toISOString(), completed: results.length };
    publish();
    return { ok: results.every((result) => result.ok), accounts: results };
  }

  private async ingestAccount(account: PortfolioAccount, report?: (patch: Partial<AccountFetchProgress>) => void): Promise<ChangeDocument> {
    const started = Date.now();
    const latestTime = Date.parse(this.runs(account.id)[0]?.runId ?? "");
    const id = runId(new Date(Math.max(started, Number.isFinite(latestTime) ? latestTime + 1 : started)));
    try {
      const settings = this.getSettings();
      report?.({ stage: "tree" });
      const tree = await this.msx.resolveAccountTree(account.tpid);
      const top = tree.find((record) => record.id.toLowerCase() === account.msxAccountId.toLowerCase());
      if (top?.territory !== undefined) account.territory = top.territory;
      report?.({ stage: "milestones", accountRecords: tree.length });
      const milestones = await this.msx.fetchMilestones(
        settings.scope,
        tree.map((record) => record.id),
        progress => report?.(progress),
      );
      const previous = this.store.get<NormalizedMilestone[]>(
        currentKind(account.id),
        "milestones",
      );
      const baseline = previous == null;
      const changes = baseline
        ? { added: [], modified: [], disappeared: [] }
        : diffSnapshots(previous, milestones, WATCHED_FIELDS);

      if (changes.disappeared.length) {
        report?.({ stage: "explaining" });
        const reasons = await this.msx.explainDisappearances(
          settings.scope,
          changes.disappeared.map((milestone) => milestone.id),
          tree.map((record) => record.id),
        );
        for (const milestone of changes.disappeared) {
          const gone = reasons.get(milestone.id);
          if (gone) milestone.gone = gone;
        }
      }

      const previousManifest = this.store.get<CurrentManifest>(
        currentKind(account.id),
        "manifest",
      );
      const generatedAt = new Date().toISOString();
      const filter: ChangeDocument["filter"] = {
        dateFrom: settings.scope.dateFrom,
        dateTo: settings.scope.dateTo,
        windowLabel: settings.scope.label,
        excludedStatuses: settings.scope.excludedStatusLabels,
        accountIdCount: tree.length,
      };
      const manifest: CurrentManifest = {
        runId: id,
        generatedAt,
        account: { id: account.id, name: account.name, tpid: account.tpid },
        filter,
        counts: { accounts: tree.length, milestones: milestones.length },
      };
      const document: ChangeDocument = {
        runId: id,
        generatedAt,
        baseline,
        previousRunId: previousManifest?.runId ?? null,
        account: manifest.account,
        filter,
        counts: {
          added: changes.added.length,
          modified: changes.modified.filter((item) => !item.unwatchedOnly).length,
          unwatchedOnly: changes.modified.filter((item) => item.unwatchedOnly).length,
          disappeared: changes.disappeared.length,
          total: milestones.length,
        },
        ...changes,
      };
      const run: RunEntry = {
        runId: id,
        at: generatedAt,
        durationMs: Date.now() - started,
        ok: true,
        baseline,
        counts: document.counts,
      };

      report?.({ stage: "saving", milestones: milestones.length });
      this.store.transaction(() => {
        const active = this.store.get<PortfolioAccount>(ACCOUNT_KIND, account.id);
        if (active && account.territory !== undefined) this.store.put(ACCOUNT_KIND, account.id, { ...active, territory: account.territory });
        this.store.put(snapshotsKind(account.id), id, { milestones, manifest });
        this.store.put(changesKind(account.id), id, document);
        this.store.put(currentKind(account.id), "milestones", milestones);
        this.store.put(currentKind(account.id), "tree", tree);
        this.store.put(currentKind(account.id), "manifest", manifest);
        this.store.put(runsKind(account.id), id, run);
      });
      return document;
    } catch (error) {
      const run: RunEntry = {
        runId: id,
        at: new Date().toISOString(),
        durationMs: Date.now() - started,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.store.put(runsKind(account.id), id, run);
      throw error;
    }
  }

  markReviewed(accountId: string): AccountState {
    const latest = this.store
      .list<ChangeDocument>(changesKind(accountId))
      .sort((left, right) => right.runId.localeCompare(left.runId))[0];
    if (!latest) throw new Error("Nothing has been fetched for this account.");
    this.store.put(watermarkKind(accountId), "current", {
      reviewedThrough: latest.runId,
      reviewedAt: new Date().toISOString(),
    });
    return this.getAccountState(accountId);
  }

  async searchUsers(term: string): Promise<SystemUserSearchResult[]> {
    return this.msx.searchUsers(term);
  }

  listTeam(): TeamPerson[] {
    return this.store
      .list<TeamPerson>(TEAM_KIND)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  addTeamPerson(user: SystemUserSearchResult): TeamPerson {
    const existing = this.listTeam().find((person) => person.msxUserId === user.id);
    if (existing) return existing;
    const person: TeamPerson = {
      id: randomUUID(),
      msxUserId: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      role: null,
      manager: null,
      level: null,
      notes: null,
      aliases: [],
      createdAt: new Date().toISOString(),
    };
    this.store.put(TEAM_KIND, person.id, person);
    return person;
  }

  saveTeamPerson(person: TeamPerson): TeamPerson {
    if (!person.id || !person.name.trim()) throw new Error("A team member needs a name.");
    this.store.put(TEAM_KIND, person.id, { ...person, name: person.name.trim() });
    return person;
  }

  removeTeamPerson(personId: string): void {
    this.store.transaction(() => {
      this.store.delete(TEAM_KIND, personId);
      for (const pod of this.store.list<Pod>(POD_KIND)) {
        const people = pod.people.filter((assignment) => assignment.personId !== personId);
        if (people.length !== pod.people.length) {
          this.store.put(POD_KIND, pod.id, {
            ...pod,
            people,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });
  }

  savePod(pod: Pod): Pod {
    if (!pod.name.trim()) throw new Error("A POD needs a name.");
    const now = new Date().toISOString();
    const saved: Pod = {
      ...pod,
      id: pod.id || randomUUID(),
      name: pod.name.trim(),
      createdAt: pod.createdAt || now,
      updatedAt: now,
      accountIds: [...new Set(pod.accountIds)],
    };
    this.store.put(POD_KIND, saved.id, saved);
    return saved;
  }

  removePod(podId: string): void {
    this.store.delete(POD_KIND, podId);
  }

  listPods(): PodSummary[] {
    const accounts = new Map(
      this.listAccounts().map((account) => [account.id, account]),
    );
    const people = new Map(this.listTeam().map((person) => [person.id, person]));
    return this.store
      .list<Pod>(POD_KIND)
      .map((pod) => {
        const milestones = pod.accountIds.flatMap((accountId) =>
          this.currentMilestones(accountId),
        );
        const summary = summarizeMilestones(milestones);
        return {
          ...pod,
          accountNames: pod.accountIds
            .map((id) => accounts.get(id)?.name)
            .filter((name): name is string => Boolean(name)),
          peopleNames: pod.people
            .map((assignment) => {
              const name = people.get(assignment.personId)?.name;
              return name ? { name, role: assignment.role } : null;
            })
            .filter(
              (
                item,
              ): item is { name: string; role: (typeof pod.people)[number]["role"] } =>
                item != null,
            ),
          ...summary,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async bootstrap(dataPath: string): Promise<BootstrapState> {
    return {
      auth: await this.auth.getCachedState(),
      profile: this.profiles.getCached(await this.auth.getAccountKey()),
      settings: this.getSettings(),
      overview: this.getOverview(),
      team: this.listTeam(),
      pods: this.listPods(),
      dataPath,
      version: this.version,
    };
  }
}
