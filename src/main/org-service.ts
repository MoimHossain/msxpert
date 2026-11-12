import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { classifyOrgTitle, isOrgBoundary } from "../domain/org";
import type { AiConnectionsState, WorkiqConfiguration } from "../shared/ai";
import { orgPersonInputSchema, type OrgDiscoveryMode, type OrgImportResult, type OrgImportSummary, type OrgPerson, type OrgPersonInput, type OrgProfile, type OrgProgress, type OrgState } from "../shared/organization";
import type { VaultStore } from "./storage/vault";
import { abortable } from "./ai-runtime";
import { openOrgWorkiqSession, OrgResponseError, OrgWorkiqError, type OrgFacts, type OrgWorkiqSession } from "./org-workiq";
import type { OrgCatalog } from "./org-catalog";

type Identity = { key: string; upn: string; name: string };
type OrgActor = { msxUserId: string; upn: string };
export interface OrgServiceOptions {
  getIdentity: () => Promise<Identity | null>;
  getConnection: () => AiConnectionsState;
  resolveActors: (signal: AbortSignal) => Promise<OrgActor[]>;
  openSession?: (config: WorkiqConfiguration, signal: AbortSignal) => Promise<OrgWorkiqSession>;
}
export interface OrgDiscoveryLimits {
  maxRequests: number;
  maxPeople: number;
  maxDepth: number;
  maxDurationMs: number;
  maxUpwardHops: number;
  requestTimeoutMs: number;
}
interface Partition {
  subjectUpn?: string;
  revision: string;
  people: OrgPerson[];
  root: OrgProfile | null;
  linkError: string | null;
}
interface Context { scope: string; identity: Identity; epoch: number }
interface Job {
  context: Context;
  controller: AbortController;
  progress: OrgProgress;
  done: Promise<OrgState>;
  session: OrgWorkiqSession | null;
}

const KIND = "organization";
const DEFAULT_LIMITS: OrgDiscoveryLimits = {
  maxRequests: 200, maxPeople: 5000, maxDepth: 20, maxDurationMs: 60 * 60_000,
  maxUpwardHops: 10, requestTimeoutMs: 90_000,
};
const emptyPartition = (): Partition => ({ revision: "", people: [], root: null, linkError: null });
const copy = <T>(value: T): T => structuredClone(value);

class BudgetError extends Error {}
class ScopeError extends Error {}
class ActorLookupError extends Error {}

export class OrgService {
  private job: Job | null = null;
  private lastProgress: { scope: string; upn: string; progress: OrgProgress } | null = null;
  private mutating = false;
  private epoch = 0;
  private lifecycle = new AbortController();
  private readonly limits: OrgDiscoveryLimits;

  constructor(
    private readonly store: Pick<VaultStore, "get" | "put" | "delete">,
    private readonly options: OrgServiceOptions,
    limits: Partial<OrgDiscoveryLimits> = {},
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const [name, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < (name === "maxDepth" || name === "maxUpwardHops" ? 0 : 1)) {
        throw new Error(`Invalid organization discovery limit: ${name}.`);
      }
    }
  }

  get busy(): boolean { return this.job !== null || this.mutating; }

  private async context(requireConnection = false): Promise<Context | null> {
    const epoch = this.epoch;
    const identity = await this.options.getIdentity();
    if (!identity || !identity.key?.trim() || identity.key.length > 2000 ||
        !z.email().safeParse(identity.upn).success || identity.upn.length > 500) {
      if (requireConnection) throw new Error("A valid current signed-in MSX identity and account scope are required.");
      return null;
    }
    if (requireConnection && this.options.getConnection().workiqTest?.status !== "success") {
      throw new Error("Successfully test the existing Work IQ connection before changing organization data.");
    }
    return { epoch, identity: { ...identity, upn: identity.upn.toLowerCase() },
      scope: createHash("sha256").update(identity.key).digest("hex") };
  }

  private async guard(context: Context, signal?: AbortSignal, requireConnection = false): Promise<void> {
    signal?.throwIfAborted();
    const current = await this.context(requireConnection);
    signal?.throwIfAborted();
    if (!current || current.epoch !== context.epoch || current.scope !== context.scope || current.identity.upn !== context.identity.upn) {
      throw new ScopeError("The signed-in account changed. No further organization results were saved.");
    }
  }

  private load(context: Context): Partition {
    const partition = this.store.get<Partition>(KIND, context.scope);
    return copy(partition && partition.subjectUpn === context.identity.upn ? partition : emptyPartition());
  }

  private write(context: Context, partition: Partition): void {
    partition.revision = randomUUID();
    partition.subjectUpn = context.identity.upn;
    this.store.put(KIND, context.scope, copy(partition));
  }

  private state(context: Context | null): OrgState {
    if (!context) return { ...emptyPartition(), progress: null, identity: null, canDiscover: false };
    const { subjectUpn: _subjectUpn, ...partition } = this.load(context);
    const progress = this.job?.context.scope === context.scope && this.job.context.identity.upn === context.identity.upn
      ? this.job.progress : this.lastProgress?.scope === context.scope && this.lastProgress.upn === context.identity.upn
        ? this.lastProgress.progress : null;
    return copy({ ...partition, progress, identity: context.identity.upn,
      canDiscover: this.options.getConnection().workiqTest?.status === "success" });
  }

  async getState(): Promise<OrgState> { return this.state(await this.context()); }

  private async mutation(action: (context: Context) => Promise<void>, requireConnection = false): Promise<OrgState> {
    if (this.busy) throw new Error("Organization discovery or a local change is already running.");
    this.mutating = true;
    try {
      const context = await this.context(requireConnection);
      if (!context) throw new Error("A valid current signed-in account scope is required.");
      await action(context);
      await this.guard(context);
      return this.state(context);
    } finally { this.mutating = false; }
  }

  async savePerson(input: OrgPersonInput): Promise<OrgState> {
    const value = orgPersonInputSchema.parse(input);
    return this.mutation(async context => {
      const partition = this.load(context);
      const upn = value.upn.toLowerCase();
      const byId = value.id ? partition.people.find(person => person.id === value.id) : undefined;
      if (value.id && !byId) throw new Error("The organization person no longer exists.");
      const byUpn = partition.people.find(person => person.upn.toLowerCase() === upn);
      if (byId && byUpn && byId.id !== byUpn.id) throw new Error("That UPN already belongs to another organization person.");
      const existing = byId ?? byUpn;
      const ids = [...new Set([...(byId ? [] : existing?.msxUserIds ?? []), ...value.msxUserIds].map(id => id.toLowerCase()))];
      if (partition.people.some(person => person.id !== existing?.id && person.msxUserIds.some(id => ids.includes(id.toLowerCase())))) {
        throw new Error("An MSX identity is already linked to a different person.");
      }
      const person: OrgPerson = {
        id: existing?.id ?? randomUUID(), name: value.name, upn, alias: upn.split("@")[0]!,
        jobTitle: value.jobTitle, org: value.org, msxUserIds: ids, source: "manual", updatedAt: new Date().toISOString(),
      };
      partition.people = partition.people.filter(item => item.id !== person.id).concat(person);
      await this.guard(context);
      this.write(context, partition);
    });
  }

  async removePerson(id: string): Promise<OrgState> {
    if (!z.uuid().safeParse(id).success) throw new Error("Invalid organization person ID.");
    return this.mutation(async context => {
      const partition = this.load(context);
      if (!partition.people.some(person => person.id === id)) return;
      partition.people = partition.people.filter(person => person.id !== id);
      await this.guard(context);
      this.write(context, partition);
    });
  }

  async importCatalog(select: () => Promise<OrgCatalog | null>): Promise<OrgImportResult | null> {
    let summary: OrgImportSummary | null = null;
    const state = await this.mutation(async context => {
      const catalog = await select();
      await this.guard(context);
      if (!catalog) return;
      const partition = this.load(context);
      const people = new Map(partition.people.map(person => [person.upn.toLowerCase(), person]));
      summary = { added: 0, updated: 0, preservedManual: 0, preservedNewer: 0, total: catalog.people.length };
      for (const profile of catalog.people) {
        const existing = people.get(profile.upn);
        if (existing?.source === "manual") { summary.preservedManual++; continue; }
        if (existing && Date.parse(existing.updatedAt) > Date.parse(catalog.generatedAt)) { summary.preservedNewer++; continue; }
        people.set(profile.upn, {
          ...profile, id: existing?.id ?? randomUUID(), alias: profile.upn.split("@")[0]!,
          msxUserIds: existing?.msxUserIds ?? [], source: "imported", updatedAt: catalog.generatedAt,
        });
        if (existing) summary.updated++;
        else summary.added++;
      }
      if (summary.added || summary.updated) {
        partition.people = [...people.values()];
        await this.guard(context);
        this.write(context, partition);
      }
    });
    return summary ? { state, summary } : null;
  }

  private async actors(context: Context, signal: AbortSignal): Promise<OrgActor[]> {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(this.limits.requestTimeoutMs)]);
    try {
      const actors = await abortable(this.options.resolveActors(requestSignal), requestSignal);
      await this.guard(context, signal);
      return actors;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ScopeError) throw error;
      throw new ActorLookupError("MSX milestone people could not be resolved. Check MSX sign-in and refresh the saved milestones before retrying.");
    }
  }

  private async link(context: Context, partition: Partition, signal: AbortSignal, resolved?: OrgActor[]): Promise<void> {
    signal = AbortSignal.any([signal, this.lifecycle.signal]);
    try {
      const actors = resolved ?? await this.actors(context, signal);
      await this.guard(context, signal);
      const byId = new Map<string, Set<string>>();
      for (const actor of actors) {
        if (!z.guid().safeParse(actor.msxUserId).success || !z.email().safeParse(actor.upn).success) continue;
        const id = actor.msxUserId.toLowerCase();
        const upns = byId.get(id) ?? new Set<string>();
        upns.add(actor.upn.toLowerCase());
        byId.set(id, upns);
      }
      const owners = new Map(partition.people.flatMap(person => person.msxUserIds.map(id => [id.toLowerCase(), person.id] as const)));
      let conflicts = false;
      for (const person of partition.people) {
        const ids = new Set(person.msxUserIds.map(id => id.toLowerCase()));
        for (const [id, upns] of byId) {
          if (!upns.has(person.upn.toLowerCase())) continue;
          if (upns.size !== 1 || (owners.has(id) && owners.get(id) !== person.id)) { conflicts = true; continue; }
          ids.add(id);
          owners.set(id, person.id);
        }
        person.msxUserIds = [...ids];
      }
      partition.linkError = conflicts ? "Some MSX identities had conflicting exact-UPN mappings; previous links were preserved." : null;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ScopeError) throw error;
      await this.guard(context, signal);
      partition.linkError = "MSX identity linking was unavailable. Previous valid links were preserved; retry Refresh links.";
    }
  }

  async refreshLinks(): Promise<OrgState> {
    if (this.busy) {
      const state = await this.getState();
      state.linkError ??= "MSX links will refresh after the current organization operation finishes.";
      return state;
    }
    return this.mutation(async context => {
      const partition = this.load(context);
      await this.link(context, partition, new AbortController().signal);
      await this.guard(context);
      this.write(context, partition);
    }, false);
  }

  async discover(onProgress: (progress: OrgProgress) => void): Promise<OrgState> {
    return this.startDiscovery("hierarchy", onProgress);
  }

  async discoverMilestonePeople(onProgress: (progress: OrgProgress) => void): Promise<OrgState> {
    return this.startDiscovery("milestones", onProgress);
  }

  private async startDiscovery(mode: OrgDiscoveryMode, onProgress: (progress: OrgProgress) => void): Promise<OrgState> {
    if (this.busy) throw new Error("Organization discovery or a local change is already running.");
    // Reserve synchronously before resolving identity to prevent overlapping start calls.
    this.mutating = true;
    let context: Context;
    try { context = (await this.context(true))!; }
    finally { this.mutating = false; }
    const progress: OrgProgress = {
      id: randomUUID(), mode, running: true, status: "running", stage: mode === "milestones" ? "resolving" : "identity", startedAt: new Date().toISOString(),
      finishedAt: null, root: null, currentPerson: null, visited: 0, queued: 0, matched: 0, saved: 0, requests: 0,
      warnings: [mode === "milestones"
        ? "Only people referenced by saved milestones are considered. Work IQ profiles may be unavailable; unresolved people remain Unknown."
        : "Experimental: Best-effort Work IQ hierarchy discovery is not reliable or exhaustive."],
      logs: [], error: null,
    };
    const job: Job = { context, controller: new AbortController(), progress, session: null, done: Promise.resolve(this.state(context)) };
    this.job = job;
    job.done = this.run(job, onProgress);
    return job.done;
  }

  private async run(job: Job, onProgress: (progress: OrgProgress) => void): Promise<OrgState> {
    const { context, progress, controller } = job;
    const duration = AbortSignal.timeout(this.limits.maxDurationMs);
    const signal = AbortSignal.any([controller.signal, duration]);
    const partition = this.load(context);
    let partial = false;
    let identityVerified = false;
    let resolvedActors: OrgActor[] | undefined;
    const emit = (message?: string) => {
      if (message) progress.logs = [...progress.logs, { at: new Date().toISOString(), message }].slice(-100);
      try { onProgress(copy(progress)); } catch { /* A closed renderer is not cancellation. */ }
    };
    const warn = (message: string) => {
      partial = true;
      if (!progress.warnings.includes(message)) progress.warnings = [...progress.warnings, message].slice(0, 50);
    };
    const check = () => {
      controller.signal.throwIfAborted();
      if (duration.aborted) throw new BudgetError("The discovery time budget was reached.");
    };
    const checkpoint = async () => {
      check();
      await this.guard(context, signal, true);
      check();
    };
    const query = async (upn: string, reports: boolean, correctFormat = false): Promise<OrgFacts> => {
      await checkpoint();
      if (progress.requests >= this.limits.maxRequests) throw new BudgetError("The Work IQ request budget was reached.");
      progress.requests++;
      progress.currentPerson = upn;
      emit(reports ? "Requesting the current person's immediate reports." : progress.mode === "milestones"
        ? "Requesting one milestone person's exact profile and job title."
        : "Requesting the current person's profile and immediate manager.");
      const timeout = AbortSignal.timeout(this.limits.requestTimeoutMs);
      let facts: OrgFacts;
      const requestSignal = AbortSignal.any([signal, timeout]);
      try {
        const request = correctFormat || progress.mode === "milestones"
          ? job.session!.query(upn, reports, requestSignal, { correctFormat, profileOnly: progress.mode === "milestones" })
          : job.session!.query(upn, reports, requestSignal);
        facts = await abortable(request, requestSignal);
      }
      catch (error) {
        check();
        await checkpoint();
        if (timeout.aborted) throw new BudgetError("A Work IQ profile request timed out.");
        if (error instanceof OrgResponseError && error.correctableFormat && !correctFormat) {
          emit("Work IQ returned malformed JSON. Requesting one format correction for the same exact profile; this counts against the request budget.");
          return query(upn, reports, true);
        }
        throw error;
      }
      await checkpoint();
      if (facts.person.upn.toLowerCase() !== upn.toLowerCase()) {
        throw new OrgResponseError("Work IQ returned a different exact UPN.");
      }
      if (!facts.complete) warn("Work IQ returned incomplete profile or relationship facts.");
      for (const limitation of facts.limitations) warn(limitation);
      return facts;
    };
    const matched = new Set<string>();
    const saved = new Set<string>();
    const accept = (profile: OrgProfile, includeUnknown = false) => {
      const org = classifyOrgTitle(profile.jobTitle);
      if (org === "Unknown" && !includeUnknown) return;
      const upn = profile.upn.toLowerCase();
      if (org !== "Unknown") matched.add(upn);
      const existing = partition.people.find(person => person.upn.toLowerCase() === upn);
      if (existing?.source === "manual" || existing?.source === "imported") return;
      const person: OrgPerson = {
        id: existing?.id ?? randomUUID(), name: profile.name, upn, alias: upn.split("@")[0]!, jobTitle: profile.jobTitle,
        org, msxUserIds: existing?.msxUserIds ?? [], source: "discovered", updatedAt: new Date().toISOString(),
      };
      partition.people = partition.people.filter(item => item.id !== person.id).concat(person);
      saved.add(upn);
      progress.saved = saved.size;
    };
    try {
      emit(progress.mode === "milestones" ? "Resolving the people referenced by saved milestones; no manager chain is required."
        : "Starting experimental organization hierarchy discovery.");
      await checkpoint();
      if (progress.mode === "milestones") {
        resolvedActors = await this.actors(context, signal);
        await checkpoint();
      }
      const openingTimeout = AbortSignal.timeout(this.limits.requestTimeoutMs);
      const openingSignal = AbortSignal.any([signal, openingTimeout]);
      const opening = (this.options.openSession ?? openOrgWorkiqSession)(this.options.getConnection().workiq, signal);
      // Close even a late factory result after cancellation/timeout.
      void opening.then(session => { if (openingSignal.aborted) void session.close().catch(() => {}); }, () => {});
      try { job.session = await abortable(opening, openingSignal); }
      catch (error) {
        if (openingTimeout.aborted) throw new BudgetError("The Work IQ session startup timed out.");
        throw error;
      }
      await checkpoint();
      if (progress.mode === "milestones") {
        if (!resolvedActors) throw new ActorLookupError("Milestone people were not resolved; no profile lookup was started.");
        identityVerified = true;
        const byId = new Map<string, Set<string>>();
        for (const actor of resolvedActors) {
          if (!z.guid().safeParse(actor.msxUserId).success || !z.email().safeParse(actor.upn).success) {
            warn("An MSX milestone person had no valid exact user ID/UPN and was skipped.");
            continue;
          }
          const id = actor.msxUserId.toLowerCase();
          const upns = byId.get(id) ?? new Set<string>();
          upns.add(actor.upn.toLowerCase());
          byId.set(id, upns);
        }
        const queue = [...new Set([...byId.values()].filter(upns => {
          if (upns.size !== 1) warn("A milestone user ID had conflicting UPNs and was skipped.");
          return upns.size === 1;
        }).flatMap(upns => [...upns]))];
        progress.stage = "profiles";
        progress.queued = queue.length;
        emit(`${queue.length} unique milestone people resolved for exact-profile lookup.`);
        if (!queue.length) warn("No eligible person identities were resolved from saved milestones. Fetch or refresh milestones before retrying.");
        while (queue.length) {
          await checkpoint();
          if (progress.visited >= this.limits.maxPeople) throw new BudgetError("The visited-person budget was reached.");
          if (progress.requests >= this.limits.maxRequests) throw new BudgetError("The Work IQ request budget was reached.");
          const upn = queue.shift()!;
          progress.visited++;
          progress.queued = queue.length;
          try {
            const facts = await query(upn, false);
            accept(facts.person, true);
          } catch (error) {
            if (!(error instanceof OrgResponseError)) throw error;
            warn(`A milestone profile was rejected: ${error.message} Other milestone people will still be checked.`);
            emit(`Milestone profile rejected: ${error.message}`);
          }
          progress.matched = matched.size;
          progress.stage = "linking";
          await this.link(context, partition, signal, resolvedActors);
          if (partition.linkError) warn(partition.linkError);
          await checkpoint();
          this.write(context, partition);
          progress.stage = "profiles";
          emit(`${progress.saved} milestone profiles saved so far; ${progress.matched} matched CSU, STU or ATU. Unknown roles can be reviewed in Manage.`);
        }
      } else {
        let facts = await query(context.identity.upn, false);
        if (facts.person.upn.toLowerCase() !== context.identity.upn) {
          throw new OrgResponseError("The returned profile does not match the current MSX UPN. No organization traversal was performed.");
        }
        identityVerified = true;
        progress.stage = "climbing";
        const chain = [facts.person];
        const upward = new Set<string>([facts.person.upn.toLowerCase()]);
        let root: OrgProfile | null = isOrgBoundary(facts.person.jobTitle) ? facts.person : null;
        for (let hop = 0; !root; hop++) {
          if (hop >= this.limits.maxUpwardHops) throw new BudgetError("The immediate-manager hop budget was reached before an explicit boundary.");
          const manager = facts.manager;
          if (!manager) { warn("No explicit CVP or country-head boundary could be established from immediate managers."); break; }
          const upn = manager.upn.toLowerCase();
          if (upward.has(upn)) { warn("A cycle was found in the immediate-manager chain."); break; }
          upward.add(upn);
          chain.push(manager);
          if (isOrgBoundary(manager.jobTitle)) root = manager;
          else {
            facts = await query(upn, false);
            chain[chain.length - 1] = facts.person;
          }
        }
        if (root) {
          progress.root = root;
          progress.stage = "descending";
          partition.root = root;
          const queue: Array<{ person: OrgProfile; depth: number }> = [{ person: root, depth: 0 }];
          const scheduled = new Set<string>([root.upn.toLowerCase()]);
          const visited = new Set<string>();
          const knownChildren = new Map<string, OrgProfile>();
          for (let index = 1; index < chain.length; index++) {
            knownChildren.set(chain[index]!.upn.toLowerCase(), chain[index - 1]!);
          }
          while (queue.length) {
            await checkpoint();
            if (visited.size >= this.limits.maxPeople) throw new BudgetError("The visited-person budget was reached.");
            const item = queue.shift()!;
            const upn = item.person.upn.toLowerCase();
            visited.add(upn);
            progress.visited = visited.size;
            progress.queued = queue.length;
            progress.currentPerson = upn;
            let person = item.person;
            let reports: OrgProfile[] = [];
            let requestedReports = false;
            if (item.depth === 0 || person.hasReports !== false || knownChildren.has(upn)) {
              if (item.depth >= this.limits.maxDepth) {
                warn("The downward-depth budget was reached; potential reports were not requested.");
              } else {
                try {
                  requestedReports = true;
                  const result = await query(upn, true);
                  person = result.person;
                  reports = result.reports;
                  if (person.hasReports === false && reports.length) warn("Work IQ returned conflicting direct-report facts.");
                  if (person.hasReports === true && reports.length === 0) warn("A manager's direct reports were unavailable.");
                } catch (error) {
                  if (!(error instanceof OrgResponseError)) throw error;
                  warn(`An immediate-reports response was rejected: ${error.message} The branch may be incomplete.`);
                  emit(`Immediate-reports response rejected: ${error.message}`);
                }
              }
            }
            const knownChild = knownChildren.get(upn);
            if (knownChild && item.depth < this.limits.maxDepth && !reports.some(report => report.upn.toLowerCase() === knownChild.upn.toLowerCase())) {
              if (requestedReports) warn("A report list omitted an already verified reporting-chain member; coverage is partial.");
              reports.push(knownChild);
              emit("Continuing along the already verified reporting path; no additional relationship was inferred.");
            }
            accept(person);
            for (const report of reports) {
              const reportUpn = report.upn.toLowerCase();
              if (scheduled.has(reportUpn)) { warn("A duplicate or cyclic direct-report relationship was skipped."); continue; }
              if (scheduled.size >= this.limits.maxPeople) { warn("The person budget limited additional direct reports."); break; }
              scheduled.add(reportUpn);
              accept(report);
              queue.push({ person: report, depth: item.depth + 1 });
            }
            progress.queued = queue.length;
            progress.matched = matched.size;
            await checkpoint();
            this.write(context, partition);
            emit(`${progress.saved} validated role matches saved so far; unmatched connector profiles remain transient.`);
          }
        }
      }
      await checkpoint();
      progress.stage = "linking";
      emit("Linking exact UPNs to already-referenced MSX identities.");
      await this.link(context, partition, signal, resolvedActors);
      await checkpoint();
      this.write(context, partition);
      if (partition.linkError) warn(partition.linkError);
      progress.status = partial ? "partial" : "complete";
    } catch (error) {
      if (controller.signal.aborted || error instanceof ScopeError) {
        progress.status = "cancelled";
        warn(error instanceof ScopeError ? error.message : "Discovery was cancelled; previously validated saved matches were preserved.");
      } else if (error instanceof BudgetError || duration.aborted || (identityVerified && error instanceof OrgResponseError)) {
        progress.status = "partial";
        warn(error instanceof BudgetError ? error.message : error instanceof OrgResponseError
          ? `Discovery stopped after a rejected profile response: ${error.message}`
          : "Discovery stopped after the time budget was reached.");
        if (identityVerified && !duration.aborted) {
          try {
            await checkpoint();
            progress.stage = "linking";
            await this.link(context, partition, signal, resolvedActors);
            await checkpoint();
            this.write(context, partition);
            if (partition.linkError) warn(partition.linkError);
          } catch {
            // Cancellation/account switches must not turn a partial result into a late write.
            if (controller.signal.aborted) progress.status = "cancelled";
          }
        }
      } else {
        progress.status = "failed";
        progress.error = error instanceof OrgResponseError
          ? `Work IQ profile response was rejected: ${error.message} No unverified profile was saved.`
          : error instanceof OrgWorkiqError || error instanceof ActorLookupError ? error.message
            : progress.mode === "milestones"
              ? "Milestone-person discovery failed. Check the existing Work IQ client's access; previously saved profiles and manual corrections were preserved."
              : !identityVerified
              ? "Work IQ could not retrieve the signed-in MSX user's exact profile. Check the existing client's account and approved access."
              : "Work IQ discovery failed. Previously validated saved results were preserved.";
      }
    } finally {
      if (job.session) {
        try { await job.session.close(); }
        catch {
          warn("The Work IQ process did not confirm clean shutdown.");
          if (progress.status === "complete") progress.status = "partial";
        }
      }
      progress.running = false;
      progress.stage = "finished";
      progress.currentPerson = null;
      progress.finishedAt = new Date().toISOString();
      const current = await this.context().catch(() => null);
      const sameScope = current?.scope === context.scope && current.identity.upn === context.identity.upn;
      if (sameScope) {
        this.lastProgress = { scope: context.scope, upn: context.identity.upn, progress: copy(progress) };
        emit("Best-effort discovery finished; saved results may be incomplete.");
      }
      if (this.job === job) this.job = null;
    }
    return this.getState();
  }

  async cancel(): Promise<OrgState> {
    const job = this.job;
    if (job) {
      job.controller.abort(new Error("Organization discovery cancelled."));
      if (job.session) void job.session.close().catch(() => {});
      await job.done;
    }
    return this.getState();
  }

  async clear(): Promise<void> {
    this.epoch++;
    this.lifecycle.abort(new Error("Organization data was reset."));
    this.lifecycle = new AbortController();
    await this.cancel();
    const context = await this.context();
    if (context) {
      await this.guard(context);
      this.store.delete(KIND, context.scope);
    }
    this.lastProgress = null;
  }
}
